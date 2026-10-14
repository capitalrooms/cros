/**
 * /api/admin/website — the Website section in CROS (migration 221).
 *   GET                                   → { posts, rooms, documents, setupNeeded? }
 *   POST { action: 'save_post', post }    → create or update a post (id absent = new)
 *   POST { action: 'delete_post', id }
 *   POST { action: 'import_old' }         → the posts copied from the old GNB site (lib/website/oldSitePosts.json),
 *                                           added once each (skipped when a post with that address exists)
 *   POST { action: 'room', roomId, show } → show or hide an available room on the website
 *   POST { action: 'upload', fileName, mimeType } → a signed upload to the public 'website' bucket
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { slugify } from '@/lib/website/markdown'
import oldPosts from '@/lib/website/oldSitePosts.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORIES = ['tenants', 'landlords', 'area', 'rooms', 'news']
const missing = (e: { message?: string } | null) => !!e && /website_posts|show_on_website|does not exist|schema cache/.test(e.message ?? '')
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim()

/** The documents copied from the old site's footer — public files on our own site (public/website/documents). */
const DOCUMENTS = [
  { label: 'Client Money Protection certificate', path: '/website/documents/client-money-protection-certificate.pdf' },
  { label: 'Anti-money laundering certificate', path: '/website/documents/aml-certificate.pdf' },
  { label: 'Complaints procedure', path: '/website/documents/complaints-procedure.pdf' },
]

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const [{ data: posts, error }, { data: rooms, error: rErr }] = await Promise.all([
    s.from('website_posts').select('*').order('shown_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }),
    s.from('rooms').select('id, name, status, current_asking_rent, available_date, show_on_website, properties(name, letting_type, is_demo)').in('status', ['available', 'on_notice']).order('available_date', { ascending: true, nullsFirst: false }),
  ]) as any[]
  if (missing(error) || missing(rErr)) return NextResponse.json({ setupNeeded: true, posts: [], rooms: [], documents: DOCUMENTS, oldCount: oldPosts.length })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    posts: posts ?? [],
    rooms: ((rooms ?? []) as any[]).filter(r => !r.properties?.is_demo).map(r => ({
      id: r.id, name: r.name, house: firstLine(r.properties?.name), letOnly: r.properties?.letting_type === 'let_only',
      status: r.status, rent: r.current_asking_rent, availableDate: r.available_date, show: !!r.show_on_website,
    })),
    documents: DOCUMENTS,
    oldCount: oldPosts.length,
  })
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const by = (caller as { email?: string }).email ?? 'office'
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const now = new Date().toISOString()

  if (b.action === 'save_post') {
    const p = b.post ?? {}
    const title = String(p.title ?? '').trim().slice(0, 200)
    if (!title) return NextResponse.json({ error: 'Give the post a title' }, { status: 400 })
    const slug = slugify(String(p.slug || title)) || slugify(title)
    if (!slug) return NextResponse.json({ error: 'The address needs some letters or numbers' }, { status: 400 })
    const row = {
      slug, title,
      excerpt: String(p.excerpt ?? '').trim().slice(0, 300) || null,
      body: String(p.body ?? '').slice(0, 100_000),
      cover_url: String(p.cover_url ?? '').trim() || null,
      category: CATEGORIES.includes(p.category) ? p.category : 'tenants',
      status: p.status === 'published' ? 'published' : 'draft',
      publish_at: p.status === 'published' && p.publish_at ? new Date(p.publish_at).toISOString() : null,
      shown_date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.shown_date ?? '')) ? p.shown_date : (p.status === 'published' ? now.slice(0, 10) : null),
      note: String(p.note ?? '').trim().slice(0, 1000) || null,
      updated_by: by, updated_at: now,
    }
    const res = p.id
      ? await s.from('website_posts').update(row).eq('id', p.id).select('*').single()
      : await s.from('website_posts').insert({ ...row, created_by: by }).select('*').single()
    if (res.error) return NextResponse.json({ error: /duplicate|unique/.test(res.error.message) ? 'Another post already uses that address — change the address' : missing(res.error) ? 'Run migration 221 first' : res.error.message }, { status: 400 })
    return NextResponse.json({ ok: true, post: res.data })
  }

  if (b.action === 'delete_post') {
    const { error } = await s.from('website_posts').delete().eq('id', String(b.id ?? ''))
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }

  if (b.action === 'import_old') {
    const { data: have, error } = await s.from('website_posts').select('slug')
    if (error) return NextResponse.json({ error: missing(error) ? 'Run migration 221 first' : error.message }, { status: 400 })
    const taken = new Set(((have ?? []) as { slug: string }[]).map(r => r.slug))
    const rows = (oldPosts as any[]).filter(p => !taken.has(p.slug)).map(p => ({
      slug: p.slug, title: p.title, excerpt: p.excerpt || null, body: p.body, cover_url: p.cover, category: p.category,
      status: p.publish ? 'published' : 'draft', shown_date: p.date, old_path: p.old_path, note: p.note,
      created_by: `${by} (from the old site)`, updated_by: by,
    }))
    if (rows.length) {
      const { error: insErr } = await s.from('website_posts').insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, added: rows.length, skipped: oldPosts.length - rows.length })
  }

  if (b.action === 'room') {
    const { error } = await s.from('rooms').update({ show_on_website: !!b.show }).eq('id', String(b.roomId ?? ''))
    return error ? NextResponse.json({ error: missing(error) ? 'Run migration 221 first' : error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }

  if (b.action === 'upload') {
    const mime = String(b.mimeType ?? '')
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) return NextResponse.json({ error: 'Pictures only — JPG, PNG, WebP or GIF' }, { status: 400 })
    const ext = mime.split('/')[1].replace('jpeg', 'jpg')
    const path = `advice/${now.slice(0, 10)}-${Math.random().toString(36).slice(2, 10)}.${ext}`
    const { data, error } = await s.storage.from('website').createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ error: /not found/i.test(error?.message ?? '') ? 'Run migration 221 first (it creates the website picture folder)' : error?.message ?? 'Could not start the upload' }, { status: 400 })
    const { data: pub } = s.storage.from('website').getPublicUrl(path)
    return NextResponse.json({ ok: true, path, token: data.token, publicUrl: pub.publicUrl })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// /api/admin/maintenance/jobs/<id> — change a job after it's made (26 Oct 2026, Harry: "make existing jobs in the admin
// panel editable so more information or photos can be added once it is set up").
//   GET                         → { job, photos: [{ id, url, name }], rooms } — photos as short-lived private links
//   PATCH { title, description, category, priority, location, room_id }   → saves what's sent; logged in the history
//   POST  multipart file=…      → adds a photo (shrunk in the browser first) to the job
// Office staff with Maintenance (lib/access/areas: /api/admin/maintenance).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { signedLinkFor } from '@/lib/files/server'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const PRIORITIES = ['low', 'medium', 'high', 'emergency']
const BUCKET = 'maintenance-photos'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const s = createServiceClient()
  const { data: job } = await s.from('maintenance_tickets').select('id, title, description, category, priority, location, room_id, property_id, before_photo, after_photo').eq('id', id).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const [{ data: files }, { data: rooms }] = await Promise.all([
    s.from('attachments').select('id, file_name, storage_url, attachment_type, created_at').eq('ticket_id', id).order('created_at'),
    job.property_id ? s.from('rooms').select('id, name').eq('property_id', job.property_id) : Promise.resolve({ data: [] as any[] }),
  ])
  const all = [
    ...((files ?? []) as any[]).filter(f => f.attachment_type === 'photo' && f.storage_url).map(f => ({ id: f.id, src: f.storage_url, name: f.file_name ?? 'Photo' })),
    ...(job.before_photo ? [{ id: 'before', src: job.before_photo, name: 'Before (contractor)' }] : []),
    ...(job.after_photo ? [{ id: 'after', src: job.after_photo, name: 'After (contractor)' }] : []),
  ]
  const photos = (await Promise.all(all.map(async p => ({ id: p.id, name: p.name, url: await signedLinkFor(p.src, 3600) })))).filter(p => p.url)
  const roomNo = (n: string) => Number(String(n).match(/\d+/)?.[0] ?? 999)
  return NextResponse.json({ job, photos, rooms: ((rooms ?? []) as any[]).sort((a, b) => roomNo(a.name) - roomNo(b.name) || a.name.localeCompare(b.name)) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: before } = await s.from('maintenance_tickets').select('title, description, category, priority, location, room_id, property_id').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (typeof b.title === 'string') { const t = b.title.trim().slice(0, 200); if (!t) return NextResponse.json({ error: 'The job needs a title.' }, { status: 400 }); patch.title = t }
  if (typeof b.description === 'string') patch.description = b.description.trim().slice(0, 8000)
  if (typeof b.category === 'string' && b.category.trim()) patch.category = b.category.trim().slice(0, 60)
  if (typeof b.priority === 'string') { if (!PRIORITIES.includes(b.priority)) return NextResponse.json({ error: 'Pick a priority.' }, { status: 400 }); patch.priority = b.priority }
  if (typeof b.location === 'string') patch.location = b.location.trim().slice(0, 80) || null
  if (b.room_id !== undefined) {
    if (b.room_id) {
      const { data: room } = await s.from('rooms').select('id').eq('id', String(b.room_id)).eq('property_id', before.property_id).maybeSingle()
      if (!room) return NextResponse.json({ error: 'That room isn’t at this house.' }, { status: 400 })
    }
    patch.room_id = b.room_id || null
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true })
  const { error } = await s.from('maintenance_tickets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const changed = Object.keys(patch).filter(k => (before as any)[k] !== patch[k])
  await logAudit({ userId: caller.personId ?? caller.userId, action: 'update', table: 'maintenance_tickets', recordId: id, details: `Job edited by ${caller.email}: ${changed.join(', ') || 'no change'}` }).catch(() => null)
  return NextResponse.json({ ok: true, changed })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const s = createServiceClient()
  const { data: job } = await s.from('maintenance_tickets').select('id').eq('id', id).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a photo.' }, { status: 400 })
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return NextResponse.json({ error: 'That isn’t a photo (JPEG, PNG or WebP).' }, { status: 400 })
  if (file.size > 4_000_000) return NextResponse.json({ error: 'That photo is too big — try again (it’s shrunk automatically).' }, { status: 413 })
  const name = String((file as File).name || 'photo.jpg').replace(/[^\w.\-]+/g, '-').slice(-80)
  const path = `${id}/${Date.now()}-office-${name}`
  const { error: upErr } = await s.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  const storage_url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`   // the same form the tenant form stores
  const { data: row, error } = await s.from('attachments').insert({
    ticket_id: id, attachment_type: 'photo', file_name: `[office] ${name}`, file_path: path, file_size: file.size, storage_url, uploaded_by: caller.personId ?? null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: row.id, url: await signedLinkFor(storage_url, 3600) })
}

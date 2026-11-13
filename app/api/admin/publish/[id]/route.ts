/**
 * One piece in Publish (migration 285, lib/publish).
 *   GET                                  → the piece, who it reaches (and who's opted out), every channel's version, the send log
 *   PATCH { title, intro, body, sms_text, push_title, push_body, social_caption, areas, audience, channels }
 *                                        → saved (only while it's a draft or approved — editing an approved piece makes it a draft again)
 *   POST { action: 'test' }              → the email (and text) to you only
 *   POST { action: 'approve' | 'unapprove' }
 *   POST { action: 'schedule', at }      → goes out then (the hourly job sends it)
 *   POST { action: 'send' }              → one batch now; call again while `remaining` > 0 (the screen does)
 *   POST { action: 'website' | 'unpublish' } → the post on capitalrooms.co.uk
 *   POST { action: 'pdf' }               → the PDF letter (shared version)
 *   POST { action: 'delete' }            → a draft that hasn't been sent
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { lookFor, resolveAudience, emailFor, smsFor, pushFor, captionFor, runSend, websiteMarkdown, webLink, CHANNELS, LISTS, LONDON, SITE_URL, type Pub } from '@/lib/publish'
import { reportPacks, reportPdf, reportCommentary } from '@/lib/rents/report'
import { buildEmail } from '@/lib/emailWrapper'
import { sendEmail } from '@/lib/sendEmail'
import { sendSms } from '@/lib/sms'
import { slugify } from '@/lib/website/markdown'
import { SCENES, ILLUSTRATIONS, seasonNow } from '@/lib/publish/pictures'
import { writePublication, TONES, REWRITES } from '@/lib/publish/write'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function load(id: string) {
  const { data } = await createServiceClient().from('publications').select('*').eq('id', id).maybeSingle()
  return data as Pub | null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const p = await load((await params).id)
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { people, optedOut } = await resolveAudience(s, p)
  const sample = people[0] ?? { personId: null, name: 'Sample Landlord', email: null, phone: null, landlord: true, dear: 'Dear Mr Sample,' }
  // the preview is the shared version (a landlord's own areas are filled in when it's sent)
  const e = await emailFor(s, { ...p, audience: { ...p.audience, ownAreas: false }, channels: { ...p.channels, pdf: false } }, sample, {})
  let { data: sends, error: sErr } = await s.from('publication_sends').select('channel, name, address, status, note, at, variant, delivered_at, opened_at, clicked_at, opens, clicks, links, bounced').eq('publication_id', p.id).order('at', { ascending: false }).limit(1000) as { data: any[] | null; error: any }
  if (sErr) ({ data: sends } = await s.from('publication_sends').select('channel, name, address, status, note, at').eq('publication_id', p.id).order('at', { ascending: false }).limit(1000) as any)   // before migration 287
  // the report, as Mailchimp shows it: delivered, opened, clicked (each person once), the links clicked, who engaged
  const em = (sends ?? []).filter((x: any) => x.channel === 'email' && x.status === 'sent')
  const linkTotals: Record<string, number> = {}
  for (const x of em) for (const [u, n] of Object.entries(x.links ?? {})) linkTotals[u] = (linkTotals[u] ?? 0) + Number(n)
  const report = {
    trackingReady: !!process.env.RESEND_EVENTS_SECRET,
    sent: em.length, delivered: em.filter((x: any) => x.delivered_at).length, bounced: em.filter((x: any) => x.bounced).length,
    opened: em.filter((x: any) => x.opened_at).length, clicked: em.filter((x: any) => x.clicked_at).length,
    links: Object.entries(linkTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([url, clicks]) => ({ url, clicks })),
    byVariant: ['A', 'B'].map(v => { const r = em.filter((x: any) => (x.variant ?? 'A') === v); return { v, sent: r.length, opened: r.filter((x: any) => x.opened_at).length, clicked: r.filter((x: any) => x.clicked_at).length } }).filter(x => x.sent),
  }
  const areas = p.areas.length ? p.areas : [LONDON]
  const { data: names } = await s.from('ons_rents').select('area_code, area_name').in('area_code', areas)
  // the pictures to choose from: the figures in three looks, this season's scenes first, the illustrations, our photos
  const season = seasonNow()
  const { data: photos } = await s.from('property_photos').select('id, file_url, file_path, property_id, properties(name)').order('created_at', { ascending: false }).limit(30) as { data: any[] | null }
  const photoUrl = (x: any) => x.file_url || s.storage.from('property-photos').getPublicUrl(String(x.file_path)).data.publicUrl
  const pictures = {
    figures: [['dark', 'Dark green'], ['light', 'Light'], ['gold', 'Gold']].map(([k, l]) => ({ key: `figures:${k}`, label: l, thumb: `${SITE_URL}/api/publish/image/${p.id}?size=square&k=figures:${k}` })),
    scenes: [...SCENES.filter(x => x.endsWith(season)), ...SCENES.filter(x => !x.endsWith(season))].map(k => ({ key: `scene:${k}`, label: k.replace('-', ' · '), thumb: `${SITE_URL}/email/insight/${k}.png` })),
    illustrations: ILLUSTRATIONS.map(i => ({ key: `illus:${i.key}`, label: i.label, thumb: `${SITE_URL}/publish/illustrations/${i.key}.png` })),
    photos: (photos ?? []).map(x => ({ key: `photo:${x.id}`, label: String(x.properties?.name ?? '').split(/\n|,/)[0], thumb: photoUrl(x) })),
  }
  const { THEMES } = await import('@/lib/email/themes')
  const { BLOCK_TYPES } = await import('@/lib/publish/blocks')
  return NextResponse.json({
    looks: THEMES.map(t => ({ key: t.key, name: t.name })), blockTypes: BLOCK_TYPES.map(b => ({ type: b.type, label: b.label, make: b.make() })),
    pub: p, channels: CHANNELS, lists: LISTS, pictures,
    areaNames: areas.map(c => (names ?? []).find((n: any) => n.area_code === c)?.area_name ?? c),
    reach: { total: people.length, email: people.filter(x => x.email).length, sms: people.filter(x => x.phone).length, push: people.filter(x => x.personId).length, optedOut: optedOut.length, sample: people.slice(0, 40).map(x => ({ name: x.name, email: x.email, phone: x.phone, landlord: x.landlord })) },
    previews: {
      email: { subject: e.subject, html: await buildEmail(e.html, { req, kind: 'publication', theme: lookFor(p) }) },
      sms: smsFor(p, { ...sample, phone: sample.phone ?? '07700900000' }),
      push: pushFor(p),
      caption: captionFor(p),
      images: { square: `${SITE_URL}/api/publish/image/${p.id}?size=square&v=${encodeURIComponent(String((p as any).updated_at ?? ''))}`, wide: `${SITE_URL}/api/publish/image/${p.id}?size=wide&v=${encodeURIComponent(String((p as any).updated_at ?? ''))}` },
      website: webLink(p),
    },
    log: sends ?? [], report,
  })
}

const EDITABLE = ['title', 'intro', 'body', 'sms_text', 'push_title', 'push_body', 'social_caption', 'areas', 'audience', 'channels', 'image', 'preheader', 'blocks', 'template', 'ab']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const p = await load((await params).id)
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (['sending', 'sent'].includes(p.status)) return NextResponse.json({ error: 'It’s already gone out — make a new one to change it.' }, { status: 409 })
  const b = await req.json().catch(() => ({}))
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE) if (k in b) set[k] = k === 'areas' ? (Array.isArray(b.areas) ? b.areas.map(String).slice(0, 3) : []) : b[k]
  if (p.status !== 'draft') { set.status = 'draft'; set.approved_at = null; set.approved_by = null; set.scheduled_for = null }   // changed after approval → approve again
  const { error } = await createServiceClient().from('publications').update(set).eq('id', p.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: set.status ?? p.status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const p = await load((await params).id)
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const b = await req.json().catch(() => ({}))

  if (b.action === 'test') {
    const { data: who } = await s.from('people').select('id, salutation, first_name, last_name, phone').eq('id', me.personId).maybeSingle() as { data: any }
    const x = { personId: null, name: [who?.first_name, who?.last_name].filter(Boolean).join(' ') || 'you', email: me.email, phone: who?.phone ?? null, landlord: true, dear: `Dear ${who?.first_name ?? 'you'},` }
    const e = await emailFor(s, { ...p, audience: { ...p.audience, ownAreas: false } }, x, {})
    const r = await sendEmail(me.email, `[Test] ${e.subject}`, e.html, { req, kind: 'publication', theme: lookFor(p), ...(e.pdf ? { attachments: [e.pdf] } : {}) })
    let text = ''
    if (p.channels?.sms && x.phone) { const t = await sendSms(x.phone, smsFor(p, x)).catch(() => ({ ok: false })); text = t.ok ? ' and the text to your mobile' : ' (the test text didn’t send)' }
    return r.ok ? NextResponse.json({ ok: true, message: `Test sent to ${me.email}${text}.` }) : NextResponse.json({ error: r.error || 'The test didn’t send' }, { status: 502 })
  }
  if (b.action === 'approve' || b.action === 'unapprove') {
    if (['sending', 'sent'].includes(p.status)) return NextResponse.json({ error: 'It’s already gone out.' }, { status: 409 })
    if (b.action === 'approve' && !String(p.body ?? '').trim() && p.kind === 'announcement') return NextResponse.json({ error: 'Write the message first.' }, { status: 400 })
    // nothing goes out with a gap the writer left for us to fill
    const gaps = b.action === 'approve' ? [p.title, p.intro, p.body, p.sms_text, p.push_title, p.push_body, p.social_caption].join(' ').match(/\[[^\]]{2,60}\]/g) : null
    if (gaps?.length) return NextResponse.json({ error: `Fill in ${[...new Set(gaps)].join(', ')} first.` }, { status: 400 })
    await s.from('publications').update(b.action === 'approve' ? { status: 'approved', approved_by: me.email, approved_at: new Date().toISOString() } : { status: 'draft', approved_by: null, approved_at: null, scheduled_for: null }).eq('id', p.id)
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'schedule') {
    if (!['approved', 'scheduled'].includes(p.status)) return NextResponse.json({ error: 'Approve it first.' }, { status: 409 })
    const at = new Date(String(b.at ?? ''))
    if (isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000) return NextResponse.json({ error: 'Choose a time in the future.' }, { status: 400 })
    await s.from('publications').update({ status: 'scheduled', scheduled_for: at.toISOString() }).eq('id', p.id)
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'send') {
    if (!['approved', 'scheduled', 'sending'].includes(p.status)) return NextResponse.json({ error: 'Approve it first.' }, { status: 409 })
    if (!['email', 'sms', 'push'].some(k => (p.channels as any)?.[k])) return NextResponse.json({ error: 'Choose at least one of email, text or app notification.' }, { status: 400 })
    const r = await runSend(s, p, 240_000)
    return NextResponse.json({ ok: true, ...r })
  }
  if (b.action === 'website' || b.action === 'unpublish') {
    if (b.action === 'unpublish') {
      if (p.website_slug) await s.from('website_posts').update({ status: 'draft' }).eq('slug', p.website_slug)
      await s.from('publications').update({ website_published_at: null }).eq('id', p.id)
      return NextResponse.json({ ok: true })
    }
    if (!['approved', 'scheduled', 'sending', 'sent'].includes(p.status)) return NextResponse.json({ error: 'Approve it first.' }, { status: 409 })
    const slug = p.website_slug || `${slugify(p.title)}`.slice(0, 70)
    const today = new Date().toISOString().slice(0, 10)
    const post = { slug, title: p.title, excerpt: p.intro || null, body: await websiteMarkdown(s, p), cover_url: `${SITE_URL}/api/publish/image/${p.id}?size=wide`, category: 'landlords', status: 'published', shown_date: today, publish_at: null }
    const { data: there } = await s.from('website_posts').select('slug').eq('slug', slug).maybeSingle()
    const { error } = there ? await s.from('website_posts').update(post).eq('slug', slug) : await s.from('website_posts').insert(post)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await s.from('publications').update({ website_slug: slug, website_published_at: new Date().toISOString() }).eq('id', p.id)
    return NextResponse.json({ ok: true, url: `${SITE_URL}/blogs/${slug}` })
  }
  if (b.action === 'pdf') {
    if (p.kind !== 'market_update') return NextResponse.json({ error: 'PDF letters are for market updates for now.' }, { status: 400 })
    const packs = await reportPacks(s, p.areas.length ? p.areas : [LONDON])
    const pdf = await reportPdf(packs, p.body ?? '', null)
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Market update.pdf"' } })
  }
  // the writer (lib/publish/write): rough notes (or a rewrite of what's there) → every version at once, saved as a draft
  if (b.action === 'write') {
    if (['sending', 'sent'].includes(p.status)) return NextResponse.json({ error: 'It’s already gone out.' }, { status: 409 })
    const brief = String(b.brief ?? '').trim()
    if (!b.rewrite && brief.length < 8) return NextResponse.json({ error: 'Say what you want to tell them — a line or two of notes is enough.' }, { status: 400 })
    try {
      const w = await writePublication(s, {
        brief, tone: (b.tone in TONES ? b.tone : 'friendly'), length: b.length === 'short' ? 'short' : 'standard',
        audience: (p.audience?.lists ?? []).includes('all_landlords') ? 'its landlords' : 'landlords and contacts',
        withMarket: !!b.withMarket, areas: p.areas,
        ...(b.rewrite && b.rewrite in REWRITES ? { rewrite: b.rewrite, current: { title: p.title, intro: p.intro ?? '', preheader: p.preheader ?? '', body: p.body ?? '', sms_text: p.sms_text ?? '', push_title: p.push_title ?? '', push_body: p.push_body ?? '', social_caption: p.social_caption ?? '' } } : {}),
      })
      const row: Record<string, unknown> = { title: w.title, intro: w.intro, preheader: w.preheader, body: w.body, sms_text: w.sms_text, push_title: w.push_title, push_body: w.push_body, social_caption: w.social_caption, status: 'draft', approved_at: null, approved_by: null, updated_at: new Date().toISOString() }
      const up = await s.from('publications').update(row).eq('id', p.id)
      if (up.error && /preheader/.test(up.error.message)) { delete row.preheader; await s.from('publications').update(row).eq('id', p.id) }   // before migration 287
      return NextResponse.json({ ok: true, missing: w.missing })
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'The writing didn’t work — try again' }, { status: 502 }) }
  }
  if (b.action === 'rewrite') {
    if (p.kind !== 'market_update' || ['sending', 'sent'].includes(p.status)) return NextResponse.json({ error: 'Only a market update that hasn’t gone out.' }, { status: 409 })
    const words = await reportCommentary(await reportPacks(s, p.areas.length ? p.areas : [LONDON]), null).catch(() => '')
    if (words.length < 200) return NextResponse.json({ error: 'The commentary couldn’t be written just now — try again.' }, { status: 502 })
    await s.from('publications').update({ body: words, status: 'draft', approved_at: null, approved_by: null, updated_at: new Date().toISOString() }).eq('id', p.id)
    return NextResponse.json({ ok: true, body: words })
  }
  if (b.action === 'delete') {
    if (!['draft', 'approved'].includes(p.status)) return NextResponse.json({ error: 'Only something that hasn’t gone out can be deleted.' }, { status: 409 })
    await s.from('publications').delete().eq('id', p.id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// Improvements noted at a house (migration 272 — lib/house/improvements).
//   GET ?propertyId=[&roomId=]   → { ready, items }   (a room's own, or the whole house's with each room's)
//   PATCH { id, status?, note? }
//   POST { action: 'draft', ids, to: 'landlord'|'contractor' } → { subject, message, landlordEmail }
//   POST { action: 'send', ids, to, emails, subject, message }  → emailed; each note marked sent / quoting and logged
//   POST { action: 'redesign', id, image }                      → three redesigns of the photo (OpenAI — lib/house/redesign)
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { draftImprovements } from '@/lib/house/improvements'
import { redesign, redesignReady, designLinks } from '@/lib/house/redesign'
import { createProposal } from '@/lib/house/proposals'
import { dearName } from '@/lib/people'

export const dynamic = 'force-dynamic'
export const maxDuration = 300   // three redesign images take a minute or two
const UUID = /^[0-9a-f-]{36}$/i
const STATUSES = ['noted', 'sent_to_landlord', 'approved', 'quoting', 'done', 'dismissed']

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams
  let query = createServiceClient().from('property_improvements').select('*, rooms(name, room_size)').eq('property_id', q.get('propertyId') ?? '').order('created_at', { ascending: false })
  if (q.get('roomId')) query = query.eq('room_id', q.get('roomId'))
  const { data, error } = await query
  if (error) return NextResponse.json({ ready: !/property_improvements|does not exist|schema cache/i.test(error.message), items: [] })
  const s = createServiceClient()
  const items = await Promise.all(((data ?? []) as any[]).map(async r => ({ ...r, designs: await designLinks(s as any, r.designs ?? []) })))
  return NextResponse.json({ ready: true, redesign: redesignReady(), items })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (STATUSES.includes(b.status)) upd.status = b.status
  if (typeof b.note === 'string' && b.note.trim()) upd.note = b.note.trim().slice(0, 600)
  const { error } = await createServiceClient().from('property_improvements').update(upd).eq('id', String(b.id))
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const who = await requireStaff(req)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  // { action: 'redesign', id, image } → three redecoration ideas of that photo (lib/house/redesign)
  if (b.action === 'redesign') {
    const photo = Buffer.from(String(b.image ?? ''), 'base64')
    if (photo.length < 200 || photo.length > 4 * 1024 * 1024) return NextResponse.json({ error: 'That photo didn’t come through' }, { status: 400 })
    try { const s = createServiceClient(); const made = await redesign(s as any, String(b.id), photo); return NextResponse.json({ designs: await designLinks(s as any, made) }) }
    catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Couldn’t make the redesigns' }, { status: 502 }) }
  }
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter((x: string) => UUID.test(x)).slice(0, 40)
  if (!ids.length) return NextResponse.json({ error: 'Tick the notes to include' }, { status: 400 })
  const to = b.to === 'contractor' ? 'contractor' : 'landlord'
  const s = createServiceClient()
  try {
    if (b.action === 'draft') return NextResponse.json(await draftImprovements(s as any, ids, to))
    // { action: 'proposal_prep', ids } → the landlord's email and a starting intro
    if (b.action === 'proposal_prep') {
      const { data: r } = await s.from('property_improvements').select('property_id, properties(landlord_id)').eq('id', ids[0]).maybeSingle() as { data: any }
      const { data: ll } = r?.properties?.landlord_id ? await s.from('people').select('salutation, first_name, last_name, full_name, email').eq('id', r.properties.landlord_id).maybeSingle() as { data: any } : { data: null }
      return NextResponse.json({ propertyId: r?.property_id, email: ll?.email ?? '', intro: `Dear ${ll ? dearName(ll) : 'Sir or Madam'},\n\nWe were at the house recently and have put together a few ideas that could freshen it up and help it let well — nothing structural, just decor, furniture and lighting.` })
    }
    // { action: 'proposal', ids, propertyId, emails, intro, costs } → the private page, emailed to the landlord
    if (b.action === 'proposal') {
      const emails = String(b.emails ?? '').split(/[\s,;]+/).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
      if (!emails.length) return NextResponse.json({ error: 'Add the landlord’s email' }, { status: 400 })
      return NextResponse.json(await createProposal(s as any, { propertyId: String(b.propertyId), ids, intro: String(b.intro ?? ''), costs: b.costs ?? {}, emails, byEmail: who.email, req }))
    }
    if (b.action === 'send') {
      const emails = String(b.emails ?? '').split(/[\s,;]+/).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
      if (!emails.length || !String(b.subject ?? '').trim() || !String(b.message ?? '').trim()) return NextResponse.json({ error: 'Add who it’s to, a subject and the message' }, { status: 400 })
      const r = await sendEmail(emails, String(b.subject).slice(0, 200), messageHtml(String(b.message)), { req, kind: to === 'landlord' ? 'improvements-landlord' : 'improvements-quote' })
      if (!r.ok) return NextResponse.json({ error: `It didn’t send: ${r.error}` }, { status: 502 })
      const { data: rows } = await s.from('property_improvements').select('id, sent_log, status').in('id', ids)
      for (const row of (rows ?? []) as any[]) await s.from('property_improvements').update({
        status: row.status === 'noted' ? (to === 'landlord' ? 'sent_to_landlord' : 'quoting') : row.status,
        sent_log: [...(row.sent_log ?? []), { to: emails, kind: to, at: new Date().toISOString(), by: who.email }], updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      return NextResponse.json({ ok: true, sentTo: emails })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Something went wrong' }, { status: 500 }) }
}

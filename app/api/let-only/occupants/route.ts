// /api/let-only/occupants — who lives in a let-only house (lib/letOnly/occupants). Office staff only.
//   GET ?propertyId=                                  → { occupants, rooms, landlord, askedAt }
//   POST { action: 'ask', propertyId, send? }         → the email to the landlord asking who lives there (send: true sends it)
//   POST { action: 'save', propertyId, id?, roomId, name, phone?, email?, occupation?, age?, gender?, share? } → added / changed by hand
//   POST { action: 'end', id }                        → they've moved out (kept as history)
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { occupantsOf, askLandlordEmail } from '@/lib/letOnly/occupants'
import { dearLine } from '@/lib/people'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { senderFor } from '@/lib/email/sender'

export const dynamic = 'force-dynamic'
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const street = (name: string) => String(name || '').split('\n')[0].replace(/^(flat|apartment)\s+\w+,\s*/i, '').trim()

async function house(s: any, propertyId: string) {
  const { data: p } = await s.from('properties').select('id, name, letting_type, landlord_id, bedrooms, people!landlord_id(salutation, first_name, last_name, full_name, company, email)').eq('id', propertyId).maybeSingle()
  return p as any
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const propertyId = req.nextUrl.searchParams.get('propertyId') ?? ''
  const s = createServiceClient()
  const p = await house(s, propertyId)
  if (!p) return NextResponse.json({ error: 'House not found' }, { status: 404 })
  const [{ data: rooms }, occupants, { data: asked }] = await Promise.all([
    s.from('rooms').select('id, name').eq('property_id', propertyId),
    occupantsOf(s as any, propertyId),
    s.from('properties').select('occupants_asked_at').eq('id', propertyId).maybeSingle() as any,
  ])
  const ll = p.people
  return NextResponse.json({
    occupants, rooms: ((rooms ?? []) as any[]).sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true })),
    landlord: ll ? { name: ll.company || [ll.first_name, ll.last_name].filter(Boolean).join(' ') || ll.full_name, email: ll.email ?? null } : null,
    askedAt: (asked as any)?.occupants_asked_at ?? null,
    bedrooms: p.bedrooms ?? null,
  })
}

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()

  if (b.action === 'ask') {
    const p = await house(s, String(b.propertyId ?? ''))
    if (!p) return NextResponse.json({ error: 'House not found' }, { status: 404 })
    const to = p.people?.email
    if (!to || !String(to).includes('@')) return NextResponse.json({ error: 'The landlord has no email address on file — add one on their profile first.' }, { status: 400 })
    const { data: rooms } = await s.from('rooms').select('name').eq('property_id', p.id)
    const names = ((rooms ?? []) as any[]).map(r => String(r.name)).sort((a, c) => a.localeCompare(c, 'en', { numeric: true }))
    const sender = await senderFor(req)
    const mail = askLandlordEmail({ dear: dearLine(p.people), house: street(p.name), rooms: names.length ? names : ['Room 1', 'Room 2', 'Room 3', 'Room 4'], senderFirst: String(sender.name ?? '').split(' ')[0] || 'Capital Rooms' })
    if (!b.send) return NextResponse.json({ to, ...mail })
    const r = await sendEmail(to, mail.subject, messageHtml(mail.text), { kind: 'let-only-who-lives-here', req })
    if (!r.ok) return NextResponse.json({ error: r.error || 'The email didn’t send' }, { status: 502 })
    await s.from('properties').update({ occupants_asked_at: new Date().toISOString() }).eq('id', p.id)   // ignored before migration 278
    return NextResponse.json({ ok: true, to })
  }

  // how many bedrooms the whole property has — every bedroom, not just the ones we let (12 Nov 2026)
  if (b.action === 'bedrooms') {
    const n = Number(b.bedrooms)
    if (!(n >= 1 && n <= 20)) return NextResponse.json({ error: 'Between 1 and 20 bedrooms' }, { status: 400 })
    const { error } = await s.from('properties').update({ bedrooms: n }).eq('id', String(b.propertyId ?? '')).eq('letting_type', 'let_only')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'save') {
    const name = String(b.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Add their name' }, { status: 400 })
    let { data: room } = await s.from('rooms').select('id, property_id').eq('id', String(b.roomId ?? '')).maybeSingle() as { data: any }
    // a bedroom we don't let isn't on file yet — it's added (marked occupied) the first time someone's put in it
    if (!room && /^Room \d{1,2}$/.test(String(b.roomName ?? ''))) {
      const p = await house(s, String(b.propertyId ?? ''))
      if (p?.letting_type === 'let_only') {
        const { data: same } = await s.from('rooms').select('id, property_id').eq('property_id', p.id).ilike('name', String(b.roomName)).maybeSingle() as { data: any }
        room = same ?? (await s.from('rooms').insert({ property_id: p.id, name: String(b.roomName), status: 'occupied', is_let_only: true }).select('id, property_id').single()).data
      }
    }
    if (!room || room.property_id !== b.propertyId) return NextResponse.json({ error: 'Choose a room' }, { status: 400 })
    const age = Number(b.age)
    const base: Record<string, unknown> = { name: name.slice(0, 120), phone: String(b.phone ?? '').trim() || null, email: String(b.email ?? '').trim().toLowerCase() || null, room_id: room.id, updated_at: new Date().toISOString() }
    const extra: Record<string, unknown> = { occupation: String(b.occupation ?? '').trim().slice(0, 80) || null, age: age >= 16 && age <= 100 ? age : null, age_noted_on: age >= 16 && age <= 100 ? today() : null, gender: String(b.gender ?? '').trim().toLowerCase().slice(0, 20) || null, share_on_adverts: b.share === true }
    const go = async (row: Record<string, unknown>) => b.id
      ? (await s.from('let_only_occupants').update(row).eq('id', String(b.id)).eq('property_id', room.property_id)).error
      : (await s.from('let_only_occupants').insert({ ...row, room_id: room.id, property_id: room.property_id, source: 'Added by hand', created_by: me.email })).error
    let error = await go({ ...base, ...extra })
    if (error && /occupation|age|gender|share_on_adverts/.test(error.message)) error = await go(base)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'end') {
    const { error } = await s.from('let_only_occupants').update({ ended_at: today(), updated_at: new Date().toISOString() }).eq('id', String(b.id ?? '')).is('ended_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

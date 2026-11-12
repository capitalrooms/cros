// /api/lettings/viewing-requests — viewing requests from the website (migration 279). Office staff (lettings, admin).
//   GET                                     → { requests } — the ones waiting, newest first, with house and room
//   POST { id, action: 'book', slot }       → books that slot as a viewing and tells the person (text + email);
//                                             the screen then tells the house as for any booking
//   POST { id, action: 'decline', note? }   → none of the times work: the person is asked for others (text + email)
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { sendSms } from '@/lib/sms'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { slotLabel } from '@/lib/lettings/viewingSlots'
import { houseName } from '@/lib/lettings/letWording'
import { getSmsSignOff } from '@/lib/auth'

export const dynamic = 'force-dynamic'
const missing = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /viewing_requests/.test(e.message ?? ''))

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const { data, error } = await s.from('viewing_requests').select('id, name, email, phone, slots, message, created_at, room_id, property_id, rooms(name), properties(name, address)').eq('status', 'new').order('created_at', { ascending: false }).limit(50)
  if (missing(error)) return NextResponse.json({ requests: [], setupNeeded: true })
  return NextResponse.json({ requests: (data ?? []).map((r: any) => ({ ...r, house: houseName(r.properties?.address || r.properties?.name), room: r.rooms?.name ?? null })) })
}

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: r } = await s.from('viewing_requests').select('*, rooms(name), properties(name, address)').eq('id', String(b.id ?? '')).maybeSingle() as { data: any }
  if (!r) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (r.status !== 'new') return NextResponse.json({ error: `It’s already ${r.status}` }, { status: 409 })
  const house = houseName(r.properties?.address || r.properties?.name) || 'the house'
  const first = String(r.name).split(' ')[0]
  const signOff = await getSmsSignOff(me.email)
  const tell = async (text: string, subject: string) => {
    if (r.phone) await sendSms(r.phone, `Hi ${first}, ${text} -${signOff}`)
    if (r.email) await sendEmail(r.email, subject, messageHtml(`Hi ${first},\n\n${text.charAt(0).toUpperCase()}${text.slice(1)}`), { req, kind: 'invite-to-apply' })
  }
  const now = new Date().toISOString()

  if (b.action === 'book') {
    const slot = (r.slots ?? [])[Number(b.slot)]
    if (!slot) return NextResponse.json({ error: 'Choose one of their times' }, { status: 400 })
    const { data: v, error } = await s.from('viewings').insert({ room_id: r.room_id, property_id: r.property_id, viewing_date: slot.date, viewing_slot: slot.time, duration_minutes: 15,
      visitor_name: r.name, visitor_email: r.email, visitor_phone: r.phone, feedback: r.message ? `From the website: ${r.message}` : 'Requested on the website', viewing_status: 'confirmed' }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await s.from('viewing_requests').update({ status: 'booked', viewing_id: v.id, handled_by: me.email, handled_at: now }).eq('id', r.id)
    const when = slotLabel(slot.date, slot.time)
    await tell(`your viewing at ${house} is booked for ${when}. We'll meet you there — if anything changes, just reply.`, `Viewing booked — ${house}, ${when}`)
    return NextResponse.json({ ok: true, viewing: { id: v.id, room_id: r.room_id, property_id: r.property_id, date: slot.date, time: slot.time, room: r.rooms?.name ?? '', house } })
  }
  if (b.action === 'decline') {
    await s.from('viewing_requests').update({ status: 'declined', handled_by: me.email, handled_at: now }).eq('id', r.id)
    const note = String(b.note ?? '').trim().slice(0, 300)
    await tell(`thanks for asking to view ${house}. Sorry, none of those times work for us.${note ? ` ${note}` : ''} Reply with a few other times that suit you, or call us on 0207 112 9163.`, `Your viewing request — ${house}`)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

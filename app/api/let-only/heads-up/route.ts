// POST /api/let-only/heads-up — a viewing at a let-only house: a text (Twilio, lib/sms) and an email to EVERYONE living
// there (12 Nov 2026, Harry: "notify those people via Twilio or text when we have a viewing"), each by first name —
// the person whose room it is is told it's their room. Office staff only.
// Body: { roomId, event: 'booked' | 'rescheduled' | 'cancelled', date: 'YYYY-MM-DD', time: 'HH:MM', elected? }
// elected: lettings ticked "tell the tenants" when booking (the "messages you send yourself" switch); otherwise it's
// automatic (a move) and follows the automatic-message pause (lib/comms).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { occupantsOf } from '@/lib/letOnly/occupants'
import { sendSms } from '@/lib/sms'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { getSmsSignOff } from '@/lib/auth'
import { getCommsLive, getElectedCommsLive } from '@/lib/comms'
import { hiName, personFromText } from '@/lib/people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const clock = (t: string) => { const [h, m] = String(t || '09:00').split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}` }

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!(await (b.elected === true ? getElectedCommsLive() : getCommsLive()))) return NextResponse.json({ texted: 0, emailed: 0, reason: 'tenant_comms_paused' })
  const s = createServiceClient()
  const { data: room } = await s.from('rooms').select('id, name, property_id, properties(name, letting_type)').eq('id', String(b.roomId ?? '')).maybeSingle() as { data: any }
  if (!room || room.properties?.letting_type !== 'let_only') return NextResponse.json({ texted: 0, emailed: 0, reason: 'not_let_only' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? ''))) return NextResponse.json({ error: 'Missing the date' }, { status: 400 })
  const people = await occupantsOf(s as any, room.property_id)
  if (!people.length) return NextResponse.json({ texted: 0, emailed: 0, reason: 'nobody_on_file' })

  const where = String(room.properties?.name ?? '').split('\n')[0].replace(/^(flat|apartment)\s+\w+,\s*/i, '')
  const when = `${day(b.date)} at ${clock(b.time)}`
  const signOff = await getSmsSignOff(me.email)
  let texted = 0, emailed = 0
  const failed: string[] = []
  for (const o of people) {
    const hi = hiName(personFromText(o.name))
    const theirs = o.roomId === room.id
    const what = theirs ? `your room (${room.name})` : room.name
    const line = b.event === 'cancelled' ? `the viewing of ${what} at ${where} on ${when} is cancelled — sorry for any bother.`
      : b.event === 'rescheduled' ? `the viewing of ${what} at ${where} has moved to ${when}.`
        : `just a heads-up — we're showing ${what} at ${where} on ${when}.`
    const after = b.event === 'cancelled' ? '' : ` We'll let ourselves in with the management keys, so there's no need to be in${theirs ? ', but it helps if the room is tidy' : ''}. Thank you!`
    if (o.phone) { const r = await sendSms(o.phone, `Hi ${hi}, ${line}${after} -${signOff}`); if (r.ok) texted++; else failed.push(`${o.name} (text)`) }
    if (o.email) {
      const subject = b.event === 'cancelled' ? `Viewing cancelled — ${where}` : b.event === 'rescheduled' ? `Viewing moved — ${where}, ${when}` : `Viewing at ${where} — ${when}`
      const r = await sendEmail(o.email, subject, messageHtml(`Hi ${hi},\n\n${line.charAt(0).toUpperCase()}${line.slice(1)}${after}`), { kind: 'let-only-heads-up', req })
      if (r.ok) emailed++; else failed.push(`${o.name} (email)`)
    }
  }
  return NextResponse.json({ texted, emailed, failed, people: people.length })
}

// /api/book/<token> — a contractor who isn't on the app books, moves or cancels their own visit (25 Oct 2026; the
// link: lib/jobs/bookingLink). No sign-in: the signed link is the key, and it only works while the job is theirs.
//   GET                                   → the job, the current booking, the earliest day and the time slots
//   POST { action: 'book', date, slot }   → book (or move) the visit: the tenants are told with the contractor's
//                                           mobile, the office is told, the contractor gets a confirmation
//   POST { action: 'cancel', reason }     → can't make it: the visit comes off; the office and tenants are told
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { readBookingToken, bookingLink, contractorLabel } from '@/lib/jobs/bookingLink'
import { loadQuoteJob, accessNote } from '@/lib/quotes/quoteRequest'
import { TIME_SLOTS, slotLabel, earliestBookableDate, bookingLeadTimeNote } from '@/lib/booking'
import { jobPlace, inTenantRoom } from '@/lib/repairs/where'
import { getCommsLive } from '@/lib/comms'
import { activeTenantIds, insertNotifications, dispatchChannels } from '@/lib/serverNotify'
import { deliverEmail, sendEmail } from '@/lib/sendEmail'
import { sendSms } from '@/lib/sms'
import { buildEmail } from '@/lib/emailWrapper'
import { OFFICE_ALERT_EMAIL, officeButton } from '@/lib/email/office'
import { defaultSender } from '@/lib/email/sender'

export const dynamic = 'force-dynamic'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const full = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const gone = () => NextResponse.json({ error: 'This booking link isn’t active any more — the job may have been finished, cancelled or given to someone else. Please contact Capital Rooms.' }, { status: 404 })

async function load(token: string) {
  const ids = readBookingToken(token)
  if (!ids) return null
  const s = createServiceClient()
  const { data: t } = await s.from('maintenance_tickets').select('id, title, status, contractor_id, property_id, room_id, location, priority, booked_date, booked_slot').eq('id', ids.ticketId).maybeSingle()
  if (!t || t.contractor_id !== ids.personId || ['completed', 'cancelled'].includes(t.status)) return null
  const { data: c } = await s.from('people').select('id, salutation, first_name, last_name, full_name, company, phone, email').eq('id', ids.personId).maybeSingle()
  if (!c) return null
  return { s, t, c, ids }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await load(token)
  if (!ctx) return gone()
  const job = await loadQuoteJob(ctx.s, ctx.t.id)
  const office = await defaultSender()
  const place = jobPlace({ location: ctx.t.location, rooms: { name: job?.roomName ?? null } })
  return NextResponse.json({
    contractor: contractorLabel(ctx.c),
    job: { title: ctx.t.title, address: job?.propertyAddress ?? '', house: job?.propertyName ?? '', where: inTenantRoom({ location: ctx.t.location }) ? (job?.roomName || 'A tenant’s room') : ctx.t.location,
      description: job?.description ?? '', access: job ? accessNote(job) : '', reference: job?.reference ?? '' },
    booking: ctx.t.booked_date ? { date: String(ctx.t.booked_date).slice(0, 10), slot: ctx.t.booked_slot, label: `${full(String(ctx.t.booked_date).slice(0, 10))}, ${slotLabel(ctx.t.booked_slot)}` } : null,
    earliest: earliestBookableDate(place, ctx.t.priority), note: bookingLeadTimeNote(place, ctx.t.priority),
    slots: TIME_SLOTS, office: { email: office.replyTo, phone: office.phone },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await load(token)
  if (!ctx) return gone()
  const { s, t, c } = ctx
  const b = await req.json().catch(() => ({}))
  const job = await loadQuoteJob(s, t.id)
  const house = job?.propertyName || job?.propertyAddress || 'the property'
  const who = contractorLabel(c)
  const before = t.booked_date ? `${full(String(t.booked_date).slice(0, 10))}, ${slotLabel(t.booked_slot)}` : null
  // the tenants who'd be visited: that room's for a room job, the whole house for a shared area
  const tenantIds = t.property_id ? await activeTenantIds(s, t.property_id, inTenantRoom({ location: t.location }) ? t.room_id : null) : []
  const tellTenants = async (title: string, body: string) => {
    if (!tenantIds.length || !(await getCommsLive())) return   // automatic tenant messages follow the pause switch
    await insertNotifications(s, tenantIds, { title, body, type: 'maintenance', link: '/tenant/requests' }, { propertyId: t.property_id, roomId: t.room_id })
    await dispatchChannels(s, tenantIds, { title, body, link: '/tenant/requests' }, 'push_email', null)
  }
  const tellOffice = async (subject: string, lines: string) => {
    await deliverEmail({ to: [OFFICE_ALERT_EMAIL], subject, html: await buildEmail(`${lines}${officeButton(`/admin/maintenance?ticket=${t.id}`, 'Open this job')}`, { signature: false }) }).catch(() => null)
  }

  if (b.action === 'cancel') {
    const reason = String(b.reason ?? '').trim().slice(0, 500)
    await s.from('maintenance_tickets').update({ booked_date: null, booked_slot: null }).eq('id', t.id)
    await tellOffice(`Can’t make it: ${who} — ${t.title} at ${house}`, `<p><b>${esc(who)}</b> can’t do ${before ? `the visit booked for <b>${esc(before)}</b>` : 'this job'}.</p>${reason ? `<p>Their reason: ${esc(reason)}</p>` : ''}<p>The job is still with them — they can book a new day with the same link — or send it to someone else.</p>`)
    if (before) await tellTenants('Repair visit cancelled', `The visit on ${before} for "${t.title}" won’t go ahead. We’ll let you know the new day.`)
    return NextResponse.json({ ok: true })
  }

  // book or move
  const date = String(b.date ?? ''), slot = String(b.slot ?? '')
  const place = jobPlace({ location: t.location, rooms: { name: job?.roomName ?? null } })
  const earliest = earliestBookableDate(place, t.priority)
  const latest = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < earliest) return NextResponse.json({ error: `${bookingLeadTimeNote(place, t.priority)} The earliest day is ${full(earliest)}.` }, { status: 400 })
  if (date > latest) return NextResponse.json({ error: 'Please pick a day in the next three months.' }, { status: 400 })
  if (!TIME_SLOTS.some(x => x.value === slot)) return NextResponse.json({ error: 'Pick a time slot.' }, { status: 400 })
  const { error } = await s.from('maintenance_tickets').update({ booked_date: date, booked_slot: slot, status: 'assigned', arrived_at: null }).eq('id', t.id)
  if (error) return NextResponse.json({ error: 'The booking couldn’t be saved — please try again.' }, { status: 500 })

  const when = `${full(date)}, ${slotLabel(slot)}`
  const moved = !!before && before !== when
  const mobile = c.phone ? ` Their mobile is ${c.phone} if you need to arrange access.` : ''
  await tellTenants(moved ? `Repair visit moved — ${full(date)}` : `Repair booked — ${full(date)}`,
    `${who} will ${moved ? 'now ' : ''}come on ${when} for "${t.title}".${mobile}`)
  await tellOffice(`${moved ? 'Moved' : 'Booked'} by ${who}: ${t.title} — ${when}`,
    `<p><b>${esc(who)}</b> has ${moved ? `moved their visit from ${esc(before)} to` : 'booked'} <b>${esc(when)}</b> for <b>${esc(t.title)}</b> at ${esc(house)}${job?.roomName ? `, ${esc(job.roomName)}` : ''}.</p><p>They booked it themselves with their booking link (they’re not on the app).</p>`)
  const link = bookingLink(t.id, c.id)
  if (c.phone) await sendSms(c.phone, `Capital Rooms: you're booked for ${when} at ${house} (${t.title}). To move or cancel: ${link}`, { asName: true }).catch(() => null)
  if (c.email) await sendEmail(c.email, `Booked: ${when} — ${t.title} at ${house}`, `<p>Thanks — you’re booked for <b>${esc(when)}</b>.</p><p><b>${esc(t.title)}</b><br>${esc(job?.propertyAddress ?? house)}${job?.roomName ? `<br>${esc(job.roomName)}` : ''}</p><p>${esc(job ? accessNote(job) : '')}</p><p><a href="${link}">Move or cancel this visit</a></p>`, { signature: false }).catch(() => null)
  return NextResponse.json({ ok: true, label: when })
}

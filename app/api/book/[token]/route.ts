// /api/book/<token> — a contractor who isn't on the app books, moves or cancels their own visit (25 Oct 2026; the
// link: lib/jobs/bookingLink). No sign-in: the signed link is the key, and it only works while the job is theirs.
//   GET                                   → the job, the current booking, the earliest day and the time slots
//   POST { action: 'book', date, slot }   → book (or move) the visit: the tenants are told with the contractor's
//                                           mobile, the office is told, the contractor gets a confirmation
//   POST { action: 'cancel', reason }     → can't make it: the visit comes off; the office and tenants are told
// 15 Nov 2026 — the whole job from the link, like the app (Harry: "so they can do everything they need via the link"):
//   POST { action: 'on_my_way' }                       → the tenants are told
//   POST { action: 'here', ack? }                      → arrived (same notice rules as the app); returns the key safe
//   POST { action: 'undo_here' }                       → tapped by mistake (within 20 minutes)
//   POST { action: 'late', eta }                       → running late: the tenants get the new time
//   POST { action: 'done', outcome: 'fixed'|'return', notes, price, returnDate?, returnSlot? }
//   POST { action: 'ask', question }                   → a question to the tenants; their answer is texted back
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { readBookingToken, bookingLink, contractorLabel } from '@/lib/jobs/bookingLink'
import { loadQuoteJob } from '@/lib/quotes/quoteRequest'
import { TIME_SLOTS, slotLabel, earliestBookableDate, bookingLeadTimeNote } from '@/lib/booking'
import { jobPlace, inTenantRoom } from '@/lib/repairs/where'
import { getCommsLive } from '@/lib/comms'
import { activeTenantIds, insertNotifications, dispatchChannels } from '@/lib/serverNotify'
import { deliverEmail, sendEmail } from '@/lib/sendEmail'
import { sendSms } from '@/lib/sms'
import { tellHouseVisitOff } from '@/lib/maintenance/visitOff'
import { buildEmail } from '@/lib/emailWrapper'
import { OFFICE_ALERT_EMAIL, officeButton } from '@/lib/email/office'
import { defaultSender } from '@/lib/email/sender'
import { hasRealEmail } from '@/lib/people'
import { confirmArrival, undoArrival, onMyWay, runningLate } from '@/lib/access/arrival'
import { ticketArrival, ticketOnMyWay, ticketRunningLate } from '@/lib/emergencies/engine'
import { askTenants, firstNameForTenants } from '@/lib/jobs/tenantQuestion'

export const dynamic = 'force-dynamic'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const full = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
// how they get in — the key safe code shows only after "I'm here" on the day, with the same notice rules as the app
// (lib/access/arrival; 15 Nov 2026 — before, link users never got it and had to ring the office)
const accessFor = (location: string | null, roomName?: string | null) => inTenantRoom({ location })
  ? `Inside a tenant’s room${roomName ? ` (${roomName})` : ''}. When you book, the tenant is told and given your first name and mobile to arrange access. Tap “I’m here” when you arrive — rooms need 24 hours’ notice unless the tenant says yes.`
  : 'A shared area. The tenants are told when you’re coming. Tap “I’m here” on the day and the front-door key safe code shows (if the house has one).'
const gone = () => NextResponse.json({ error: 'This booking link isn’t active any more — the job may have been finished, cancelled or given to someone else. Please contact Capital Rooms.' }, { status: 404 })

async function load(token: string) {
  const ids = readBookingToken(token)
  if (!ids) return null
  const s = createServiceClient()
  const { data: t } = await s.from('maintenance_tickets').select('id, title, status, contractor_id, property_id, room_id, location, priority, booked_date, booked_slot, arrived_at, final_price, notes').eq('id', ids.ticketId).maybeSingle()
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
      description: job?.description ?? '', access: accessFor(ctx.t.location, job?.roomName), reference: job?.reference ?? '' },
    booking: ctx.t.booked_date ? { date: String(ctx.t.booked_date).slice(0, 10), slot: ctx.t.booked_slot, label: `${full(String(ctx.t.booked_date).slice(0, 10))}, ${slotLabel(ctx.t.booked_slot)}` } : null,
    earliest: earliestBookableDate(place, ctx.t.priority), note: bookingLeadTimeNote(place, ctx.t.priority),
    slots: TIME_SLOTS, office: { email: office.replyTo, phone: office.phone },
    visit: { arrivedAt: (ctx.t as any).arrived_at ?? null, slot: ctx.t.booked_slot ?? null, priority: ctx.t.priority ?? null, price: (ctx.t as any).final_price ?? null },
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
  const whoForTenants = firstNameForTenants(c)   // tenants: first name only
  const before = t.booked_date ? `${full(String(t.booked_date).slice(0, 10))}, ${slotLabel(t.booked_slot)}` : null
  // the tenants who'd be visited: that room's for a room job, the whole house for a shared area
  const tenantIds = t.property_id ? await activeTenantIds(s, t.property_id, inTenantRoom({ location: t.location }) ? t.room_id : null) : []
  const tellTenants = async (title: string, body: string) => {
    if (!tenantIds.length || !(await getCommsLive({ propertyId: t.property_id }))) return   // automatic tenant messages follow the pause switch
    await insertNotifications(s, tenantIds, { title, body, type: 'maintenance', link: '/tenant/requests' }, { propertyId: t.property_id, roomId: t.room_id })
    await dispatchChannels(s, tenantIds, { title, body, link: '/tenant/requests' }, 'push_email', null)
  }
  const tellOffice = async (subject: string, lines: string) => {
    await deliverEmail({ to: [OFFICE_ALERT_EMAIL], subject, html: await buildEmail(`${lines}${officeButton(`/admin/maintenance?ticket=${t.id}`, 'Open this job')}`, { kind: 'office-visit-booked', signature: false }) }).catch(() => null)
  }

  // the visit itself — the same steps as the app (lib/access/arrival), so nothing depends on which one they use
  if (b.action === 'on_my_way') {
    const viaEm = await ticketOnMyWay(s as any, t.id).catch(() => false)
    const r = viaEm ? { ok: true } : await onMyWay(s as any, { id: t.id, personId: c.id })
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: (r as any).error }, { status: 400 })
  }
  if (b.action === 'here') {
    const r: any = await confirmArrival(s as any, { kind: 'job', id: t.id, personId: c.id, ack: b.ack === true })
    if (r.state === 'ok') await ticketArrival(s as any, t.id, true).catch(() => null)
    const { propertyId: _p, ...out } = r
    return NextResponse.json(out, { status: ['ok', 'warn', 'blocked'].includes(r.state) ? 200 : 409 })
  }
  if (b.action === 'undo_here') {
    const r = await undoArrival(s as any, { kind: 'job', id: t.id, personId: c.id })
    if (r.ok) await ticketArrival(s as any, t.id, false).catch(() => null)
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 })
  }
  if (b.action === 'late') {
    const eta = new Date(String(b.eta ?? ''))
    if (Number.isNaN(eta.getTime()) || eta.getTime() < Date.now() - 5 * 60000) return NextResponse.json({ error: 'Pick when you’ll be there.' }, { status: 400 })
    const viaEm = await ticketRunningLate(s as any, t.id, eta.toISOString()).catch(() => false)
    const r = viaEm ? { ok: true } : await runningLate(s as any, { id: t.id, personId: c.id, eta: eta.toISOString() })
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: (r as any).error }, { status: 400 })
  }
  if (b.action === 'ask') {
    const r = await askTenants(s as any, t.id, c.id, String(b.question ?? ''))
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 })
  }
  if (b.action === 'done') {
    const notes = String(b.notes ?? '').trim().slice(0, 2000)
    const price = b.price != null && b.price !== '' && !Number.isNaN(Number(b.price)) ? Number(b.price) : null
    const now = new Date().toISOString()
    if (b.outcome === 'fixed') {
      if (!notes) return NextResponse.json({ error: 'Say what you did — a line is enough.' }, { status: 400 })
      await s.from('maintenance_tickets').update({ status: 'completed', completed_at: now, notes, ...(price != null ? { final_price: price } : {}) }).eq('id', t.id)
      await tellTenants(`Repair done — ${String(t.title).split(' — ')[0].slice(0, 40)}`, `${whoForTenants === 'Your contractor' ? 'Your contractor' : whoForTenants} has finished. Not sorted? Open the repair in the app and tell us.`)
      await tellOffice(`Done: ${t.title} at ${house} — ${who}`, `<p><b>${esc(who)}</b> has marked <b>${esc(t.title)}</b> at ${esc(house)} as done from their link.</p><p>What they did: ${esc(notes)}</p>${price != null ? `<p>Their price: £${price.toFixed(2)}</p>` : ''}`)
      return NextResponse.json({ ok: true })
    }
    if (b.outcome === 'return') {
      if (!notes) return NextResponse.json({ error: 'Say what’s left to do.' }, { status: 400 })
      const rd = /^\d{4}-\d{2}-\d{2}$/.test(String(b.returnDate ?? '')) ? String(b.returnDate) : null
      const rs = TIME_SLOTS.some(x => x.value === b.returnSlot) ? String(b.returnSlot) : null
      await s.from('maintenance_tickets').update({ return_needed: true, return_reason: notes, return_date: rd, booked_date: rd, booked_slot: rd ? rs : null, arrived_at: null, status: 'assigned', notes, ...(price != null ? { final_price: price } : {}) }).eq('id', t.id)
      await tellTenants(`Another visit needed — ${String(t.title).split(' — ')[0].slice(0, 40)}`, rd ? `${whoForTenants === 'Your contractor' ? 'Your contractor' : whoForTenants} needs to come back to finish: ${full(rd)}${rs ? `, ${slotLabel(rs)}` : ''}.` : 'Your contractor needs to come back to finish — we’ll tell you the day.')
      await tellOffice(`Return visit needed: ${t.title} at ${house}`, `<p><b>${esc(who)}</b> needs to come back: ${esc(notes)}</p><p>${rd ? `They’ve booked ${esc(full(rd))}${rs ? `, ${esc(slotLabel(rs))}` : ''}.` : 'No date yet — they can book it with their link.'}</p>`)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Fixed, or coming back?' }, { status: 400 })
  }

  if (b.action === 'cancel') {
    const reason = String(b.reason ?? '').trim().slice(0, 500)
    await s.from('maintenance_tickets').update({ booked_date: null, booked_slot: null }).eq('id', t.id)
    await tellOffice(`Can’t make it: ${who} — ${t.title} at ${house}`, `<p><b>${esc(who)}</b> can’t do ${before ? `the visit booked for <b>${esc(before)}</b>` : 'this job'}.</p>${reason ? `<p>Their reason: ${esc(reason)}</p>` : ''}<p>The job is still with them — they can book a new day with the same link — or send it to someone else.</p>`)
    // everyone who was told about it — incl. a let-only household (lib/maintenance/visitOff); automatic, so it follows the pause
    if (before && await getCommsLive({ propertyId: (t as any).property_id })) await tellHouseVisitOff(s as any, t as any, { jobCancelled: false })
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
    `${whoForTenants === 'Your contractor' ? 'Your contractor' : `${whoForTenants}, your Capital Rooms contractor,`} will ${moved ? 'now ' : ''}come on ${when} for "${t.title}".${mobile}`)
  await tellOffice(`${moved ? 'Moved' : 'Booked'} by ${who}: ${t.title} — ${when}`,
    `<p><b>${esc(who)}</b> has ${moved ? `moved their visit from ${esc(before)} to` : 'booked'} <b>${esc(when)}</b> for <b>${esc(t.title)}</b> at ${esc(house)}${job?.roomName ? `, ${esc(job.roomName)}` : ''}.</p><p>They booked it themselves with their booking link (they’re not on the app).</p>`)
  const link = bookingLink(t.id, c.id)
  if (c.phone) await sendSms(c.phone, `Capital Rooms: you're booked for ${when} at ${house} (${t.title}). To move or cancel: ${link}`, { asName: true }).catch(() => null)
  if (hasRealEmail(c.email)) await sendEmail(c.email, `Booked: ${when} — ${t.title} at ${house}`, `<p>Thanks — you’re booked for <b>${esc(when)}</b>.</p><p><b>${esc(t.title)}</b><br>${esc(job?.propertyAddress ?? house)}${job?.roomName ? `<br>${esc(job.roomName)}` : ''}</p><p>${esc(accessFor(t.location, job?.roomName))}</p><p><a href="${link}">Move or cancel this visit</a></p>`, { kind: 'visit-booked', signature: false }).catch(() => null)
  return NextResponse.json({ ok: true, label: when })
}

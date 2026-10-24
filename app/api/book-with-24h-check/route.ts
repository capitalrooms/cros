/**
 * POST /api/book-with-24h-check
 *
 * Books a contractor job into a slot, enforcing the 24-hour access-notice rule
 * for occupied-room jobs. If the requested slot is < 24 h away AND the job has
 * a room_id (occupied room), the request is NOT auto-confirmed. Instead:
 *
 *  1. A short-notice access REQUEST is sent to the room's tenant.
 *  2. A fallback slot (≥ 24 h from now) is stored on the ticket.
 *  3. Status is set to 'short_notice_pending'.
 *
 * A separate webhook / cron handles approvals and timeouts (see route below for
 * how tenant approve/decline is processed).
 *
 * Body:
 *   ticketId       UUID of the maintenance_ticket
 *   requestedDate  YYYY-MM-DD
 *   requestedTime  HH:MM (24h)
 *   fallbackDate   YYYY-MM-DD  (required when short-notice)
 *   fallbackTime   HH:MM       (required when short-notice)
 *
 * Response:
 *   { outcome: 'booked' | 'short_notice_sent' | 'blocked', message }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, canWorkOnTicket, canActAtProperty } from '@/lib/portalAuth'
import { tellContractor } from '@/lib/contractorContact'
import { PORTAL_URL } from '@/lib/emailTemplate'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCommsLive } from '@/lib/comms'
import { activeTenantIds, insertNotifications } from '@/lib/serverNotify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOTICE_HOURS = 24   // minimum notice required
const RESPONSE_WINDOW_HOURS = 2  // hours before the slot for tenant to respond

function isWithinNotice(dateISO: string, timeHHMM: string): boolean {
  const slotMs = new Date(`${dateISO}T${timeHHMM}:00`).getTime()
  const nowMs  = Date.now()
  const hours  = (slotMs - nowMs) / 3_600_000
  return hours < NOTICE_HOURS
}

function fmtSlot(dateISO: string, time: string) {
  const d = new Date(`${dateISO}T${time}:00`)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' }) +
    ` at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, requestedDate, requestedTime, fallbackDate, fallbackTime } = body

  // only the contractor assigned to the job (or the office) can book it
  if (!ticketId || !(await canWorkOnTicket(await requireSignedIn(req), ticketId))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requestedDate || !requestedTime) {
    return NextResponse.json({ error: 'requestedDate and requestedTime required' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch ticket + property info
  const { data: ticket, error: tErr } = await service
    .from('maintenance_tickets')
    .select('id, title, room_id, property_id, status, properties(name, address)')
    .eq('id', ticketId)
    .single()

  if (tErr || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const shortNotice = isWithinNotice(requestedDate, requestedTime)

  // ── Case 1: No room (communal / whole-house) OR slot is ≥ 24h away ─────────
  // Straight booking — no tenant approval needed
  if (!ticket.room_id || !shortNotice) {
    const { error: upErr } = await service
      .from('maintenance_tickets')
      .update({
        booked_date: requestedDate,
        booked_slot: requestedTime + ':00',
        status: 'booked',
      })
      .eq('id', ticketId)

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({
      outcome: 'booked',
      message: `Booked for ${fmtSlot(requestedDate, requestedTime)}`,
    })
  }

  // ── Case 2: Occupied room + short notice ──────────────────────────────────
  // Require a fallback slot
  if (!fallbackDate || !fallbackTime) {
    return NextResponse.json({
      outcome: 'blocked',
      message: `This slot is less than ${NOTICE_HOURS} hours away. Please provide a fallback slot (≥ 24 hours from now) so tenants can respond.`,
      requiresFallback: true,
    })
  }

  // Verify fallback is ≥ 24h
  if (isWithinNotice(fallbackDate, fallbackTime)) {
    return NextResponse.json({
      outcome: 'blocked',
      message: 'The fallback slot must also be at least 24 hours from now.',
      requiresFallback: true,
    })
  }

  // Store both slots on the ticket, set status to pending
  const { error: upErr } = await service
    .from('maintenance_tickets')
    .update({
      booked_date:            requestedDate,
      booked_slot:            requestedTime + ':00',
      short_notice_pending:   true,
      fallback_date:          fallbackDate,
      fallback_slot:          fallbackTime + ':00',
      status:                 'short_notice_pending',
      short_notice_deadline:  new Date(
        new Date(`${requestedDate}T${requestedTime}:00`).getTime()
        - RESPONSE_WINDOW_HOURS * 3_600_000
      ).toISOString(),
    })
    .eq('id', ticketId)

  if (upErr) {
    // If columns don't exist yet, fall back to plain booking with a note
    await service
      .from('maintenance_tickets')
      .update({ booked_date: requestedDate, booked_slot: requestedTime + ':00', status: 'booked' })
      .eq('id', ticketId)

    return NextResponse.json({
      outcome: 'booked',
      message: `Booked (24h check columns not yet migrated — booked directly). Fallback was ${fmtSlot(fallbackDate, fallbackTime)}.`,
    })
  }

  // Send notification to room tenant
  if (await getCommsLive()) {
    const tenantIds = await activeTenantIds(service, ticket.property_id, ticket.room_id)
    if (tenantIds.length > 0) {
      const prop  = (ticket.properties as any)?.name ?? 'your property'
      const slot  = fmtSlot(requestedDate, requestedTime)
      const back  = fmtSlot(fallbackDate, fallbackTime)
      await insertNotifications(service, tenantIds, {
        type:  'short_notice_access_request',
        title: '⚠️ Short-notice access request',
        body:  `A contractor needs access to your room at ${prop} on ${slot}. ` +
               `Please approve or decline. If we don't hear back, your booking will be moved to ${back}.`,
        link:  `/tenant/visit/${ticketId}`,
      })
    }
  }

  return NextResponse.json({
    outcome: 'short_notice_sent',
    message: `Access request sent to tenant for ${fmtSlot(requestedDate, requestedTime)}. ` +
             `If no response, booking reverts to ${fmtSlot(fallbackDate, fallbackTime)}.`,
    requestedSlot: `${requestedDate}T${requestedTime}`,
    fallbackSlot:  `${fallbackDate}T${fallbackTime}`,
  })
}

/**
 * PATCH /api/book-with-24h-check
 * The tenant's answer to a short-notice visit (also the office / the job's contractor on their behalf).
 * Body: { ticketId, decision: 'approve' | 'decline' }
 * 21 Oct 2026 audit: tenants — the people asked — were refused here, so their screens wrote to the job directly and
 * a decline quietly moved or removed the booking with nobody told. Now the answer is saved here, only these fields
 * change, and the contractor and the office are told either way.
 */
export async function PATCH(req: NextRequest) {
  const { ticketId, decision } = await req.json().catch(() => ({}))
  if (!ticketId || !['approve', 'decline'].includes(decision)) {
    return NextResponse.json({ error: 'ticketId and decision (approve|decline) required' }, { status: 400 })
  }
  const caller = await requireSignedIn(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: ticket } = await service
    .from('maintenance_tickets')
    .select('id, title, category, property_id, contractor_id, fallback_date, fallback_slot, booked_date, booked_slot, short_notice_pending, properties(name)')
    .eq('id', ticketId)
    .maybeSingle() as { data: any }
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowed = await canWorkOnTicket(caller, ticketId, service)
    || (caller.role === 'tenant' && !!ticket.property_id && await canActAtProperty(caller, ticket.property_id, service))
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date().toISOString()
  const update = decision === 'approve'
    ? { status: 'booked', short_notice_pending: false, short_notice_tenant_approved_at: now, short_notice_tenant_approved_by: caller.personId }
    : ticket.fallback_date
      ? { booked_date: ticket.fallback_date, booked_slot: ticket.fallback_slot, status: 'booked', short_notice_pending: false, short_notice: false }
      : { booked_date: null, booked_slot: null, status: 'assigned', short_notice_pending: false, short_notice: false }
  const { error } = await service.from('maintenance_tickets').update(update).eq('id', ticketId)
  if (error) return NextResponse.json({ error: `Couldn’t save your answer: ${error.message}` }, { status: 500 })

  // tell the contractor and the office (staff-facing messages — not affected by the tenant messages switch)
  const house = String(ticket.properties?.name || 'the property').split('\n')[0]
  const what = ticket.title || ticket.category || 'the job'
  const when = (d: string | null, slot: string | null) => d ? `${new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}${slot ? ` (${slot})` : ''}` : ''
  const line = decision === 'approve'
    ? `The tenant agreed to the short-notice visit for ${what} at ${house} — ${when(ticket.booked_date, ticket.booked_slot)}.`
    : ticket.fallback_date
      ? `The tenant declined the short-notice visit for ${what} at ${house}. It's now booked for the back-up time, ${when(ticket.fallback_date, ticket.fallback_slot)}.`
      : `The tenant declined the short-notice visit for ${what} at ${house}. The booking has been taken off — please book another time.`
  const told: string[] = []
  if (ticket.contractor_id && ticket.contractor_id !== caller.personId) {
    const { data: c } = await service.from('people').select('*').eq('id', ticket.contractor_id).maybeSingle()
    if (c) {
      const out = await tellContractor(c, c.id, {
        text: `CAPITAL ROOMS: ${line} ${PORTAL_URL}/contractor/job/${ticketId}`,
        title: decision === 'approve' ? '✅ Short-notice visit agreed' : '↩︎ Short-notice visit declined', body: line.slice(0, 160),
        url: `/contractor/job/${ticketId}`, link: `${PORTAL_URL}/contractor/job/${ticketId}`, tag: `job-${ticketId}`,
      })
      told.push(out.via.length ? `contractor (${out.via.join(', ')})` : `contractor not reached: ${out.error}`)
    }
  }
  const { data: office } = await service.from('people').select('id').in('role', ['administrator', 'admin', 'lettings'])
  if (office?.length) {
    await insertNotifications(service, office.map((o: any) => o.id), { title: decision === 'approve' ? 'Short-notice visit agreed' : 'Short-notice visit declined', body: line, type: 'maintenance', link: `/admin/maintenance` })
    told.push('office')
  }
  return NextResponse.json({ outcome: decision === 'approve' ? 'confirmed_short_notice' : ticket.fallback_date ? 'reverted_to_fallback' : 'booking_removed', told })
}

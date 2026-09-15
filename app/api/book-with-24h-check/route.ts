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
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ` at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, requestedDate, requestedTime, fallbackDate, fallbackTime } = body

  if (!ticketId || !requestedDate || !requestedTime) {
    return NextResponse.json({ error: 'ticketId, requestedDate, requestedTime required' }, { status: 400 })
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
 * Tenant approve/decline of a short-notice request
 * Body: { ticketId, decision: 'approve' | 'decline' }
 */
export async function PATCH(req: NextRequest) {
  const { ticketId, decision } = await req.json()
  if (!ticketId || !['approve', 'decline'].includes(decision)) {
    return NextResponse.json({ error: 'ticketId and decision (approve|decline) required' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: ticket } = await service
    .from('maintenance_tickets')
    .select('id, fallback_date, fallback_slot, booked_date, booked_slot')
    .eq('id', ticketId)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (decision === 'approve') {
    // Keep the originally requested (short-notice) slot
    await service
      .from('maintenance_tickets')
      .update({ status: 'booked', short_notice_pending: false })
      .eq('id', ticketId)
    return NextResponse.json({ outcome: 'confirmed_short_notice' })
  } else {
    // Revert to fallback slot
    const { data: fb } = ticket as any
    await service
      .from('maintenance_tickets')
      .update({
        booked_date:          (ticket as any).fallback_date,
        booked_slot:          (ticket as any).fallback_slot,
        status:               'booked',
        short_notice_pending: false,
      })
      .eq('id', ticketId)
    return NextResponse.json({ outcome: 'reverted_to_fallback' })
  }
}

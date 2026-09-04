/**
 * POST { ticketId }
 *
 * Sends a personal notification to the tenant in the specific room being
 * worked on — e.g. "A contractor will need access to your room on Fri 5 Sep."
 *
 * Only fires when the job has a room_id (property-wide jobs don't need this;
 * all tenants are already notified by the main notify-booking route).
 *
 * Respects TENANT_COMMS_LIVE kill switch and the usual RLS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCommsLive } from '@/lib/comms'
import { activeTenantIds, insertNotifications, tryEmailFallback } from '@/lib/serverNotify'
import { slotLabel } from '@/lib/booking'
import { getTemplate, render } from '@/lib/messageTemplate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export async function POST(req: NextRequest) {
  // Called from contractor job page (browser fetch, no server session).
  // Gated by ticketId (UUID); service client enforces RLS.

  // Master kill switch
  if (!await getCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }

  const { ticketId } = await req.json()
  if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch the job
  const { data: ticket, error } = await service
    .from('maintenance_tickets')
    .select('id, title, room_id, property_id, booked_date, booked_slot, properties(name)')
    .eq('id', ticketId)
    .single()

  if (error || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Only relevant for room-specific jobs
  if (!ticket.room_id) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_room_id' })
  }

  if (!ticket.booked_date) {
    return NextResponse.json({ error: 'Ticket has no booked date' }, { status: 400 })
  }

  const propertyName = (ticket.properties as any)?.name ?? 'your property'
  const dateStr = fmtDate(ticket.booked_date)
  const timeStr = ticket.booked_slot ? slotLabel(ticket.booked_slot) : null
  const when = timeStr ? `${dateStr}, ${timeStr}` : dateStr

  const tpl = await getTemplate('contractor-room-access')
  const vars = { property_name: propertyName, when, ticket_title: ticket.title, date_str: dateStr }

  const notifyTitle = tpl
    ? render(tpl.subject_line, vars)
    : `Contractor accessing your room — ${dateStr}`
  const notifyBody = tpl
    ? render(tpl.template_text, vars)
    : `A contractor will need access to your room at ${propertyName} on ${when}. Work: ${ticket.title}. Please make sure your room is accessible and any valuables are stored safely.`

  // Get the tenant(s) in this specific room
  const recipientIds = await activeTenantIds(service, ticket.property_id, ticket.room_id)

  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_tenants_in_room' })
  }

  // In-app notification
  const { count } = await insertNotifications(
    service,
    recipientIds,
    {
      title: notifyTitle,
      body: notifyBody,
      type: 'maintenance',
      link: '/tenant',
    },
    { propertyId: ticket.property_id, roomId: ticket.room_id }
  )

  // Push (best-effort, respects kill switch in push/send)
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
    fetch(`${base}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: ticket.property_id,
        roomId: ticket.room_id,
        title: 'Capital Rooms',
        body: notifyBody,
        url: '/tenant',
      }),
    }).catch(() => {})
  } catch { /* best-effort */ }

  // Email fallback for tenants without push subscriptions
  await tryEmailFallback(service, recipientIds, {
    title: notifyTitle,
    body: notifyBody,
    type: 'maintenance',
    link: '/tenant',
  })

  return NextResponse.json({ ok: true, notified: count, recipientIds })
}

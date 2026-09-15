/**
 * PATCH /api/admin/visit-requests
 *
 * Admin approves or declines a tenant add-on request.
 *
 * Body: { requestId, decision: 'approved' | 'declined', adminResponse? }
 *
 * On approve:
 *   - Creates a new sub-ticket merged into the parent (merged_into_ticket_id)
 *   - Updates request.status = 'approved', request.merged_ticket_id = new ticket id
 *   - Notifies the tenant
 *
 * On decline:
 *   - Updates request.status = 'declined'
 *   - Notifies the tenant
 *
 * GET /api/admin/visit-requests?status=pending
 *   Returns all pending add-on requests (for the admin maintenance panel)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { insertNotifications } from '@/lib/serverNotify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'pending'

  const service = serviceClient()

  const { data, error } = await service
    .from('visit_tenant_requests')
    .select(`
      id, ticket_id, request_text, status, admin_response, reviewed_at, created_at,
      merged_ticket_id,
      tenant: tenant_person_id (id, first_name, last_name),
      ticket: ticket_id (
        id, title, booked_date, booked_slot,
        properties (name, address),
        rooms (name)
      )
    `)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data || [] })
}

export async function PATCH(req: NextRequest) {
  const { requestId, decision, adminResponse } = await req.json()

  if (!requestId || !['approved', 'declined'].includes(decision)) {
    return NextResponse.json(
      { error: 'requestId and decision (approved|declined) required' },
      { status: 400 }
    )
  }

  // Auth check via bearer token
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }

  const service = serviceClient()

  // Verify token and check admin role
  const { data: authData } = await service.auth.getUser(token)
  if (!authData?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }
  const { data: adminPerson } = await service
    .from('people')
    .select('id, role')
    .eq('email', authData.user.email)
    .single()
  if (!['administrator', 'admin'].includes(adminPerson?.role || '')) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }
  const adminPersonId = adminPerson?.id

  // Load the request + parent ticket
  const { data: vr, error: vrErr } = await service
    .from('visit_tenant_requests')
    .select(`
      id, ticket_id, request_text, tenant_person_id, status,
      ticket: ticket_id (
        id, title, booked_date, booked_slot, property_id, room_id,
        properties (name)
      )
    `)
    .eq('id', requestId)
    .single()

  if (vrErr || !vr) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (vr.status !== 'pending') {
    return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 })
  }

  const parentTicket = vr.ticket as any
  const propName = parentTicket?.properties?.name ?? 'the property'

  if (decision === 'declined') {
    // Update request status
    await service
      .from('visit_tenant_requests')
      .update({
        status: 'declined',
        admin_response: adminResponse || null,
        reviewed_by: adminPersonId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    // Notify tenant
    await insertNotifications(service, [vr.tenant_person_id], {
      title: 'Add-on request declined',
      body: adminResponse
        ? `Your request to add to the visit has been declined: ${adminResponse}`
        : `Your request to add extra work to the visit at ${propName} has been declined.`,
      type: 'visit_addon_response',
      link: `/tenant/visit/${vr.ticket_id}`,
    })

    return NextResponse.json({ ok: true, outcome: 'declined' })
  }

  // ── Approved ──────────────────────────────────────────────────────────────
  // Create a new sub-ticket merged into the parent
  const { data: newTicket, error: createErr } = await service
    .from('maintenance_tickets')
    .insert({
      title: `[Add-on] ${vr.request_text.slice(0, 100)}`,
      description: vr.request_text,
      category: 'general',
      priority: 'medium',
      status: 'assigned',
      property_id: parentTicket.property_id,
      room_id: parentTicket.room_id,
      booked_date: parentTicket.booked_date,
      booked_slot: parentTicket.booked_slot,
      merged_into_ticket_id: parentTicket.id,
      // Carry the same contractor from the parent
      contractor_id: parentTicket.contractor_id ?? null,
      approved_at: new Date().toISOString(),
      approved_by: adminPersonId,
      reporter_id: vr.tenant_person_id,
    })
    .select('id')
    .single()

  if (createErr || !newTicket) {
    return NextResponse.json({ error: createErr?.message ?? 'Failed to create sub-ticket' }, { status: 500 })
  }

  // Update request
  await service
    .from('visit_tenant_requests')
    .update({
      status: 'approved',
      admin_response: adminResponse || null,
      reviewed_by: adminPersonId,
      reviewed_at: new Date().toISOString(),
      merged_ticket_id: newTicket.id,
    })
    .eq('id', requestId)

  // Notify tenant
  await insertNotifications(service, [vr.tenant_person_id], {
    title: '✅ Add-on request approved',
    body: adminResponse
      ? `Your request has been approved and added to the visit. ${adminResponse}`
      : `Your request to add "${vr.request_text.slice(0, 60)}${vr.request_text.length > 60 ? '…' : ''}" to the visit has been approved.`,
    type: 'visit_addon_response',
    link: `/tenant/visit/${vr.ticket_id}`,
  })

  return NextResponse.json({ ok: true, outcome: 'approved', mergedTicketId: newTicket.id })
}

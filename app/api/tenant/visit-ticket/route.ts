/**
 * GET /api/tenant/visit-ticket?ticketId=...
 *
 * Fetches a maintenance ticket for the tenant visit page.
 * Uses the service client to bypass RLS, but verifies the requesting user
 * has a tenancy in the same room as the ticket (or is an admin/contractor).
 *
 * Also returns other open tickets in the same room and visit requests.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const ticketId = req.nextUrl.searchParams.get('ticketId')
  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
  }

  // Auth: verify bearer token passed by the client
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const service = serviceClient()

  // Verify the token with Supabase auth
  const { data: authData } = await service.auth.getUser(token)
  if (!authData?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Look up person from email
  const { data: person } = await service
    .from('people')
    .select('id, role')
    .eq('email', authData.user.email)
    .single()

  // Fetch ticket (no contractor join — fetch separately to avoid FK cache issues)
  const { data: ticket, error: tErr } = await service
    .from('maintenance_tickets')
    .select(`
      id, title, description, category, status,
      booked_date, booked_slot, arrived_at,
      room_id, property_id, contractor_id,
      short_notice, short_notice_tenant_approved_at,
      short_notice_pending, fallback_date, fallback_slot,
      properties(name, address),
      rooms(name)
    `)
    .eq('id', ticketId)
    .single()

  if (tErr || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Fetch contractor name separately
  let contractor: { first_name: string | null; last_name: string | null } | null = null
  if ((ticket as any).contractor_id) {
    const { data: c } = await service
      .from('people')
      .select('first_name, last_name')
      .eq('id', (ticket as any).contractor_id)
      .single()
    contractor = c || null
  }
  const ticketWithContractor = { ...ticket, contractor }

  const personId = person?.id || null
  const role = (person as any)?.role || ''

  // Admins and contractors can always view
  const isAdminOrContractor = ['administrator', 'admin', 'contractor'].includes(role)

  if (!isAdminOrContractor && ticket.room_id && personId) {
    // Verify tenant has a tenancy in this room
    const { data: tenancy } = await service
      .from('tenancies')
      .select('id')
      .eq('room_id', ticket.room_id)
      .eq('person_id', personId)
      .limit(1)

    if (!tenancy?.length) {
      // Also allow if ticket is property-wide (no room_id) and tenant is in the property
      if (ticket.property_id) {
        const { data: anyTenancy } = await service
          .from('tenancies')
          .select('id, rooms!inner(property_id)')
          .eq('person_id', personId)
          .limit(1)

        const tenantInProp = (anyTenancy as any)?.[0]?.rooms?.property_id === ticket.property_id
        if (!tenantInProp) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
      } else {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }
  }

  // Fetch other open tickets in this room
  let otherTickets: any[] = []
  if (ticket.room_id) {
    const today = new Date().toISOString().split('T')[0]
    const { data: others } = await service
      .from('maintenance_tickets')
      .select('id, title, category, status, booked_date')
      .eq('room_id', ticket.room_id)
      .neq('id', ticketId)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false })
      .limit(5)
    otherTickets = others || []
  }

  // Fetch visit requests for this ticket
  const { data: requests } = await service
    .from('visit_tenant_requests')
    .select('id, request_text, status, admin_response, reviewed_at, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    ticket: ticketWithContractor,
    otherTickets,
    requests: requests || [],
    personId,
  })
}

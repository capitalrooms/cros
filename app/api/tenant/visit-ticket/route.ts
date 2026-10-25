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
      .select('salutation, first_name, last_name')
      .eq('id', (ticket as any).contractor_id)
      .single()
    contractor = c || null
  }
  const ticketWithContractor = { ...ticket, contractor }

  const personId = person?.id || null
  const role = (person as any)?.role || ''

  // the office can always view; a contractor only a job that's theirs (25 Oct 2026 security audit: any contractor
  // could read any job — house, room, description and booking — by its id)
  const isAdminOrContractor = ['administrator', 'admin', 'lettings'].includes(role)
    || (role === 'contractor' && (ticket as any).contractor_id === (person as any)?.id)

  // everyone else: a tenant of that room — or of that house, for a shared-area job. It used to skip the check for
  // a job with no room, or a sign-in with no person, letting anyone signed in read it (25 Oct 2026).
  if (!isAdminOrContractor) {
    if (!personId) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    let q = service.from('tenancies').select('id')
      .or(`person_id.eq.${personId},co_tenant_id.eq.${personId}`)   // joint tenants too
      .is('let_cancelled_at', null)
      .or(`end_date.is.null,end_date.gte.${new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)}`)
    q = ticket.room_id ? q.eq('room_id', ticket.room_id) : q.eq('property_id', (ticket as any).property_id ?? '00000000-0000-0000-0000-000000000000')
    const { data: mine } = await q.limit(1)
    if (!mine?.length) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Fetch other open tickets in this room
  let otherTickets: any[] = []
  if (ticket.room_id) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
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

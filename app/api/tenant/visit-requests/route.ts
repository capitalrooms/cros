/**
 * POST /api/tenant/visit-requests
 *
 * Tenant submits a request to add extra work to an upcoming visit.
 * Creates a visit_tenant_requests row and notifies admin.
 *
 * Body: { ticketId, requestText }
 *
 * GET /api/tenant/visit-requests?ticketId=...
 * Returns pending/approved/declined requests for a ticket (for the visit page).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, canActAtProperty } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase'
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
  const ticketId = req.nextUrl.searchParams.get('ticketId')
  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
  }

  const service = serviceClient()

  const { data, error } = await service
    .from('visit_tenant_requests')
    .select(`
      id, ticket_id, request_text, status, admin_response,
      reviewed_at, created_at,
      tenant: tenant_person_id (first_name, last_name),
      reviewer: reviewed_by (first_name, last_name)
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data || [] })
}

export async function POST(req: NextRequest) {
  const { ticketId, requestText } = await req.json()

  if (!ticketId || !requestText?.trim()) {
    return NextResponse.json({ error: 'ticketId and requestText required' }, { status: 400 })
  }

  const service = serviceClient()

  // Verify the ticket exists and get property info
  const { data: ticket, error: tErr } = await service
    .from('maintenance_tickets')
    .select('id, title, room_id, property_id, booked_date, properties(name)')
    .eq('id', ticketId)
    .single()

  if (tErr || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Identify the calling tenant via Bearer token
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const { data: authData } = await service.auth.getUser(token)
  if (!authData?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: person } = await service
    .from('people')
    .select('id, first_name, last_name')
    .eq('email', authData.user.email)
    .single()

  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }
  // only a tenant living at that property (or the office) can send a request about its visit
  if (!ticket.property_id || !(await canActAtProperty(await requireSignedIn(req), ticket.property_id))) return NextResponse.json({ error: 'Not your property' }, { status: 403 })

  // Create the request
  const { data: visitRequest, error: insErr } = await service
    .from('visit_tenant_requests')
    .insert({
      ticket_id: ticketId,
      tenant_person_id: person.id,
      request_text: requestText.trim(),
      status: 'pending',
    })
    .select()
    .single()

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // Notify admin — find all admins for this property
  try {
    const { data: admins } = await service
      .from('people')
      .select('id')
      .in('role', ['administrator', 'admin'])

    if (admins && admins.length > 0) {
      const adminIds = admins.map((a: any) => a.id)
      const tenantName = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'A tenant'
      const propName = (ticket.properties as any)?.name ?? 'a property'

      await insertNotifications(service, adminIds, {
        title: `🔧 Add-on request — ${propName}`,
        body: `${tenantName} wants to add to an upcoming visit: "${requestText.trim().slice(0, 80)}${requestText.trim().length > 80 ? '…' : ''}"`,
        type: 'visit_addon_request',
        link: `/admin/maintenance?visitRequest=${visitRequest.id}`,
      })
    }
  } catch (e) {
    // Notification failure must not block the successful insert
    console.error('Failed to notify admin of visit request:', e)
  }

  return NextResponse.json({ ok: true, request: visitRequest })
}

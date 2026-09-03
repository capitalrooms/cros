import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST — tenant submits early move-out request */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tenancy_id, person_id, property_id, room_id, requested_move_out_date, reason, track } = await req.json()

  if (!tenancy_id || !person_id || !requested_move_out_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify the tenancy belongs to the requester
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id, person_id, rent_amount, start_date')
    .eq('id', tenancy_id)
    .maybeSingle()

  if (!tenancy) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })

  // Allow admin override; otherwise enforce ownership
  const role = (user.assignment as any)?.role || ''
  if (!['administrator', 'admin'].includes(role) && tenancy.person_id !== person_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check for existing open request
  const { data: existing } = await supabase
    .from('early_move_out_requests')
    .select('id')
    .eq('tenancy_id', tenancy_id)
    .not('status', 'in', '("withdrawn","rejected")')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'An open request already exists for this tenancy' }, { status: 409 })
  }

  // Calculate daily rate for later use in refund calc
  const daily_rate = tenancy.rent_amount ? Math.round(tenancy.rent_amount * 12 / 365 * 100) / 100 : null

  const { data, error } = await supabase
    .from('early_move_out_requests')
    .insert({
      tenancy_id,
      person_id,
      property_id: property_id || null,
      room_id: room_id || null,
      requested_move_out_date,
      reason: reason || null,
      track: track || 'standard',
      status: 'pending',
      daily_rate,
    })
    .select('id')
    .single()

  if (error) {
    console.error('early_move_out_requests insert error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, request_id: data.id })
}

/** PATCH — admin approves AP1/AP2, or tenant withdraws */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (user.assignment as any)?.role || ''
  const isAdmin = ['administrator', 'admin'].includes(role)

  const body = await req.json()
  const { request_id } = body

  if (!request_id) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Fetch the request
  const { data: req0 } = await supabase
    .from('early_move_out_requests')
    .select('id, person_id, status, daily_rate')
    .eq('id', request_id)
    .maybeSingle()

  if (!req0) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Tenant can only withdraw their own
  if (!isAdmin && body.status === 'withdrawn' && req0.person_id !== (user.assignment as any)?.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isAdmin && body.status !== 'withdrawn') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  // Build update payload
  type UpdatePayload = {
    status?: string
    admin_response_ap1?: string
    ap1_approved_at?: string
    ap1_approved_by?: string
    admin_response_ap2?: string
    ap2_approved_at?: string
    ap2_approved_by?: string
    replacement_tenant_name?: string
    replacement_tenant_email?: string
    refund_days?: number
    refund_amount?: number
    voucher_amount?: number
  }
  const update: UpdatePayload = {}
  const adminId = (user.assignment as any)?.id

  if (body.status === 'withdrawn') {
    update.status = 'withdrawn'
  } else if (body.action === 'ap1_approve') {
    update.status = 'ap1_approved'
    update.admin_response_ap1 = body.admin_response_ap1 || null
    update.ap1_approved_at = new Date().toISOString()
    update.ap1_approved_by = adminId
  } else if (body.action === 'ap2_approve') {
    update.status = 'ap2_approved'
    update.admin_response_ap2 = body.admin_response_ap2 || null
    update.ap2_approved_at = new Date().toISOString()
    update.ap2_approved_by = adminId
    update.replacement_tenant_name = body.replacement_tenant_name || null
    update.replacement_tenant_email = body.replacement_tenant_email || null
    // Refund calc
    if (body.refund_days && req0.daily_rate) {
      update.refund_days = body.refund_days
      update.refund_amount = Math.round(body.refund_days * req0.daily_rate * 100) / 100
    } else if (body.refund_amount) {
      update.refund_amount = body.refund_amount
    }
    if (body.voucher_amount) update.voucher_amount = body.voucher_amount
  } else if (body.action === 'reject') {
    update.status = 'rejected'
    update.admin_response_ap1 = body.admin_response_ap1 || null
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { error } = await supabase.from('early_move_out_requests').update(update).eq('id', request_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

/** GET — admin: list all pending requests (optionally filtered by property) */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes((user.assignment as any)?.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('early_move_out_requests')
    .select(`
      id, status, track, requested_move_out_date, reason, created_at,
      admin_response_ap1, admin_response_ap2,
      replacement_tenant_name, replacement_tenant_email,
      refund_days, refund_amount, voucher_amount, daily_rate,
      person_id, tenancy_id, property_id, room_id,
      people:person_id (id, first_name, last_name, full_name, email),
      properties:property_id (name, address),
      rooms:room_id (name)
    `)
    .order('created_at', { ascending: false })

  return NextResponse.json({ requests: data || [] })
}

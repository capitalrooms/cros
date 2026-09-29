/**
 * POST /api/admin/reconciliation
 * Confirm or reject a landlord_statement_rooms row.
 *
 * Body: { id: string, action: 'confirm' | 'reject', rejection_note?: string }
 *
 * On confirm:
 *   - Marks the LSR row confirmed
 *   - If rent_charge_id is set: updates rent_charges (amount_received, status='paid')
 *   - If no rent_charge_id but room_id + charge_month present: creates/upserts the charge
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })

  // Auth check
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await supabase
    .from('people')
    .select('id, role')
    .eq('email', session.user.email)
    .single()

  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, action, rejection_note } = body

  if (!id || !['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 })
  }

  // Fetch the LSR row
  const { data: lsr, error: fetchErr } = await supabase
    .from('landlord_statement_rooms')
    .select('*, statement:landlord_statements(period_start, period_end, statement_date)')
    .eq('id', id)
    .single()

  if (fetchErr || !lsr) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

  if (action === 'reject') {
    const { error } = await supabase
      .from('landlord_statement_rooms')
      .update({ rejected: true, rejection_note: rejection_note || null, confirmed: false })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // action === 'confirm'
  const now = new Date().toISOString()

  // Determine charge_month from statement period
  const periodEnd = lsr.statement?.period_end || lsr.statement?.statement_date
  const chargeMonth = periodEnd ? periodEnd.slice(0, 7) + '-01' : null

  let rentChargeId = lsr.rent_charge_id

  if (!rentChargeId && lsr.room_id && chargeMonth) {
    // Try to find or create the rent_charge row
    const { data: existing } = await supabase
      .from('rent_charges')
      .select('id')
      .eq('room_id', lsr.room_id)
      .eq('charge_month', chargeMonth)
      .maybeSingle()

    if (existing) {
      rentChargeId = existing.id
    } else {
      // Create one — we know the room and month, use LSR amount as amount_due
      const { data: created } = await supabase
        .from('rent_charges')
        .insert({
          room_id: lsr.room_id,
          property_id: lsr.property_id,
          charge_month: chargeMonth,
          amount_due: lsr.rent_income,
          amount_received: 0,
          status: 'pending',
        })
        .select('id')
        .single()
      rentChargeId = created?.id ?? null
    }
  }

  // Update the rent_charge as paid
  if (rentChargeId) {
    const { error: rcErr } = await supabase
      .from('rent_charges')
      .update({
        amount_received: lsr.rent_income,
        status: 'paid',
      })
      .eq('id', rentChargeId)
    if (rcErr) console.error('reconciliation: rent_charges update failed', rcErr.message)
  }

  // Mark LSR confirmed
  const { error: lsrErr } = await supabase
    .from('landlord_statement_rooms')
    .update({
      confirmed: true,
      confirmed_at: now,
      confirmed_by: person.id,
      rejected: false,
      rejection_note: null,
      ...(rentChargeId ? { rent_charge_id: rentChargeId } : {}),
    })
    .eq('id', id)

  if (lsrErr) return NextResponse.json({ error: lsrErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, rent_charge_id: rentChargeId })
}

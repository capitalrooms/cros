/**
 * POST /api/admin/rent-charges/[id]/pay
 * Manually record a payment against a rent charge.
 *
 * This is the fallback path when:
 *   - You don't want to import today's bank statement yet (mid-day cut-off)
 *   - A payment was made by cash, cheque, or another method
 *   - You need to record a partial payment
 *
 * Rules:
 *   - Cannot pay a voided charge
 *   - Cannot double-pay: if status is already 'paid', return a clear error
 *     with the existing payment details so the caller can decide if this is
 *     a genuine second payment or a mistake
 *   - Partial payments are allowed: amount_received < amount_due → status = 'partial'
 *   - Overpayment is allowed but flagged in the response for admin awareness
 *
 * Every action is written to payment_audit_log.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const supabase = createRouteHandlerClient({ cookies })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await supabase
    .from('people').select('id, role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { amount_received, payment_date, payment_method, payment_notes } = body

  if (amount_received == null || isNaN(Number(amount_received)) || Number(amount_received) <= 0)
    return NextResponse.json({ error: 'amount_received must be a positive number' }, { status: 400 })
  if (!payment_date)
    return NextResponse.json({ error: 'payment_date is required' }, { status: 400 })
  if (!payment_method || !['bank_transfer','standing_order','cash','cheque','other'].includes(payment_method))
    return NextResponse.json({ error: 'payment_method must be one of: bank_transfer, standing_order, cash, cheque, other' }, { status: 400 })

  const received = Math.round(Number(amount_received) * 100) / 100

  const { data: charge, error: fetchErr } = await supabase
    .from('rent_charges').select('*').eq('id', params.id).single()
  if (fetchErr || !charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (charge.voided) return NextResponse.json({ error: 'Cannot record payment against a voided charge' }, { status: 400 })

  // Double-payment guard — if already paid, return details and block
  if (charge.status === 'paid') {
    return NextResponse.json({
      error: 'This charge is already marked as paid. If this is a genuine second payment, use the bank import flow to log it as an unallocated credit.',
      existing_payment: {
        amount_received: charge.amount_received,
        paid_at: charge.paid_at,
        payment_method: charge.payment_method,
        payment_notes: charge.payment_notes,
      }
    }, { status: 409 })
  }

  // This payment is added to anything already received (part payments build up)
  const due = Number(charge.amount_due)
  const priorReceived = Number(charge.amount_received || 0)
  const total = Math.round((priorReceived + received) * 100) / 100
  const isOverpayment = total > due
  const status = total >= due ? 'paid' : 'partial'

  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('rent_charges')
    .update({
      amount_received: total,
      received_date: payment_date,
      status,
      paid_at: now,
      paid_by: person.id,
      payment_method,
      payment_notes: payment_notes?.trim() || null,
    })
    .eq('id', params.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await supabase.from('payment_audit_log').insert({
    rent_charge_id: params.id,
    action: 'manually_paid',
    performed_by: person.id,
    performed_at: now,
    old_value: { status: charge.status, amount_received: charge.amount_received },
    new_value: { status, amount_received: total, this_payment: received, payment_method, payment_date },
    note: payment_notes?.trim() || null,
  })

  return NextResponse.json({
    ok: true,
    status,
    amount_received: total,
    overpayment: isOverpayment ? Math.round((total - due) * 100) / 100 : 0,
    overpayment_warning: isOverpayment
      ? `Payments of £${total.toFixed(2)} exceed the charge of £${due.toFixed(2)} by £${(total - due).toFixed(2)}. Consider holding the excess as an unallocated credit.`
      : null,
  })
}

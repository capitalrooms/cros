/**
 * POST /api/admin/rent-charges/[id]/void
 * Void (reverse) a payment that was recorded in error.
 *
 * Voiding resets the charge to 'pending' and clears all payment fields.
 * The void itself is logged in payment_audit_log so there is a permanent record
 * of both the original payment AND the reversal — nothing is ever deleted.
 *
 * If the charge was matched to a bank_transaction, that transaction is reset
 * to 'unmatched' so it can be re-matched or manually allocated.
 *
 * A reason (note) is required.
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
  if (!person || !['administrator', 'admin'].includes(person.role))
    return NextResponse.json({ error: 'Only administrators can void payments' }, { status: 403 })

  const { note } = await req.json()
  if (!note?.trim())
    return NextResponse.json({ error: 'A reason is required to void a payment' }, { status: 400 })

  const { data: charge, error: fetchErr } = await supabase
    .from('rent_charges').select('*').eq('id', params.id).single()
  if (fetchErr || !charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (charge.voided) return NextResponse.json({ error: 'This charge is already voided' }, { status: 400 })
  if (!['paid', 'partial'].includes(charge.status))
    return NextResponse.json({ error: 'Only paid or partial charges can be voided' }, { status: 400 })

  const now = new Date().toISOString()

  // Reset the charge to pending
  const { error: updateErr } = await supabase
    .from('rent_charges')
    .update({
      amount_received: 0,
      status: 'pending',
      paid_at: null,
      paid_by: null,
      payment_method: null,
      payment_notes: null,
      bank_transaction_id: null,
      voided: true,
      voided_at: now,
      voided_by: person.id,
      voided_note: note.trim(),
    })
    .eq('id', params.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // If linked to a bank_transaction, reset it to unmatched
  if (charge.bank_transaction_id) {
    await supabase
      .from('bank_transactions')
      .update({ status: 'unmatched', matched_rent_charge_id: null, matched_at: null, matched_by: null })
      .eq('id', charge.bank_transaction_id)
  }

  await supabase.from('payment_audit_log').insert({
    rent_charge_id: params.id,
    action: 'voided',
    performed_by: person.id,
    performed_at: now,
    old_value: {
      status: charge.status,
      amount_received: charge.amount_received,
      paid_at: charge.paid_at,
      payment_method: charge.payment_method,
    },
    new_value: { status: 'pending', amount_received: 0, voided: true },
    note: note.trim(),
  })

  return NextResponse.json({ ok: true })
}

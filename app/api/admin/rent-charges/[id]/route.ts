/**
 * PATCH /api/admin/rent-charges/[id]
 * Edit the amount_due on a rent charge.
 *
 * A reason (note) is required — this is a financial override and must be
 * traceable. The original amount_due is preserved on first edit.
 * Every change is written to payment_audit_log.
 *
 * Cannot edit a voided charge.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const supabase = createRouteHandlerClient({ cookies })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await supabase
    .from('people').select('id, role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { amount_due, note } = await req.json()

  if (amount_due == null || isNaN(Number(amount_due)) || Number(amount_due) <= 0)
    return NextResponse.json({ error: 'amount_due must be a positive number' }, { status: 400 })
  if (!note?.trim())
    return NextResponse.json({ error: 'A reason (note) is required when editing the amount due' }, { status: 400 })

  const newAmount = Math.round(Number(amount_due) * 100) / 100

  // Fetch current state
  const { data: charge, error: fetchErr } = await supabase
    .from('rent_charges').select('*').eq('id', params.id).single()
  if (fetchErr || !charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (charge.voided) return NextResponse.json({ error: 'Cannot edit a voided charge' }, { status: 400 })

  const now = new Date().toISOString()
  const oldAmount = charge.amount_due

  // Preserve original if this is the first edit
  const amount_due_original = charge.amount_due_original ?? oldAmount

  const { error: updateErr } = await supabase
    .from('rent_charges')
    .update({
      amount_due: newAmount,
      amount_due_original,
      amount_due_note: note.trim(),
      amount_due_changed_at: now,
      amount_due_changed_by: person.id,
    })
    .eq('id', params.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Audit log
  await supabase.from('payment_audit_log').insert({
    rent_charge_id: params.id,
    action: 'amount_due_edited',
    performed_by: person.id,
    performed_at: now,
    old_value: { amount_due: oldAmount },
    new_value: { amount_due: newAmount },
    note: note.trim(),
  })

  return NextResponse.json({ ok: true, amount_due: newAmount })
}

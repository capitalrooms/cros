// PATCH  /api/admin/expenses/[id]  { share_invoice?, deduct_month?, category?, supplier?, invoice_number?, invoice_path?, invoice_name? }
// DELETE /api/admin/expenses/[id]?reason=…  — voids it (kept on record); only while it isn't on a statement
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { deductionMonth, monthName } from '@/lib/expenses/period'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: e } = await s.from('recharge_expenses').select('*').eq('id', id).maybeSingle()
  if (!e) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  const set: Record<string, unknown> = {}
  for (const k of ['category', 'supplier', 'invoice_number', 'invoice_name', 'supplier_payment_ref'] as const) if (k in b) set[k] = String(b[k] ?? '').trim() || null
  if ('paid_to_supplier_on' in b) set.paid_to_supplier_on = /^\d{4}-\d{2}-\d{2}$/.test(b.paid_to_supplier_on || '') ? b.paid_to_supplier_on : null
  if ('supplier_payment_method' in b) set.supplier_payment_method = ['card', 'bank_transfer', 'cash', 'direct_debit'].includes(b.supplier_payment_method) ? b.supplier_payment_method : null
  if ('invoice_path' in b) set.invoice_path = b.invoice_path && String(b.invoice_path).startsWith('invoices/') ? b.invoice_path : null
  if ('share_invoice' in b) set.share_invoice = !!b.share_invoice && !!(set.invoice_path ?? e.invoice_path)
  let message = 'Saved.'
  if ('deduct_month' in b) {
    if (e.included_in_statement_id) return NextResponse.json({ error: 'This expense is already on a statement' }, { status: 409 })
    const when = await deductionMonth(s, e.property_id, e.expense_date, b.deduct_month || null)
    set.deduct_month = b.deduct_month ? when.month : null
    message = `It will come off the ${monthName(when.month)} statement.${when.adjusted ? ' That month has already gone out, so it moves to the next one.' : ''}`
  }
  const { data, error } = await s.from('recharge_expenses').update(set).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expense: data, message })
}

// Void (never delete): the expense and its number stay on record with who voided it, when and why.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const reason = String(req.nextUrl.searchParams.get('reason') || '').trim()
  if (reason.length < 3) return NextResponse.json({ error: 'Say why it’s being voided (e.g. “entered twice”).' }, { status: 400 })
  const s = createServiceClient()
  const { data: e } = await s.from('recharge_expenses').select('id, included_in_statement_id, voided_at').eq('id', id).maybeSingle()
  if (!e) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  if (e.voided_at) return NextResponse.json({ error: 'Already voided' }, { status: 409 })
  if (e.included_in_statement_id) return NextResponse.json({ error: 'This expense is on a statement that has been prepared, so it stays. Put a correction on the next statement instead.' }, { status: 409 })
  const { error } = await s.from('recharge_expenses').update({ voided_at: new Date().toISOString(), voided_by: admin.personId, void_reason: reason, share_invoice: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, message: 'Voided — kept on record with your reason.' })
}

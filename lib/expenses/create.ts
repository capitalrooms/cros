// The one way a landlord expense is added — from Expenses, an approved contractor invoice, or a bill filed from
// Capture (photo or email). Same checks every time:
//   · amount, date and description are real; the date isn't in the future
//   · duplicate check against everything on record for the property (logged expenses and past statement lines),
//     unless the admin has looked at the match and said it's not the same
//   · it comes off the first statement for that property that hasn't gone out (or the month chosen, if still open)
//   · source + source_ref (migration 208): a database-unique key, so one document can never become two expenses
import type { SupabaseClient } from '@supabase/supabase-js'
import { findDuplicates, type ExpenseLike } from '@/lib/expenses/duplicates'
import { deductionMonth, monthName, closedMonths, firstOpenMonth, addMonths } from '@/lib/expenses/period'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const isDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

export interface NewExpense {
  property_id: string; description: string; amount: number; expense_date: string
  supplier?: string | null; invoice_number?: string | null; category?: string | null; room_id?: string | null; notes?: string | null
  deduct_month?: string | null; invoice_path?: string | null; invoice_name?: string | null; share_invoice?: boolean
  paid_to_supplier_on?: string | null; supplier_payment_method?: string | null; supplier_payment_ref?: string | null
  source?: 'manual' | 'supplier_invoice' | 'capture'; source_ref?: string | null
}
export type AddResult =
  | { ok: true; expense: any; deductMonth: string; message: string }
  | { ok: false; status: number; error?: string; duplicates?: { level: string; reason: string; description: string; amount: number; date: string; where: string }[] }

/** Duplicate matches for an expense that hasn't been saved yet (empty when none). */
export async function expenseDuplicates(s: SupabaseClient, e: Pick<NewExpense, 'property_id' | 'description' | 'amount' | 'expense_date' | 'invoice_number' | 'room_id'>) {
  const since = new Date(Date.parse(e.expense_date) - 400 * 86_400_000).toISOString().slice(0, 10)
  const [ex, lines] = await Promise.all([
    s.from('recharge_expenses').select('*').eq('property_id', e.property_id).gte('expense_date', since),
    s.from('statement_line_items').select('id, description, amount, statement_date, recharge_expense_id, category_type').eq('property_id', e.property_id).gte('statement_date', since),
  ])
  const pool: ExpenseLike[] = [
    ...((ex.data ?? []) as any[]).filter(x => !x.voided_at).map(x => ({ id: x.id, description: x.description, amount: Number(x.amount), date: x.expense_date, invoiceNumber: x.invoice_number ?? null, roomId: x.room_id ?? null, source: 'expense' as const, label: `${x.txn_no ?? x.reference ?? 'Expense'} · logged ${x.expense_date}` })),
    ...((lines.data ?? []) as any[]).filter(l => !l.recharge_expense_id && Number(l.amount) > 0).map(l => ({ id: l.id, description: l.description, amount: Number(l.amount), date: l.statement_date, source: 'statement' as const, label: `on the statement dated ${l.statement_date}` })),
  ]
  return findDuplicates({ description: e.description, amount: e.amount, date: e.expense_date, invoiceNumber: e.invoice_number || null, roomId: e.room_id || null }, pool)
    .slice(0, 3).map(h => ({ level: h.level, reason: h.reason, description: h.match.description, amount: h.match.amount, date: h.match.date, where: h.match.label ?? '' }))
}

/** The statements an expense could come off: the first still open from its date, and the one after. */
export async function statementChoices(s: SupabaseClient, propertyId: string, expenseDate: string) {
  const closed = await closedMonths(s, propertyId)
  const first = firstOpenMonth(expenseDate, closed)
  // "this month's run" = the current month's statement, if it's still open and not before the invoice
  const thisMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7) + '-01'
  const start = first < thisMonth && !closed.has(thisMonth) ? thisMonth : first
  const next = firstOpenMonth(addMonths(start, 1), closed)
  return [start, next].map(m => ({ month: m, label: `${monthName(m)} statement` }))
}

export async function addLandlordExpense(s: SupabaseClient, e: NewExpense, opts: { by: string | null; confirmDuplicate?: boolean }): Promise<AddResult> {
  const amount = r2(Number(e.amount))
  const description = String(e.description || '').trim()
  if (!e.property_id) return { ok: false, status: 400, error: 'Choose the property' }
  if (!description) return { ok: false, status: 400, error: 'Say what the expense was for' }
  if (!(amount > 0) || amount > 1_000_000) return { ok: false, status: 400, error: 'Enter the amount (more than £0)' }
  if (!isDate(e.expense_date)) return { ok: false, status: 400, error: 'Enter the date on the invoice or receipt' }
  if (e.expense_date > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) return { ok: false, status: 400, error: 'The date is in the future' }
  const { data: prop } = await s.from('properties').select('id, name').eq('id', e.property_id).maybeSingle()
  if (!prop) return { ok: false, status: 404, error: 'Property not found' }
  if (e.source_ref) {
    const { data: already } = await s.from('recharge_expenses').select('txn_no').eq('source_ref', e.source_ref).maybeSingle()
    if (already) return { ok: false, status: 409, error: `This has already been added as ${already.txn_no ?? 'an expense'}` }
  }
  if (!opts.confirmDuplicate) {
    const duplicates = await expenseDuplicates(s, { ...e, amount, description })
    if (duplicates.length) return { ok: false, status: 409, duplicates }
  }
  const when = await deductionMonth(s, e.property_id, e.expense_date, e.deduct_month || null)
  const row: Record<string, unknown> = {
    property_id: e.property_id, description, amount, expense_date: e.expense_date,
    notes: String(e.notes || '').trim() || null, created_by: opts.by,   // txn_no (EXP000123) is given by the database
    category: e.category || null, supplier: String(e.supplier || '').trim() || null, invoice_number: String(e.invoice_number || '').trim() || null,
    room_id: e.room_id || null, deduct_month: e.deduct_month ? when.month : null,
    invoice_path: e.invoice_path && String(e.invoice_path).startsWith('invoices/') ? e.invoice_path : null,
    invoice_name: e.invoice_name || null, share_invoice: !!e.share_invoice && !!e.invoice_path,
    paid_to_supplier_on: isDate(e.paid_to_supplier_on) ? e.paid_to_supplier_on : null,
    supplier_payment_method: ['card', 'bank_transfer', 'cash', 'direct_debit'].includes(String(e.supplier_payment_method)) ? e.supplier_payment_method : null,
    supplier_payment_ref: String(e.supplier_payment_ref || '').trim() || null,
  }
  if (e.source_ref) Object.assign(row, { source: e.source ?? 'manual', source_ref: e.source_ref })
  let { data: expense, error } = await s.from('recharge_expenses').insert(row).select('*').single()
  // before migration 208 the source columns don't exist yet — save without them (the claim still stops doubles)
  if (error && /source/.test(error.message) && /column|schema cache/i.test(error.message)) {
    delete row.source; delete row.source_ref
    ;({ data: expense, error } = await s.from('recharge_expenses').insert(row).select('*').single())
  }
  if (error) {
    if (/source_ref/.test(error.message) && /duplicate|unique/i.test(error.message)) return { ok: false, status: 409, error: 'This has already been added as an expense' }
    return { ok: false, status: 500, error: error.message }
  }
  const where = String(prop.name || '').split('\n')[0]
  return {
    ok: true, expense, deductMonth: when.month,
    message: `Added ${expense.txn_no ?? ''} — £${amount.toFixed(2)} will come off the ${monthName(when.month)} statement for ${where}.${when.adjusted ? ' (That month’s statement has already gone out, so it moves to the next one.)' : ''}`.replace('Added  —', 'Added —'),
  }
}

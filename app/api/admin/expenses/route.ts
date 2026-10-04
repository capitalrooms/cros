// Landlord expenses (money spent on a property that comes off the landlord's statement).
//
// GET  ?property_id=&from=&to=&q=        every expense on record — logged in CROS (recharge_expenses) and imported
//                                         from past statements (statement_line_items) — newest first, with totals
// POST { property_id, description, amount, expense_date, supplier?, invoice_number?, category?, room_id?, notes?,
//        deduct_month?, share_invoice?, invoice_path?, invoice_name?, confirm_duplicate? }
//        → 409 { duplicates } when it looks like one already on record, unless confirm_duplicate is true
//        → { expense, deductMonth, message }
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { closedMonths, firstOpenMonth } from '@/lib/expenses/period'
import { addLandlordExpense } from '@/lib/expenses/create'
import { demoPropertyIds } from '@/lib/demoProperties'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const isDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const u = req.nextUrl.searchParams
  const propertyId = u.get('property_id'), from = u.get('from'), to = u.get('to'), q = (u.get('q') || '').toLowerCase().trim()

  let logged = s.from('recharge_expenses').select('*, properties(name), landlord_statements:included_in_statement_id(statement_reference, statement_date, payment_run_id)').order('expense_date', { ascending: false }).limit(5000)
  let imported = s.from('statement_line_items').select('id, property_id, description, amount, category, room_label, statement_date, statement_id, recharge_expense_id, source, properties(name), landlord_statements:statement_id(statement_reference)')
    .order('statement_date', { ascending: false }).limit(5000)
  if (propertyId) { logged = logged.eq('property_id', propertyId); imported = imported.eq('property_id', propertyId) }
  if (from && isDate(from)) { logged = logged.gte('expense_date', from); imported = imported.gte('statement_date', from) }
  if (to && isDate(to)) { logged = logged.lte('expense_date', to); imported = imported.lte('statement_date', to) }
  const [a, b] = await Promise.all([logged, imported])
  if (a.error) return NextResponse.json({ error: a.error.message }, { status: 500 })
  // practice (demo houses) only with ?practice=1; the real list never shows them
  const demo = await demoPropertyIds(s), practice = u.get('practice') === '1'
  a.data = ((a.data ?? []) as any[]).filter(r => demo.has(r.property_id) === practice) as any
  if (!b.error) b.data = ((b.data ?? []) as any[]).filter(r => demo.has(r.property_id) === practice) as any

  const rows = [
    ...((a.data ?? []) as any[]).map(e => ({
      id: e.id, kind: 'logged' as const, property_id: e.property_id, property: String(e.properties?.name || '').split('\n')[0],
      date: e.expense_date, description: e.description, amount: Number(e.amount), category: e.category ?? null, supplier: e.supplier ?? null,
      invoice_number: e.invoice_number ?? null, has_invoice: !!e.invoice_path, share_invoice: !!e.share_invoice, reference: e.txn_no ?? e.reference ?? null,
      voided: !!e.voided_at, void_reason: e.void_reason ?? null,
      paid_on: e.paid_to_supplier_on ?? null, paid_how: e.supplier_payment_method ?? null, paid_ref: e.supplier_payment_ref ?? null,
      statement: e.landlord_statements?.statement_reference ?? null, deduct_month: e.deduct_month ?? null, room_id: e.room_id ?? null,
      deducted_on: e.landlord_statements?.statement_date ?? null, run_id: e.landlord_statements?.payment_run_id ?? null, reimbursed_on: null as string | null,
    })),
    // lines from statements (imported from 10ninety or made here) that aren't already one of the logged expenses above
    ...((b.error ? [] : b.data ?? []) as any[]).filter(l => !l.recharge_expense_id).map(l => ({
      id: l.id, kind: 'statement' as const, property_id: l.property_id, property: String(l.properties?.name || '').split('\n')[0],
      date: l.statement_date, description: l.description, amount: Number(l.amount), category: l.category ?? null, supplier: null,
      invoice_number: null, has_invoice: false, share_invoice: false, reference: null, voided: false, void_reason: null, deducted_on: l.statement_date ?? null, run_id: null, reimbursed_on: null as string | null,
      statement: l.landlord_statements?.statement_reference ?? null, deduct_month: null, room_id: null, room_label: l.room_label ?? null,
    })),
  ].filter(r => !q || `${r.description} ${r.supplier ?? ''} ${r.category ?? ''} ${r.reference ?? ''} ${r.invoice_number ?? ''}`.toLowerCase().includes(q))
    .sort((x, y) => String(y.date).localeCompare(String(x.date)))

  // paid back to the office account: the expenses transfer of the payment run the statement was paid in
  const runIds = [...new Set(rows.map((r: any) => r.run_id).filter(Boolean))]
  if (runIds.length) {
    const { data: tr } = await s.from('office_transfers').select('payment_run_id, transferred_on').eq('kind', 'expenses').is('voided_at', null).in('payment_run_id', runIds)
    const on = new Map(((tr ?? []) as any[]).map(t => [t.payment_run_id, t.transferred_on]))
    for (const r of rows as any[]) if (r.run_id) r.reimbursed_on = on.get(r.run_id) ?? null
  }

  // for expenses not yet on a statement: which statement they'll come off
  const pending = rows.filter(r => r.kind === 'logged' && !r.statement && !r.voided)
  const closedBy = new Map<string, Set<string>>()
  for (const pid of new Set(pending.map(r => r.property_id))) closedBy.set(pid, await closedMonths(s, pid))
  for (const r of pending as any[]) {
    const closed = closedBy.get(r.property_id)!
    const chosen = r.deduct_month && !closed.has(String(r.deduct_month).slice(0, 10)) ? String(r.deduct_month).slice(0, 10) : null
    r.comes_off = chosen ?? firstOpenMonth(r.date, closed)
  }

  // totals by UK tax year (6 April – 5 April), the way landlords report to HMRC
  const taxYear = (d: string) => { const y = Number(d.slice(0, 4)); return d.slice(5) >= '04-06' ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}` }
  const byYear: Record<string, number> = {}
  for (const r of rows) if (r.date && !r.voided) byYear[taxYear(r.date)] = r2((byYear[taxYear(r.date)] ?? 0) + r.amount)
  return NextResponse.json({ rows, total: r2(rows.filter(r => !r.voided).reduce((t, r) => t + r.amount, 0)), byTaxYear: byYear })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  // the same routine every route uses (lib/expenses/create): checks, duplicates, which statement, numbering
  const r = await addLandlordExpense(createServiceClient(), { ...b, source: 'manual', source_ref: null }, { by: admin.personId, confirmDuplicate: !!b.confirm_duplicate })
  if (!r.ok) return NextResponse.json(r.duplicates ? { duplicates: r.duplicates } : { error: r.error }, { status: r.status })
  return NextResponse.json({ expense: r.expense, deductMonth: r.deductMonth, message: r.message })
}

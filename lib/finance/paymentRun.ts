// The payment run for a month (migration 193): approved statements → one payment per landlord and bank account,
// plus the two transfers from the client account to the office account — the expenses we paid out, and our fees.
//
// It all has to marry up: for every statement, rent = paid to landlord + management fee + letting fee + expenses,
// so for the run, rent in = landlord payments + expenses transfer + fees transfer. The run closes only when every
// landlord payment is recorded and both transfers match to the penny.
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadLedger, landlordBalances, ledgerStart } from '@/lib/clientLedger'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const first = (s: unknown) => String(s || '').split('\n')[0]
const who = (p: any) => (p ? p.company || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || '' : '')
const digits = (s: unknown) => String(s || '').replace(/\D/g, '')

export interface RunStatement {
  id: string; reference: string; property: string; propertyId: string; date: string; periodStart: string | null
  rent: number; managementFee: number; lettingFee: number; expenses: number; net: number; floatRetained: number; floatUsed: number
  feeNo: string | null; payoutNo: string | null; paidDate: string | null; balances: boolean
  expenseLines: { description: string; amount: number; number: string | null }[]
}
export interface RunPayment {
  key: string; landlordId: string | null; landlord: string
  bank: { name: string; sortCode: string; accountNo: string } | null
  statements: RunStatement[]; amount: number; paid: boolean; paidDate: string | null; held: number | null
}
export interface PaymentRunView {
  month: string
  run: { id: string; runNo: string; status: 'open' | 'closed'; createdAt: string; closedAt: string | null } | null
  payments: RunPayment[]
  waiting: { id: string; reference: string; property: string; net: number; state: 'draft' | 'approved' }[]   // not in this run yet
  transfers: { kind: 'fees' | 'expenses'; expected: number; recorded: { id: string; number: string | null; amount: number; date: string; reference: string | null } | null }[]
  totals: { rent: number; toLandlords: number; paidToLandlords: number; managementFees: number; lettingFees: number; fees: number; expenses: number; floatRetained: number; floatUsed: number }
  checks: { ok: boolean; message: string }[]
  canClose: boolean
}

function toRunStatement(st: any, propName: Map<string, string>): RunStatement {
  const rent = r2(Number(st.gross_rent || 0)), mf = r2(Number(st.management_fees || 0)), lf = r2(Number(st.letting_fees || 0))
  const ex = r2(Number(st.property_charges || 0)), net = r2(Number(st.net_to_landlord || 0))
  const fr = r2(Number(st.float_retained || 0)), fu = r2(Number(st.float_used || 0))
  return {
    id: st.id, reference: st.statement_reference, property: propName.get(st.property_id) ?? '', propertyId: st.property_id, date: st.statement_date, periodStart: st.period_start,
    rent, managementFee: mf, lettingFee: lf, expenses: ex, net, floatRetained: fr, floatUsed: fu, feeNo: st.fee_no ?? null, payoutNo: st.payout_no ?? null, paidDate: st.paid_date ?? null,
    balances: Math.round((rent + fu - mf - lf - ex - fr - net) * 100) === 0,
    expenseLines: (Array.isArray(st.expenses) ? st.expenses : []).map((e: any) => ({ description: e.description || 'Expense', amount: r2(Number(e.amount || 0)), number: e.number ?? null })),
  }
}

export async function loadPaymentRun(s: SupabaseClient, month: string): Promise<PaymentRunView> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must be YYYY-MM')
  const periodMonth = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const { data: runRow } = await s.from('payment_runs').select('*').eq('period_month', periodMonth).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const run = runRow ? { id: runRow.id, runNo: runRow.run_no, status: runRow.status, createdAt: runRow.created_at, closedAt: runRow.closed_at } : null

  const [{ data: inRun }, { data: notInRun }, { data: props }, { data: transfers }] = await Promise.all([
    run ? s.from('landlord_statements').select('*').eq('payment_run_id', run.id).order('statement_date') : Promise.resolve({ data: [] as any[] }),
    // statements from CROS, unpaid and not in any run, up to this month
    s.from('landlord_statements').select('id, statement_reference, property_id, net_to_landlord, approved_at, statement_date, source').is('payment_run_id', null).is('paid_date', null).eq('source', 'cros').lte('statement_date', monthEnd),
    s.from('properties').select('id, name, landlord_id, bank_account_name, bank_sort_code, bank_account_number'),
    run ? s.from('office_transfers').select('*').eq('payment_run_id', run.id).is('voided_at', null) : Promise.resolve({ data: [] as any[] }),
  ])
  const propName = new Map(((props ?? []) as any[]).map(p => [p.id, first(p.name)]))
  const propById = new Map(((props ?? []) as any[]).map(p => [p.id, p]))
  const sts = ((inRun ?? []) as any[])
  const landlordIds = [...new Set(sts.map(x => x.landlord_id).filter(Boolean))]
  const [{ data: people }, { data: banks }] = await Promise.all([
    landlordIds.length ? s.from('people').select('id, first_name, last_name, full_name, company').in('id', landlordIds) : Promise.resolve({ data: [] as any[] }),
    landlordIds.length ? s.from('landlord_bank_accounts').select('landlord_id, account_name, sort_code, account_number, is_default').in('landlord_id', landlordIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const nameOf = new Map(((people ?? []) as any[]).map(p => [p.id, who(p)]))
  // the account to pay: the property's own payee account if it has one, else the landlord's default
  const bankFor = (st: any) => {
    const p = propById.get(st.property_id)
    if (p?.bank_account_number && p?.bank_sort_code) return { name: p.bank_account_name || nameOf.get(st.landlord_id) || '', sortCode: digits(p.bank_sort_code), accountNo: digits(p.bank_account_number) }
    const b = ((banks ?? []) as any[]).filter(x => x.landlord_id === st.landlord_id).sort((a, c) => Number(c.is_default) - Number(a.is_default))[0]
    return b ? { name: b.account_name || nameOf.get(st.landlord_id) || '', sortCode: digits(b.sort_code), accountNo: digits(b.account_number) } : null
  }

  // client money held per landlord (payments are refused if more than is held)
  const ledger = await loadLedger(s)
  const held = new Map((await landlordBalances(s, ledger.entries)).map(b => [b.landlordId ?? 'none', r2(b.balance)]))

  const groups = new Map<string, RunPayment>()
  for (const st of sts) {
    const bank = bankFor(st)
    const key = `${st.landlord_id ?? 'none'}|${bank ? bank.sortCode + bank.accountNo : 'no-bank'}`
    const g: RunPayment = groups.get(key) ?? { key, landlordId: st.landlord_id, landlord: nameOf.get(st.landlord_id) || 'No landlord', bank, statements: [], amount: 0, paid: true, paidDate: null, held: held.get(st.landlord_id ?? 'none') ?? null }
    const rs = toRunStatement(st, propName)
    g.statements.push(rs)
    g.amount = r2(g.amount + rs.net)
    g.paid = g.paid && !!rs.paidDate
    g.paidDate = rs.paidDate ?? g.paidDate
    groups.set(key, g)
  }
  const payments = [...groups.values()].sort((a, b) => a.landlord.localeCompare(b.landlord))
  const all = payments.flatMap(p => p.statements)
  const totals = {
    rent: r2(all.reduce((t, x) => t + x.rent, 0)),
    toLandlords: r2(all.reduce((t, x) => t + x.net, 0)),
    paidToLandlords: r2(all.filter(x => x.paidDate).reduce((t, x) => t + x.net, 0)),
    managementFees: r2(all.reduce((t, x) => t + x.managementFee, 0)),
    lettingFees: r2(all.reduce((t, x) => t + x.lettingFee, 0)),
    fees: 0, expenses: r2(all.reduce((t, x) => t + x.expenses, 0)),
    floatRetained: r2(all.reduce((t, x) => t + x.floatRetained, 0)), floatUsed: r2(all.reduce((t, x) => t + x.floatUsed, 0)),
  }
  totals.fees = r2(totals.managementFees + totals.lettingFees)
  const tr = (kind: 'fees' | 'expenses') => {
    const t = ((transfers ?? []) as any[]).find(x => x.kind === kind)
    return { kind, expected: kind === 'fees' ? totals.fees : totals.expenses, recorded: t ? { id: t.id, number: t.txn_no, amount: r2(Number(t.amount)), date: t.transferred_on, reference: t.reference } : null }
  }
  const tfs = [tr('expenses'), tr('fees')]

  const checks: PaymentRunView['checks'] = []
  const unbalanced = all.filter(x => !x.balances)
  checks.push(unbalanced.length ? { ok: false, message: `${unbalanced.map(x => x.reference).join(', ')} don’t balance` } : { ok: true, message: `Every statement balances: rent (+ float used) = landlord + fees + expenses (+ float kept)` })
  const floatNote = totals.floatRetained || totals.floatUsed ? ` + £${totals.floatRetained.toFixed(2)} kept in floats − £${totals.floatUsed.toFixed(2)} from floats` : ''
  checks.push(Math.round((totals.rent + totals.floatUsed - totals.toLandlords - totals.fees - totals.expenses - totals.floatRetained) * 100) === 0
    ? { ok: true, message: `The run adds up: £${totals.rent.toFixed(2)} rent = £${totals.toLandlords.toFixed(2)} to landlords + £${totals.fees.toFixed(2)} fees + £${totals.expenses.toFixed(2)} expenses${floatNote}` }
    : { ok: false, message: 'The run doesn’t add up — contact support before paying anything' })
  const noBank = payments.filter(p => !p.bank)
  if (noBank.length) checks.push({ ok: false, message: `No bank details for ${noBank.map(p => p.landlord).join(', ')}` })
  const over = payments.filter(p => !p.paid && p.held != null && p.amount > p.held + 0.005 && p.statements.some(x => (x.date ?? '') >= ledger.start))
  if (over.length) checks.push({ ok: false, message: `Not enough held for ${over.map(p => `${p.landlord} (£${p.amount.toFixed(2)} to pay, £${(p.held ?? 0).toFixed(2)} held)`).join('; ')}` })
  for (const t of tfs) if (t.recorded && Math.round((t.recorded.amount - t.expected) * 100) !== 0) checks.push({ ok: false, message: `The ${t.kind} transfer (£${t.recorded.amount.toFixed(2)}) doesn’t match what’s due (£${t.expected.toFixed(2)})` })

  const waiting = ((notInRun ?? []) as any[]).map(x => ({ id: x.id, reference: x.statement_reference, property: propName.get(x.property_id) ?? '', net: r2(Number(x.net_to_landlord || 0)), state: (x.approved_at ? 'approved' : 'draft') as 'approved' | 'draft' }))
  const canClose = !!run && run.status === 'open' && payments.length > 0 && payments.every(p => p.paid)
    && tfs.every(t => t.expected === 0 || (t.recorded && Math.round((t.recorded.amount - t.expected) * 100) === 0)) && checks.every(c => c.ok)
  return { month, run, payments, waiting, transfers: tfs, totals, checks, canClose }
}

/** A bank bulk-payment file for the landlord payments still to make (one line per landlord and account). */
export function bankFileCsv(view: PaymentRunView): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [['Payee name', 'Sort code', 'Account number', 'Amount', 'Reference'].map(q).join(',')]
  for (const p of view.payments.filter(x => !x.paid && x.bank)) {
    const ref = p.statements.length === 1 ? `CR ${p.statements[0].reference}` : `CR ${view.run?.runNo ?? ''}`
    lines.push([p.bank!.name.slice(0, 18), p.bank!.sortCode, p.bank!.accountNo, p.amount.toFixed(2), ref.slice(0, 18)].map(q).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

export { ledgerStart }

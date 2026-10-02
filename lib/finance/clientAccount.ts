// The client account at a date: what should be in the bank, and who every penny of it belongs to — the basis of
// the monthly three-way reconciliation (bank statement = CROS cash book = the ledgers).
//
// Cash book (money through the client account since CROS took over collecting):
//   + rent received            + money in we couldn't match yet (suspense)      ± opening balances / corrections
//   + holding deposits still held (until they are applied, refunded or retained)
//   − paid to landlords        − moved to the office account (fees + expenses transfers)
// Who it belongs to:
//   landlords — split into: rent paid in advance by tenants · rent not yet on a statement · statements approved and
//               waiting to be paid · floats held
//   the office — fees and expenses on statements, not yet transferred
//   applicants — holding deposits held (migration 198)
//   unidentified — bank receipts not yet matched to anyone (suspense)
// The two totals are built from the same records, so they must agree; the bank balance is the independent check.
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadLedger, landlordBalances } from '@/lib/clientLedger'
import { demoPropertyIds } from '@/lib/demoProperties'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface BreakdownLine { key: string; label: string; amount: number; detail?: string }
export interface ClientAccountPosition {
  asAt: string; start: string
  cashbook: { rentIn: number; suspenseIn: number; holdingIn: number; adjustments: number; paidToLandlords: number; toOffice: number; total: number }
  breakdown: BreakdownLine[]
  breakdownTotal: number
  landlords: { landlordId: string | null; name: string; balance: number; advance: number; awaitingStatement: number; awaitingPayment: number; float: number }[]
  agrees: boolean
}

export async function clientAccountPosition(s: SupabaseClient, asAt?: string): Promise<ClientAccountPosition> {
  const ledger = await loadLedger(s, { asAt })
  const { start } = ledger
  const D = ledger.asAt
  const demo = await demoPropertyIds(s)
  const [props, charges, statements, transfers, bank, holding] = await Promise.all([
    s.from('properties').select('id, landlord_id'),
    s.from('rent_charges').select('property_id, charge_month, amount_received, remitted_amount, received_date, voided').gte('charge_month', start).gt('amount_received', 0),
    s.from('landlord_statements').select('*').gte('statement_date', start).lte('statement_date', D),
    s.from('office_transfers').select('amount, transferred_on, voided_at').lte('transferred_on', D),
    s.from('bank_transactions').select('id, amount, status, transaction_date').in('status', ['unmatched', 'possible_duplicate']).gte('transaction_date', start).lte('transaction_date', D),
    s.from('holding_deposits').select('amount, received_on, status, outcome_on, bank_transaction_id, property_id').lte('received_on', D),
  ])
  const landlordOf = new Map(((props.data ?? []) as any[]).map(p => [p.id, p.landlord_id as string | null]))
  const real = <T extends { property_id?: string }>(rows: T[] | null) => (rows ?? []).filter(r => !demo.has(r.property_id ?? ''))

  // cash book, from the ledger entries plus what the ledger treats as already gone (fees/expenses) but is still
  // in the bank until the office transfer
  const sum = (k: string) => r2(ledger.entries.filter(e => e.kind === k).reduce((t, e) => t + e.amount, 0))
  const rentIn = sum('rent_in')
  const paidToLandlords = -sum('payout')
  const adjustments = r2(ledger.entries.filter(e => e.source === 'adjustment').reduce((t, e) => t + e.amount, 0))
  // a holding deposit is held from the day it arrived until its outcome date (table missing before 198 → none)
  const held = real(holding.error ? [] : holding.data as any[]).filter(h => h.status === 'held' || String(h.outcome_on || '') > D)
  const holdingIn = r2(held.reduce((t, h) => t + Number(h.amount || 0), 0))
  const holdingBank = new Set(held.map(h => h.bank_transaction_id).filter(Boolean))
  const suspenseIn = r2(((bank.data ?? []) as any[]).filter(b => !holdingBank.has(b.id)).reduce((t, b) => t + Math.max(0, Number(b.amount || 0)), 0))
  const toOffice = r2(((transfers.data ?? []) as any[]).filter(t => !t.voided_at).reduce((t, x) => t + Number(x.amount || 0), 0))
  const cashTotal = r2(rentIn + suspenseIn + holdingIn + adjustments - paidToLandlords - toOffice)

  // who it belongs to
  const sts = real(statements.data as any[])
  const officeEarned = r2(sts.reduce((t, st) => t + Number(st.management_fees || 0) + Number(st.letting_fees || 0) + Number(st.property_charges || 0), 0))
  const officeDue = r2(officeEarned - toOffice)
  const balances = await landlordBalances(s, ledger.entries)
  const per = new Map<string, { advance: number; awaitingPayment: number; float: number }>()
  const bucket = (id: string | null) => { const k = id ?? 'none'; const v = per.get(k) ?? { advance: 0, awaitingPayment: 0, float: 0 }; per.set(k, v); return v }
  for (const c of real(charges.data as any[])) {
    if (c.voided || String(c.received_date || '') > D) continue
    if (String(c.charge_month) > D) bucket(landlordOf.get(c.property_id) ?? null).advance += Number(c.amount_received || 0) - Number(c.remitted_amount || 0)
  }
  for (const st of sts) {
    const b = bucket(st.landlord_id)
    if (!st.paid_date || st.paid_date > D) b.awaitingPayment += Number(st.net_to_landlord || 0)
    b.float += Number(st.float_retained || 0) - Number(st.float_used || 0)
  }
  const landlords = balances.map(bl => {
    const x = per.get(bl.landlordId ?? 'none') ?? { advance: 0, awaitingPayment: 0, float: 0 }
    const advance = r2(x.advance), awaitingPayment = r2(x.awaitingPayment), float = r2(x.float)
    return { landlordId: bl.landlordId, name: bl.name, balance: bl.balance, advance, awaitingPayment, float, awaitingStatement: r2(bl.balance - advance - awaitingPayment - float) }
  })
  const L = (k: 'advance' | 'awaitingStatement' | 'awaitingPayment' | 'float') => r2(landlords.reduce((t, l) => t + l[k], 0))
  const breakdown: BreakdownLine[] = [
    { key: 'awaitingStatement', label: 'Rent received, not yet on a landlord statement', amount: L('awaitingStatement') },
    { key: 'awaitingPayment', label: 'Statements made, waiting to be paid to landlords', amount: L('awaitingPayment') },
    { key: 'advance', label: 'Rent paid in advance by tenants', amount: L('advance') },
    { key: 'float', label: 'Floats held for landlords', amount: L('float') },
    { key: 'holding', label: 'Holding deposits held for applicants', amount: holdingIn, detail: held.length ? `${held.length} held` : undefined },
    { key: 'office', label: 'Our fees and expenses, not yet moved to the office account', amount: officeDue },
    { key: 'suspense', label: 'Money in that isn’t matched to anyone yet (suspense)', amount: suspenseIn, detail: 'Match these in Reconciliation' },
  ]
  const breakdownTotal = r2(breakdown.reduce((t, b) => t + b.amount, 0))
  return {
    asAt: D, start,
    cashbook: { rentIn, suspenseIn, holdingIn, adjustments, paidToLandlords, toOffice, total: cashTotal },
    breakdown, breakdownTotal, landlords, agrees: Math.round((breakdownTotal - cashTotal) * 100) === 0,
  }
}

// The client money ledger: every movement of landlords' money through the client account, per landlord.
//
// Built from the records CROS already keeps, from the ledger start date (system_settings.client_ledger_start):
//   + rent received            rent_charges.amount_received (date received)
//   − management fee           landlord_statements.management_fees (statement date) — moves to the office account
//   − letting fee              landlord_statements.letting_fees (statement date, migration 193) — moves to the office account
//   − expenses                 landlord_statements.property_charges (statement date) — paid out for the landlord
//   − paid to landlord         landlord_statements.amount_paid (paid date)
//   ± adjustments              client_ledger_adjustments (opening balances, corrections, deposits in/out…)
//   + initial monies           initial_monies (let-only: holding deposit + balance in, tenant-find fee out, landlord paid)
// A landlord's balance is what the client account holds for them. It must never go below zero — that would
// mean another client's money had been used.
import type { SupabaseClient } from '@supabase/supabase-js'
import { demoPropertyIds, inScope } from '@/lib/demoProperties'

export type LedgerKind = 'rent_in' | 'fee' | 'expenses' | 'payout' | 'opening_balance' | 'correction' | 'rent_other' | 'expense_paid' | 'deposit_in' | 'deposit_out' | 'initial_in'
export interface LedgerEntry {
  date: string
  kind: LedgerKind
  description: string
  amount: number               // + into the client account for the landlord, − out
  landlordId: string | null
  propertyId: string | null
  reference: string | null
  source: 'rent_charge' | 'statement' | 'adjustment' | 'initial_monies'
  sourceId: string
}
export interface LandlordLedger { landlordId: string | null; name: string; in: number; out: number; balance: number; entries: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const KIND_LABEL: Record<LedgerKind, string> = {
  rent_in: 'Rent received', fee: 'Management fee', expenses: 'Expenses', payout: 'Paid to landlord',
  opening_balance: 'Opening balance', correction: 'Correction', rent_other: 'Other money in', expense_paid: 'Expense paid',
  deposit_in: 'Deposit received', deposit_out: 'Deposit paid out', initial_in: 'Initial monies received',
}

export async function ledgerStart(s: SupabaseClient): Promise<string> {
  const { data } = await s.from('system_settings').select('value').eq('key', 'client_ledger_start').maybeSingle()
  return /^\d{4}-\d{2}-\d{2}$/.test(String(data?.value)) ? String(data!.value) : '2026-10-01'
}

/** Days after the rent due date before an unpaid charge counts as overdue (system_settings.rent_grace_days, default 5). */
export async function rentGraceDays(s: SupabaseClient): Promise<number> {
  const { data } = await s.from('system_settings').select('value').eq('key', 'rent_grace_days').maybeSingle()
  const n = Number(data?.value)
  return Number.isInteger(n) && n >= 0 && n <= 31 ? n : 5
}

export async function loadLedger(s: SupabaseClient, opts: { asAt?: string; from?: string; practice?: boolean } = {}) {
  let start = await ledgerStart(s)
  // practice (demo houses) can be rehearsed before go-live, so the practice ledger runs from the records start
  // (18 Oct 2026: with go-live moved to 1 Nov, October's practice run and a practice let-only let had dropped out)
  if (opts.practice) {
    const { data: rs } = await s.from('system_settings').select('value').eq('key', 'records_start').maybeSingle()
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(rs?.value)) && String(rs!.value) < start) start = String(rs!.value)
  }
  const asAt = opts.asAt || new Date().toISOString().slice(0, 10)
  const from = opts.from && opts.from > start ? opts.from : start
  const [demo, props, charges, statements, adjustments, initial] = await Promise.all([
    demoPropertyIds(s),
    s.from('properties').select('id, name, landlord_id'),
    s.from('rent_charges').select('id, property_id, room_id, charge_month, amount_received, received_date, paid_at, reference, voided, rooms(name)').gt('amount_received', 0),
    s.from('landlord_statements').select('*'),   // '*': letting_fees exists from migration 193
    s.from('client_ledger_adjustments').select('id, landlord_id, property_id, entry_date, kind, description, amount, reference, voided_at'),
    s.from('initial_monies').select('id, txn_no, payout_no, property_id, landlord_id, holding_amount, balance_amount, received_on, fee, amount_paid, paid_on, voided_at'),   // migration 231
  ])
  const adjustmentsReady = !adjustments.error
  const propLandlord = new Map((props.data ?? []).map((p: any) => [p.id, p.landlord_id as string | null]))
  const propName = new Map((props.data ?? []).map((p: any) => [p.id, String(p.name || '').split('\n')[0]]))
  const inRange = (d: string | null | undefined) => !!d && d >= from && d <= asAt
  const ok = inScope(demo, !!opts.practice)   // real books: demo houses out; practice: only them

  const entries: LedgerEntry[] = []
  for (const c of (charges.data ?? []) as any[]) {
    if (c.voided || !ok(c.property_id)) continue
    const date = String(c.received_date || c.paid_at || c.charge_month).slice(0, 10)
    if (!inRange(date)) continue
    entries.push({
      date, kind: 'rent_in', amount: r2(Number(c.amount_received)),
      description: `Rent ${String(c.charge_month).slice(0, 7)} · ${c.rooms?.name || 'room'}, ${propName.get(c.property_id) || ''}`,
      landlordId: propLandlord.get(c.property_id) ?? null, propertyId: c.property_id, reference: c.reference ?? null, source: 'rent_charge', sourceId: c.id,
    })
  }
  for (const st of (statements.data ?? []) as any[]) {
    if (!ok(st.property_id)) continue
    // an imported statement is the previous agent's record of their own account — its fees, expenses and payouts never
    // moved money in ours (17 Oct 2026 audit: 11 imported October statements were posted here, so two landlords
    // showed as overdrawn and the client account counted fees it never held)
    if (st.source === 'import') continue
    const where = propName.get(st.property_id) || ''
    const sd = String(st.statement_date || '').slice(0, 10)
    if (inRange(sd) && Number(st.management_fees)) entries.push({ date: sd, kind: 'fee', amount: -r2(Number(st.management_fees)), description: `Management fee · ${st.statement_reference} · ${where}`, landlordId: st.landlord_id, propertyId: st.property_id, reference: st.statement_reference, source: 'statement', sourceId: st.id })
    if (inRange(sd) && Number(st.letting_fees)) entries.push({ date: sd, kind: 'fee', amount: -r2(Number(st.letting_fees)), description: `Letting fee · ${st.statement_reference} · ${where}`, landlordId: st.landlord_id, propertyId: st.property_id, reference: st.statement_reference, source: 'statement', sourceId: st.id })
    if (inRange(sd) && Number(st.property_charges)) entries.push({ date: sd, kind: 'expenses', amount: -r2(Number(st.property_charges)), description: `Expenses · ${st.statement_reference} · ${where}`, landlordId: st.landlord_id, propertyId: st.property_id, reference: st.statement_reference, source: 'statement', sourceId: st.id })
    const pd = String(st.paid_date || '').slice(0, 10)
    const paid = Number(st.amount_paid ?? st.net_to_landlord)
    if (inRange(pd) && paid) entries.push({ date: pd, kind: 'payout', amount: -r2(paid), description: `Paid to landlord · ${st.statement_reference} · ${where}`, landlordId: st.landlord_id, propertyId: st.property_id, reference: st.statement_reference, source: 'statement', sourceId: st.id })
  }
  for (const a of (adjustments.data ?? []) as any[]) {
    if (a.voided_at || !inRange(a.entry_date) || (a.property_id && !ok(a.property_id))) continue
    entries.push({ date: a.entry_date, kind: a.kind, amount: r2(Number(a.amount)), description: a.description, landlordId: a.landlord_id, propertyId: a.property_id, reference: a.reference, source: 'adjustment', sourceId: a.id })
  }
  // let-only initial monies: the holding deposit (held for the applicant until now) and the balance arrive for the
  // landlord; the tenant-find fee is ours; the rest is paid to the landlord — so their balance comes back to £0.00
  for (const im of (initial.error ? [] : initial.data ?? []) as any[]) {
    if (im.voided_at || (im.property_id && !ok(im.property_id))) continue
    const where = propName.get(im.property_id) || ''
    const ll = im.landlord_id ?? propLandlord.get(im.property_id) ?? null
    if (inRange(im.received_on)) {
      entries.push({ date: im.received_on, kind: 'initial_in', amount: r2(Number(im.holding_amount) + Number(im.balance_amount)), description: `Initial monies · ${im.txn_no} · ${where}`, landlordId: ll, propertyId: im.property_id, reference: im.txn_no, source: 'initial_monies', sourceId: im.id })
      if (Number(im.fee)) entries.push({ date: im.received_on, kind: 'fee', amount: -r2(Number(im.fee)), description: `Tenant-find fee · ${im.txn_no} · ${where}`, landlordId: ll, propertyId: im.property_id, reference: im.txn_no, source: 'initial_monies', sourceId: im.id })
    }
    if (im.paid_on && inRange(im.paid_on) && Number(im.amount_paid)) entries.push({ date: im.paid_on, kind: 'payout', amount: -r2(Number(im.amount_paid)), description: `Paid to landlord · ${im.payout_no} · ${where}`, landlordId: ll, propertyId: im.property_id, reference: im.payout_no, source: 'initial_monies', sourceId: im.id })
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
  return { start, from, asAt, entries, adjustmentsReady }
}

export async function landlordBalances(s: SupabaseClient, entries: LedgerEntry[]): Promise<LandlordLedger[]> {
  const ids = [...new Set(entries.map(e => e.landlordId).filter(Boolean))] as string[]
  const { data: people } = ids.length ? await s.from('people').select('id, salutation, first_name, last_name, full_name, company').in('id', ids) : { data: [] as any[] }
  const nameOf = new Map((people ?? []).map((p: any) => [p.id, p.company || [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Landlord']))
  const map = new Map<string, LandlordLedger>()
  for (const e of entries) {
    const key = e.landlordId ?? 'none'
    const l = map.get(key) ?? { landlordId: e.landlordId, name: e.landlordId ? nameOf.get(e.landlordId) || 'Landlord' : 'No landlord on the property', in: 0, out: 0, balance: 0, entries: 0 }
    if (e.amount >= 0) l.in = r2(l.in + e.amount); else l.out = r2(l.out - e.amount)
    l.balance = r2(l.balance + e.amount); l.entries++
    map.set(key, l)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export const cashbookTotal = (entries: LedgerEntry[]) => r2(entries.reduce((t, e) => t + e.amount, 0))

/** CSV for the accountant (10ninety import): one row per ledger movement. */
export function ledgerCsv(entries: LedgerEntry[], landlordNames: Map<string, string>): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['Date', 'Type', 'Description', 'Reference', 'Landlord', 'Money in', 'Money out', 'Amount'].map(q).join(',')]
  for (const e of entries) {
    rows.push([
      e.date.split('-').reverse().join('/'), KIND_LABEL[e.kind], e.description, e.reference ?? '',
      e.landlordId ? landlordNames.get(e.landlordId) ?? '' : '',
      e.amount >= 0 ? e.amount.toFixed(2) : '', e.amount < 0 ? (-e.amount).toFixed(2) : '', e.amount.toFixed(2),
    ].map(q).join(','))
  }
  return rows.join('\r\n') + '\r\n'
}

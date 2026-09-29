// The client money ledger: every movement of landlords' money through the client account, per landlord.
//
// Built from the records CROS already keeps, from the ledger start date (system_settings.client_ledger_start):
//   + rent received            rent_charges.amount_received (date received)
//   − management fee           landlord_statements.management_fees (statement date) — moves to the office account
//   − letting fee              landlord_statements.letting_fees (statement date, migration 193) — moves to the office account
//   − expenses                 landlord_statements.property_charges (statement date) — paid out for the landlord
//   − paid to landlord         landlord_statements.amount_paid (paid date)
//   ± adjustments              client_ledger_adjustments (opening balances, corrections, deposits in/out…)
// A landlord's balance is what the client account holds for them. It must never go below zero — that would
// mean another client's money had been used.
import type { SupabaseClient } from '@supabase/supabase-js'
import { demoPropertyIds } from '@/lib/demoProperties'

export type LedgerKind = 'rent_in' | 'fee' | 'expenses' | 'payout' | 'opening_balance' | 'correction' | 'rent_other' | 'expense_paid' | 'deposit_in' | 'deposit_out'
export interface LedgerEntry {
  date: string
  kind: LedgerKind
  description: string
  amount: number               // + into the client account for the landlord, − out
  landlordId: string | null
  propertyId: string | null
  reference: string | null
  source: 'rent_charge' | 'statement' | 'adjustment'
  sourceId: string
}
export interface LandlordLedger { landlordId: string | null; name: string; in: number; out: number; balance: number; entries: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const KIND_LABEL: Record<LedgerKind, string> = {
  rent_in: 'Rent received', fee: 'Management fee', expenses: 'Expenses', payout: 'Paid to landlord',
  opening_balance: 'Opening balance', correction: 'Correction', rent_other: 'Other money in', expense_paid: 'Expense paid',
  deposit_in: 'Deposit received', deposit_out: 'Deposit paid out',
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

export async function loadLedger(s: SupabaseClient, opts: { asAt?: string; from?: string } = {}) {
  const start = await ledgerStart(s)
  const asAt = opts.asAt || new Date().toISOString().slice(0, 10)
  const from = opts.from && opts.from > start ? opts.from : start
  const [demo, props, charges, statements, adjustments] = await Promise.all([
    demoPropertyIds(s),
    s.from('properties').select('id, name, landlord_id'),
    s.from('rent_charges').select('id, property_id, room_id, charge_month, amount_received, received_date, paid_at, reference, voided, rooms(name)').gt('amount_received', 0),
    s.from('landlord_statements').select('*'),   // '*': letting_fees exists from migration 193
    s.from('client_ledger_adjustments').select('id, landlord_id, property_id, entry_date, kind, description, amount, reference, voided_at'),
  ])
  const adjustmentsReady = !adjustments.error
  const propLandlord = new Map((props.data ?? []).map((p: any) => [p.id, p.landlord_id as string | null]))
  const propName = new Map((props.data ?? []).map((p: any) => [p.id, String(p.name || '').split('\n')[0]]))
  const inRange = (d: string | null | undefined) => !!d && d >= from && d <= asAt

  const entries: LedgerEntry[] = []
  for (const c of (charges.data ?? []) as any[]) {
    if (c.voided || demo.has(c.property_id)) continue
    const date = String(c.received_date || c.paid_at || c.charge_month).slice(0, 10)
    if (!inRange(date)) continue
    entries.push({
      date, kind: 'rent_in', amount: r2(Number(c.amount_received)),
      description: `Rent ${String(c.charge_month).slice(0, 7)} · ${c.rooms?.name || 'room'}, ${propName.get(c.property_id) || ''}`,
      landlordId: propLandlord.get(c.property_id) ?? null, propertyId: c.property_id, reference: c.reference ?? null, source: 'rent_charge', sourceId: c.id,
    })
  }
  for (const st of (statements.data ?? []) as any[]) {
    if (demo.has(st.property_id)) continue
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
    if (a.voided_at || !inRange(a.entry_date)) continue
    entries.push({ date: a.entry_date, kind: a.kind, amount: r2(Number(a.amount)), description: a.description, landlordId: a.landlord_id, propertyId: a.property_id, reference: a.reference, source: 'adjustment', sourceId: a.id })
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
  return { start, from, asAt, entries, adjustmentsReady }
}

export async function landlordBalances(s: SupabaseClient, entries: LedgerEntry[]): Promise<LandlordLedger[]> {
  const ids = [...new Set(entries.map(e => e.landlordId).filter(Boolean))] as string[]
  const { data: people } = ids.length ? await s.from('people').select('id, first_name, last_name, full_name, company').in('id', ids) : { data: [] as any[] }
  const nameOf = new Map((people ?? []).map((p: any) => [p.id, p.company || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Landlord']))
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

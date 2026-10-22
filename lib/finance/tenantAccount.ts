// A tenant's statement of account: every rent charge and every payment for one tenancy, oldest first, with a
// running balance (positive = owed). The document for disputes, arrears letters and court (e.g. a Ground 8 claim).
// 22 Oct 2026: each month says when the rent reached our bank and how many days after the due date ("rent
// punctuality"); in the import period (before CROS collects rent — client_ledger_start) a month CROS never marked paid
// is read from the imported landlord statement that shows it collected, so it isn't shown as owed (Danielo Maglente's
// September was, though LS1040 shows it paid).
import type { SupabaseClient } from '@supabase/supabase-js'
import { ledgerStart } from '@/lib/clientLedger'
import { importedRentFor } from '@/lib/finance/importedRent'
import { fullAddressLine } from '@/lib/formatAddress'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const ukDate = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const monthName = (d: string) => new Date(d.slice(0, 7) + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export interface AccountLine { date: string; details: string; reference: string; charged: number | null; paid: number | null; balance: number }
/** One rent month: when it was due, when it was paid in full (the bank date, when we have it) and how late. */
export interface RentMonth { month: string; due: string; amount: number; paidIn: string | null; daysLate: number | null; how: 'bank' | 'recorded' | 'statement' | 'unpaid' | 'part'; statementRef?: string }
export interface Punctuality { known: number; onTime: number; averageDaysLate: number | null; rating: string | null; sentence: string }
export interface TenantAccount {
  tenant: string; room: string; property: string; address: string; paymentRef: string | null; start: string | null
  rent: number | null; dueDay: number; lines: AccountLine[]; charged: number; paid: number; balance: number
  months: RentMonth[]; punctuality: Punctuality; ledgerStart: string
}

export async function tenantAccount(s: SupabaseClient, tenancyId: string): Promise<TenantAccount | null> {
  const { data: t } = await s.from('tenancies').select('id, room_id, start_date, end_date, rent_due_day, payment_reference, rent_amount, property_id, rooms(name), properties(name, address, postcode), people!person_id(salutation, first_name, last_name, full_name)').eq('id', tenancyId).maybeSingle()
  if (!t) return null
  const tt: any = t
  // this tenant's own charges (migration 217) — not the previous tenant's in a changeover month; a charge with no
  // tenancy (made before 217) is the room's, matched by dates as before
  let q = s.from('rent_charges').select('*').eq('room_id', tt.room_id).or(`tenancy_id.eq.${tt.id},tenancy_id.is.null`)
    .gte('charge_month', String(tt.start_date).slice(0, 7) + '-01').order('charge_month')
  if (tt.end_date) q = q.lte('charge_month', tt.end_date)
  const { data: charges } = await q
  // A room charge with no tenancy (imported from an agent's statement before the tenant was in CROS) in the month this
  // tenancy began belongs to whoever was in the room on the 1st — the outgoing tenant — not the one arriving mid-month.
  // (Erin Pollard, 17 Oct 2026: moved in 20 Sept and was shown Isaac Hale's £950 September rent.)
  const startMonth = String(tt.start_date).slice(0, 7)
  let outgoingHadStartMonth = false
  if (!String(tt.start_date).endsWith('-01')) {
    const { data: before } = await s.from('tenancies').select('id').eq('room_id', tt.room_id).neq('id', tt.id).is('let_cancelled_at', null)
      .lte('start_date', `${startMonth}-01`).or(`end_date.is.null,end_date.gte.${startMonth}-01`).limit(1)
    outgoingHadStartMonth = !!(before ?? []).length
  }
  const live = ((charges ?? []) as any[]).filter(c => !c.voided)
    .filter(c => !(outgoingHadStartMonth && !c.tenancy_id && String(c.charge_month).slice(0, 7) === startMonth))
  const ids = live.map(c => c.id)
  const { data: audit } = ids.length
    ? await s.from('payment_audit_log').select('rent_charge_id, action, performed_at, new_value, bank_transaction_id').in('rent_charge_id', ids).in('action', ['csv_matched', 'manual_allocated', 'fuzzy_confirmed', 'manually_paid']).order('performed_at')
    : { data: [] as any[] }
  const txnIds = [...new Set(((audit ?? []) as any[]).map(a => a.bank_transaction_id).filter(Boolean))]
  const { data: txns } = txnIds.length ? await s.from('bank_transactions').select('id, txn_no, transaction_date').in('id', txnIds) : { data: [] as any[] }
  const txn = new Map(((txns ?? []) as any[]).map(x => [x.id, x]))

  const dueDay = Math.min(Math.max(Number(tt.rent_due_day) || 1, 1), 28)
  const takeover = await ledgerStart(s)
  const roomNo = String(tt.rooms?.name ?? '').match(/(\d+[A-Za-z]?)/)?.[1] ?? ''
  const importedCache = new Map<string, Awaited<ReturnType<typeof importedRentFor>>>()
  const importedFor = async (m: string) => {
    if (!importedCache.has(m)) importedCache.set(m, await importedRentFor(s, m).catch(() => []))
    return importedCache.get(m)!
  }
  const statementRefs = new Map<string, string>()

  const events: { date: string; order: number; details: string; reference: string; charged: number | null; paid: number | null }[] = []
  const months: RentMonth[] = []
  for (const c of live) {
    const m = String(c.charge_month).slice(0, 7)
    const due = tt.start_date > `${m}-${String(dueDay).padStart(2, '0')}` ? tt.start_date : `${m}-${String(dueDay).padStart(2, '0')}`
    const amount = r2(Number(c.amount_due))
    events.push({ date: due, order: 0, details: `Rent ${monthName(c.charge_month)}${c.amount_due_note ? ` (${c.amount_due_note})` : ''}`, reference: c.txn_no ?? '', charged: amount, paid: null })
    const pays = ((audit ?? []) as any[]).filter(a => a.rent_charge_id === c.id)
    let recorded = 0, paidIn: string | null = null, how: RentMonth['how'] = 'unpaid', banked = true
    const settle = (date: string | null, amt: number, fromBank: boolean) => {
      const before = recorded
      recorded = r2(recorded + amt)
      if (!fromBank) banked = false
      if (before < amount - 0.004 && recorded >= amount - 0.004) paidIn = date
    }
    for (const a of pays) {
      const amt = r2(Number(a.new_value?.this_payment ?? 0)) || r2(Number(a.new_value?.amount_received ?? 0) - recorded)
      if (!(amt > 0)) continue
      const x = a.bank_transaction_id ? txn.get(a.bank_transaction_id) : null
      const date = String(x?.transaction_date ?? a.performed_at).slice(0, 10)
      events.push({ date, order: 1, details: x ? 'Payment received (bank)' : 'Payment recorded', reference: x?.txn_no ?? '', charged: null, paid: amt })
      settle(x ? date : null, amt, !!x)
    }
    const unrecorded = r2(Number(c.amount_received || 0) - recorded)
    if (unrecorded > 0.004) {
      const date = c.received_date ? String(c.received_date).slice(0, 10) : null
      events.push({ date: String(date || c.paid_at || due).slice(0, 10), order: 1, details: 'Payment received', reference: '', charged: null, paid: unrecorded })
      settle(date, unrecorded, !!date)
    }
    // import period: CROS didn't collect this month — the imported landlord statement shows whether it was collected
    let statementRef: string | undefined
    if (`${m}-01` < takeover) {
      const line = (await importedFor(m)).find(l => l.propertyId === tt.property_id && l.room === roomNo)
      if (line) {
        if (!statementRefs.has(line.statementId)) {
          const { data: st } = await s.from('landlord_statements').select('statement_reference').eq('id', line.statementId).maybeSingle()
          statementRefs.set(line.statementId, String(st?.statement_reference ?? '').split(' · ')[0])
        }
        statementRef = statementRefs.get(line.statementId) || undefined
      }
      if (line && recorded < amount - 0.004) {
        const rest = r2(amount - recorded)
        events.push({ date: due, order: 1, details: `Rent collected — on landlord statement ${statementRef ?? ''} (before CROS collected rent)`.replace(/\s+\(/, ' ('), reference: statementRef ?? '', charged: null, paid: rest })
        settle(null, rest, false)
        how = 'statement'
      }
    }
    if (how !== 'statement') how = recorded >= amount - 0.004 ? (banked && paidIn ? 'bank' : 'recorded') : recorded > 0.004 ? 'part' : 'unpaid'
    const daysLate = paidIn && how === 'bank' ? Math.max(0, Math.round((Date.parse(`${paidIn}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86_400_000)) : null
    months.push({ month: m, due, amount, paidIn: how === 'bank' ? paidIn : null, daysLate, how, statementRef })
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
  let bal = 0
  const lines: AccountLine[] = events.map(e => { bal = r2(bal + (e.charged ?? 0) - (e.paid ?? 0)); return { ...e, date: ukDate(e.date), balance: bal } })
  const p = tt.people
  const prop = tt.properties ?? {}
  return {
    tenant: [p?.salutation, p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || 'Tenant', room: tt.rooms?.name ?? '', property: String(prop.name || '').split('\n')[0],
    address: fullAddressLine({ address: prop.address, postcode: prop.postcode, name: prop.name }),
    paymentRef: tt.payment_reference ?? null, start: tt.start_date, rent: tt.rent_amount != null ? Number(tt.rent_amount) : null, dueDay,
    lines, charged: r2(events.reduce((t, e) => t + (e.charged ?? 0), 0)), paid: r2(events.reduce((t, e) => t + (e.paid ?? 0), 0)), balance: bal,
    months, punctuality: punctualityOf(months, takeover), ledgerStart: takeover,
  }
}

/** Rent punctuality, from the months whose payment we can date from the bank: how many arrived by the due date, and on
 *  average how many days after it. Months paid before CROS collected rent have no bank date and aren't counted. */
export function punctualityOf(months: RentMonth[], takeover: string): Punctuality {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  // a month still unpaid past its due date counts as late, by the days so far
  const dated = months.filter(m => m.how === 'bank' || ((m.how === 'unpaid' || m.how === 'part') && m.due < today && `${m.month}-01` >= takeover))
  const late = dated.map(m => m.daysLate ?? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${m.due}T12:00:00Z`)) / 86_400_000))
  if (!dated.length) {
    const from = new Date(`${takeover}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return { known: 0, onTime: 0, averageDaysLate: null, rating: null, sentence: `Rent punctuality starts from ${from}, when payments are matched to our bank.` }
  }
  const onTime = late.filter(d => d <= 0).length
  const avg = Math.round((late.reduce((t, d) => t + Math.max(0, d), 0) / late.length) * 10) / 10
  const share = onTime / dated.length
  // rated mainly on how late rent arrives on average (Harry: "average rent was received 2 or 3 days late")
  const rating = share === 1 ? 'Excellent' : avg <= 2 ? 'Good' : avg <= 5 ? 'Fair' : 'Needs attention'
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`
  const sentence = `${onTime} of ${dated.length} payment${dated.length === 1 ? '' : 's'} arrived by the due date` +
    (avg > 0 ? `; on average rent reached us ${days(avg)} after it was due.` : ' — always on time.')
  return { known: dated.length, onTime, averageDaysLate: avg, rating, sentence }
}

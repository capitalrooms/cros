// When each tenant's rent arrived this month, against its due date (22 Oct 2026, Harry: "10 rents due on the 1st this
// month arrived 3rd — shall we send an email or push notification to tenants: thanks for the rent but a kind reminder it
// is due on the 1st"). Only months CROS collects (from client_ledger_start); demo houses left out. The paid date is the
// day it reached our bank where we have it (a matched bank line), else the date recorded on the charge.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ledgerStart } from '@/lib/clientLedger'
import { demoPropertyIds } from '@/lib/demoProperties'
import { displayName, dearName } from '@/lib/people'

export interface RentTiming {
  tenancyId: string; personId: string; tenant: string; dear: string; room: string; property: string; propertyId: string
  amount: number; due: string; paidOn: string | null; daysLate: number | null
  state: 'on_time' | 'late' | 'unpaid' | 'not_due'; hasApp: boolean; hasEmail: boolean
}

const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

export async function rentTiming(s: SupabaseClient, month: string): Promise<{ rows: RentTiming[]; collecting: boolean; from: string }> {
  const from = await ledgerStart(s)
  if (`${month}-01` < from) return { rows: [], collecting: false, from }
  const { data: charges } = await s.from('rent_charges')
    .select('id, tenancy_id, property_id, charge_month, amount_due, amount_received, received_date, paid_at, bank_transaction_id, voided, rooms(name), properties(name)')
    .eq('charge_month', `${month}-01`).not('tenancy_id', 'is', null)
  const demo = await demoPropertyIds(s)
  const live = ((charges ?? []) as any[]).filter(c => !c.voided && !demo.has(c.property_id))
  if (!live.length) return { rows: [], collecting: true, from }

  const tIds = [...new Set(live.map(c => c.tenancy_id))]
  const { data: lets } = await s.from('tenancies').select('id, person_id, start_date, rent_due_day, people!person_id(id, salutation, first_name, last_name, full_name, email)').in('id', tIds)
  const txnIds = [...new Set(live.map(c => c.bank_transaction_id).filter(Boolean))]
  const { data: audit } = await s.from('payment_audit_log').select('rent_charge_id, bank_transaction_id, performed_at').in('rent_charge_id', live.map(c => c.id)).not('bank_transaction_id', 'is', null)
  for (const a of (audit ?? []) as any[]) if (!txnIds.includes(a.bank_transaction_id)) txnIds.push(a.bank_transaction_id)
  const { data: txns } = txnIds.length ? await s.from('bank_transactions').select('id, transaction_date').in('id', txnIds) : { data: [] as any[] }
  const txnDate = new Map(((txns ?? []) as any[]).map(t => [t.id, String(t.transaction_date).slice(0, 10)]))
  const personIds = ((lets ?? []) as any[]).map(t => t.person_id).filter(Boolean)
  const { data: subs } = personIds.length ? await s.from('push_subscriptions').select('person_id').in('person_id', personIds) : { data: [] as any[] }
  const withApp = new Set(((subs ?? []) as any[]).map(x => x.person_id))
  const today = ukToday()

  const rows: RentTiming[] = []
  for (const c of live) {
    const t = ((lets ?? []) as any[]).find(x => x.id === c.tenancy_id)
    if (!t?.people) continue
    const dueDay = Math.min(Math.max(Number(t.rent_due_day) || 1, 1), 28)
    const dueStd = `${month}-${String(dueDay).padStart(2, '0')}`
    const due = t.start_date > dueStd ? t.start_date : dueStd
    const amount = Number(c.amount_due) || 0
    const paid = Number(c.amount_received || 0) >= amount - 0.004 && amount > 0
    // the latest bank line that settled it, else the recorded date
    const bankDates = ((audit ?? []) as any[]).filter(a => a.rent_charge_id === c.id).map(a => txnDate.get(a.bank_transaction_id)).filter(Boolean) as string[]
    if (c.bank_transaction_id && txnDate.get(c.bank_transaction_id)) bankDates.push(txnDate.get(c.bank_transaction_id)!)
    const paidOn = paid ? (bankDates.sort().pop() ?? (c.received_date ? String(c.received_date).slice(0, 10) : c.paid_at ? String(c.paid_at).slice(0, 10) : null)) : null
    const late = paidOn ? Math.max(0, days(due, paidOn)) : null
    const state: RentTiming['state'] = paid ? (late ? 'late' : 'on_time') : due >= today ? 'not_due' : 'unpaid'
    rows.push({
      tenancyId: t.id, personId: t.person_id, tenant: displayName(t.people), dear: dearName(t.people), room: c.rooms?.name ?? '',
      property: String(c.properties?.name ?? '').split('\n')[0], propertyId: c.property_id, amount, due, paidOn,
      daysLate: paid ? late : due < today ? days(due, today) : null, state, hasApp: withApp.has(t.person_id), hasEmail: !!t.people.email,
    })
  }
  rows.sort((a, b) => a.property.localeCompare(b.property, undefined, { numeric: true }) || a.room.localeCompare(b.room, undefined, { numeric: true }))
  return { rows, collecting: true, from }
}

const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The kind reminder for one tenant — thanks for a late payment, or a nudge about one not yet arrived. */
export function reminderFor(r: RentTiming): { title: string; body: string } {
  const dueDay = ordinal(Number(r.due.slice(8, 10)))
  if (r.state === 'late') return {
    title: 'Thank you for your rent',
    body: `Thank you for your rent of ${gbp(r.amount)} for ${r.room} — it reached us on ${longDay(r.paidOn!)}. Just a kind reminder that rent is due on the ${dueDay} of each month, so it’s worth setting your standing order to leave your account a couple of days before. Thank you!`,
  }
  return {
    title: 'A friendly reminder about your rent',
    body: `Your rent of ${gbp(r.amount)} for ${r.room} was due on ${longDay(r.due)} and we haven’t received it yet. It may just have been missed — please pay when you can, using your usual payment reference. If you’ve already paid, thank you and please ignore this. If anything has changed, just reply and let us know.`,
  }
}

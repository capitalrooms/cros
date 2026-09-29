// A tenant's statement of account: every rent charge and every payment for one tenancy, oldest first, with a
// running balance (positive = owed). The document for disputes, arrears letters and court (e.g. a Ground 8 claim).
import type { SupabaseClient } from '@supabase/supabase-js'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const ukDate = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const monthName = (d: string) => new Date(d.slice(0, 7) + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export interface AccountLine { date: string; details: string; reference: string; charged: number | null; paid: number | null; balance: number }
export interface TenantAccount { tenant: string; room: string; property: string; paymentRef: string | null; start: string | null; lines: AccountLine[]; charged: number; paid: number; balance: number }

export async function tenantAccount(s: SupabaseClient, tenancyId: string): Promise<TenantAccount | null> {
  const { data: t } = await s.from('tenancies').select('id, room_id, start_date, end_date, rent_due_day, payment_reference, rooms(name), properties(name), people!person_id(first_name, last_name, full_name)').eq('id', tenancyId).maybeSingle()
  if (!t) return null
  const tt: any = t
  let q = s.from('rent_charges').select('*').eq('room_id', tt.room_id).gte('charge_month', String(tt.start_date).slice(0, 7) + '-01').order('charge_month')
  if (tt.end_date) q = q.lte('charge_month', tt.end_date)
  const { data: charges } = await q
  const live = ((charges ?? []) as any[]).filter(c => !c.voided)
  const ids = live.map(c => c.id)
  const { data: audit } = ids.length
    ? await s.from('payment_audit_log').select('rent_charge_id, action, performed_at, new_value, bank_transaction_id').in('rent_charge_id', ids).in('action', ['csv_matched', 'manual_allocated', 'fuzzy_confirmed', 'manually_paid']).order('performed_at')
    : { data: [] as any[] }
  const txnIds = [...new Set(((audit ?? []) as any[]).map(a => a.bank_transaction_id).filter(Boolean))]
  const { data: txns } = txnIds.length ? await s.from('bank_transactions').select('id, txn_no, transaction_date').in('id', txnIds) : { data: [] as any[] }
  const txn = new Map(((txns ?? []) as any[]).map(x => [x.id, x]))

  const dueDay = Math.min(Math.max(Number(tt.rent_due_day) || 1, 1), 28)
  const events: { date: string; order: number; details: string; reference: string; charged: number | null; paid: number | null }[] = []
  for (const c of live) {
    const m = String(c.charge_month).slice(0, 7)
    const due = tt.start_date > `${m}-${String(dueDay).padStart(2, '0')}` ? tt.start_date : `${m}-${String(dueDay).padStart(2, '0')}`
    events.push({ date: due, order: 0, details: `Rent ${monthName(c.charge_month)}${c.amount_due_note ? ` (${c.amount_due_note})` : ''}`, reference: c.txn_no ?? '', charged: r2(Number(c.amount_due)), paid: null })
    const pays = ((audit ?? []) as any[]).filter(a => a.rent_charge_id === c.id)
    let recorded = 0
    for (const a of pays) {
      const amt = r2(Number(a.new_value?.this_payment ?? 0)) || r2(Number(a.new_value?.amount_received ?? 0) - recorded)
      if (!(amt > 0)) continue
      recorded = r2(recorded + amt)
      const x = a.bank_transaction_id ? txn.get(a.bank_transaction_id) : null
      events.push({ date: String(x?.transaction_date ?? a.performed_at).slice(0, 10), order: 1, details: x ? 'Payment received (bank)' : 'Payment recorded', reference: x?.txn_no ?? '', charged: null, paid: amt })
    }
    const unrecorded = r2(Number(c.amount_received || 0) - recorded)
    if (unrecorded > 0.004) events.push({ date: String(c.received_date || c.paid_at || due).slice(0, 10), order: 1, details: 'Payment received', reference: '', charged: null, paid: unrecorded })
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
  let bal = 0
  const lines: AccountLine[] = events.map(e => { bal = r2(bal + (e.charged ?? 0) - (e.paid ?? 0)); return { ...e, date: ukDate(e.date), balance: bal } })
  const p = tt.people
  return {
    tenant: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || 'Tenant', room: tt.rooms?.name ?? '', property: String(tt.properties?.name || '').split('\n')[0],
    paymentRef: tt.payment_reference ?? null, start: tt.start_date,
    lines, charged: r2(events.reduce((t, e) => t + (e.charged ?? 0), 0)), paid: r2(events.reduce((t, e) => t + (e.paid ?? 0), 0)), balance: bal,
  }
}

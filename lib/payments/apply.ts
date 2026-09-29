// Put one payment against a tenancy's rent — the same way every time (bank import, manual allocation).
//
// Order, as in standard lettings accounting (oldest debt first, then credit forward):
//   1. the charge it was matched to
//   2. any older unpaid charges for the same room (from the client ledger start — earlier months were the
//      previous agent's), oldest first
//   3. the next months' rent, raised early if needed (up to 2 months ahead — e.g. someone paying in advance)
// Anything still left over stays on the matched charge as money over (shown on the charge and in the audit log),
// so the client ledger always holds exactly what arrived. Without this, a double payment left next month
// looking unpaid and chased the tenant.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ledgerStart } from '@/lib/clientLedger'
import { ensureTenancyCharge } from '@/lib/rentCharges/generate'

export interface Allocation { chargeId: string; month: string; amount: number; status: 'paid' | 'partial' }
export interface ApplyResult { allocations: Allocation[]; over: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
}

export async function applyPayment(s: SupabaseClient, p: {
  chargeId: string
  tenancyId?: string | null
  amount: number
  date: string                  // when the money arrived
  txnId?: string | null
  personId: string
  action: 'csv_matched' | 'manual_allocated' | 'fuzzy_confirmed'
  note: string
  method?: string
}): Promise<ApplyResult> {
  const { data: target } = await s.from('rent_charges')
    .select('id, room_id, charge_month, amount_due, amount_received, status, voided').eq('id', p.chargeId).single()
  if (!target) throw new Error('Rent charge not found')
  const month = String(target.charge_month).slice(0, 10)

  const queue: any[] = [target]
  let remaining = r2(Number(p.amount))
  const outstanding = (c: any) => r2(Number(c.amount_due) - Number(c.amount_received || 0))

  if (remaining > outstanding(target) + 0.005 && target.room_id) {
    const start = await ledgerStart(s)
    const { data: older } = await s.from('rent_charges')
      .select('id, room_id, charge_month, amount_due, amount_received, status, voided')
      .eq('room_id', target.room_id).lt('charge_month', month).gte('charge_month', start)
      .in('status', ['pending', 'overdue', 'partial']).order('charge_month')
    queue.push(...((older ?? []) as any[]).filter(c => !c.voided))

    let tenancyId = p.tenancyId ?? null
    if (!tenancyId) {
      const { data: t } = await s.from('tenancies').select('id, start_date').eq('room_id', target.room_id)
        .lte('start_date', addMonths(month, 1)).order('start_date', { ascending: false }).limit(1).maybeSingle()
      tenancyId = t?.id ?? null
    }
    // raise the next months only while there's money left for them
    let left = r2(remaining - queue.reduce((t, c) => t + Math.max(outstanding(c), 0), 0))
    for (let k = 1; k <= 2 && left > 0.005 && tenancyId; k++) {
      const id = await ensureTenancyCharge(s, tenancyId, addMonths(month, k))
      if (!id) break
      const { data: next } = await s.from('rent_charges').select('id, room_id, charge_month, amount_due, amount_received, status, voided').eq('id', id).single()
      if (!next || next.voided) break
      queue.push(next)
      left = r2(left - Math.max(outstanding(next), 0))
    }
  }

  const now = new Date().toISOString()
  const allocations: Allocation[] = []
  const put = async (c: any, amount: number, extraNote = '') => {
    const received = r2(Number(c.amount_received || 0) + amount)
    const status: 'paid' | 'partial' = received >= Number(c.amount_due) - 0.005 ? 'paid' : 'partial'
    const { error } = await s.from('rent_charges').update({
      amount_received: received, received_date: p.date, status, paid_at: now, paid_by: p.personId,
      payment_method: p.method ?? 'bank_transfer', bank_transaction_id: p.txnId ?? null,
    }).eq('id', c.id)
    if (error) throw new Error(error.message)
    await s.from('payment_audit_log').insert({
      rent_charge_id: c.id, action: p.action, performed_by: p.personId, performed_at: now,
      old_value: { status: c.status, amount_received: c.amount_received },
      new_value: { status, amount_received: received, this_payment: amount, payment_method: p.method ?? 'bank_transfer' },
      note: p.note + extraNote, bank_transaction_id: p.txnId ?? null,
    })
    c.amount_received = received; c.status = status
    const existing = allocations.find(a => a.chargeId === c.id)
    if (existing) { existing.amount = r2(existing.amount + amount); existing.status = status }
    else allocations.push({ chargeId: c.id, month: String(c.charge_month).slice(0, 10), amount, status })
  }

  const whole = r2(Number(p.amount))
  for (const c of queue) {
    if (remaining <= 0.005) break
    const take = Math.min(remaining, Math.max(outstanding(c), 0))
    if (take <= 0.005 && c !== target) continue
    if (take > 0.005) {
      await put(c, r2(take), queue.length > 1 ? ` — £${take.toFixed(2)} of a £${whole.toFixed(2)} payment` : '')
      remaining = r2(remaining - take)
    }
  }
  const over = remaining > 0.005 ? remaining : 0
  if (over) await put(target, over, ` — £${over.toFixed(2)} more than was owed; held on this charge`)
  return { allocations, over }
}

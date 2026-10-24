// The move-in monies are the first rent (from the tenancy start date to the day before the next rent day — pro rata or a
// full month), plus the deposit, less the holding deposit (lib/movein/pack moneySummary). Recording them as received
// must also pay off that first rent in the rent schedule. Until 24 Oct 2026 it didn't, so every new tenancy's first
// month still showed as unpaid (Mr Raphael Wassermann, Room 3, 75 Crownfield Road: £821.10 for 5–31 October 2026).
// Logged in payment_audit_log like any recorded payment; never pays more than is due, never touches a voided charge.
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPackContext, moneySummary } from '@/lib/movein/pack'

const r2 = (n: number) => Math.round(n * 100) / 100

export interface MoveInRentResult { paid: { chargeId: string; month: string; amount: number }[]; note: string }

/** What recording the move-in monies would pay off (dry run when `apply` is false). */
export async function applyMoveInRent(s: SupabaseClient, tenancyId: string, opts: { date: string; byPersonId?: string | null; apply: boolean }): Promise<MoveInRentResult> {
  const ctx = await loadPackContext(s, tenancyId)
  if (!ctx?.first) return { paid: [], note: 'No first rent worked out for this tenancy' }
  const m = moneySummary(ctx)
  if (!(Number(m.firstRent) > 0) || !m.firstFrom || !m.firstTo) return { paid: [], note: 'No first rent worked out for this tenancy' }
  const { data: t } = await s.from('tenancies').select('id, room_id').eq('id', tenancyId).maybeSingle()
  if (!t?.room_id) return { paid: [], note: 'Tenancy has no room' }
  const { data: charges } = await s.from('rent_charges').select('*').eq('room_id', t.room_id)
    .or(`tenancy_id.eq.${tenancyId},tenancy_id.is.null`)
    .gte('charge_month', `${m.firstFrom.slice(0, 7)}-01`).lte('charge_month', `${m.firstTo.slice(0, 7)}-01`)
    .eq('voided', false).order('charge_month')
  let left = r2(Number(m.firstRent))
  const paid: MoveInRentResult['paid'] = []
  for (const c of (charges ?? []) as any[]) {
    if (left <= 0.004) break
    const due = r2(Number(c.amount_due)), had = r2(Number(c.amount_received || 0))
    const owed = r2(due - had)
    if (owed <= 0.004 || c.status === 'paid') continue
    const amt = r2(Math.min(owed, left))
    left = r2(left - amt)
    paid.push({ chargeId: c.id, month: String(c.charge_month).slice(0, 7), amount: amt })
    if (!opts.apply) continue
    const total = r2(had + amt), status = total >= due - 0.004 ? 'paid' : 'partial', now = new Date().toISOString()
    const { error } = await s.from('rent_charges').update({
      amount_received: total, received_date: opts.date, status, paid_at: now, paid_by: opts.byPersonId ?? null,
      payment_method: 'other', payment_notes: 'Paid in the move-in monies',
    }).eq('id', c.id).neq('status', 'paid')
    if (error) throw new Error(`Rent for ${String(c.charge_month).slice(0, 7)} not marked paid: ${error.message}`)
    await s.from('payment_audit_log').insert({
      rent_charge_id: c.id, action: 'manually_paid', performed_by: opts.byPersonId ?? null, performed_at: now,
      old_value: { status: c.status, amount_received: c.amount_received },
      new_value: { status, amount_received: total, this_payment: amt, payment_method: 'other', payment_date: opts.date },
      note: 'Paid in the move-in monies',
    })
  }
  return { paid, note: paid.length ? '' : 'The first rent is already paid, or has no charge yet' }
}

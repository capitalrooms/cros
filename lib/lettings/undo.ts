// Can a tenancy be moved to another room, or deleted outright, without touching the money trail?
// Yes on the day it was added, or at any time while nothing money-related hangs off it: no rent charged on the room
// for its months, no move-in money or deposit recorded, no letting fee on a statement, no holding deposit, no deposit
// return, not on a landlord statement. Once any of that exists the tenancy has to be ended properly instead.
// Shared by the letting file (to show the buttons) and the API (to allow them) so the two can't disagree.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface UndoCheck { ok: boolean; addedToday: boolean; reasons: string[] }

export async function canUndoTenancy(s: SupabaseClient, t: any, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })): Promise<UndoCheck> {
  const addedToday = !!t.created_at && new Date(t.created_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === today
  const reasons: string[] = []
  if (t.move_in_monies_received_at) reasons.push('move-in money has been recorded')
  if (t.deposit_protected_at) reasons.push('the deposit has been protected')
  if (t.letting_fee_statement_id) reasons.push('its letting fee is on a landlord statement')
  const startMonth = t.start_date ? `${String(t.start_date).slice(0, 7)}-01` : null
  const [charges, holds, returns, onStatements] = await Promise.all([
    t.room_id && startMonth
      ? s.from('rent_charges').select('charge_month, amount_received, remitted_amount').eq('room_id', t.room_id).eq('voided', false).gte('charge_month', startMonth)
          .lte('charge_month', t.end_date ? `${String(t.end_date).slice(0, 7)}-01` : '9999-12-01')
      : Promise.resolve({ data: [] as any[] }),
    s.from('holding_deposits').select('hold_no, status').eq('tenancy_id', t.id).neq('status', 'reversed'),
    s.from('deposit_returns').select('id').eq('tenancy_id', t.id),
    s.from('landlord_statement_rooms').select('id').eq('tenancy_id', t.id),
  ]) as { data: any[] | null }[]
  if ((charges.data ?? []).length) reasons.push(`rent has been charged on the room for ${(charges.data ?? []).length} month${(charges.data ?? []).length === 1 ? '' : 's'} of it${(charges.data ?? []).some((c: any) => Number(c.amount_received) > 0) ? ' (and some received)' : ''}`)
  if ((holds.data ?? []).length) reasons.push(`holding deposit ${(holds.data ?? [])[0].hold_no} is attached`)
  if ((returns.data ?? []).length) reasons.push('a deposit return is recorded')
  if ((onStatements.data ?? []).length) reasons.push('it appears on a landlord statement')
  return { ok: !t.let_cancelled_at && (addedToday || reasons.length === 0), addedToday, reasons }
}

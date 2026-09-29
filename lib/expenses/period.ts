// Which landlord statement an expense comes off.
//
// The rule (as client-accounting systems do it): an expense is deducted on the next statement for that property
// that hasn't gone out yet, starting from the month the expense is dated. So a September invoice logged on
// 20 September comes off the September statement; logged on 8 October after September's statement was sent, it
// comes off October's. The admin can pick another month instead (e.g. an invoice dated 2 October going on the
// September statement that's being prepared, or a later month when the landlord asked to wait) — never one whose
// statement has already gone out.
import type { SupabaseClient } from '@supabase/supabase-js'

const monthStart = (d: string) => `${d.slice(0, 7)}-01`
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
}
export const monthName = (month: string) =>
  new Date(month.slice(0, 7) + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

/** Months (YYYY-MM-01) whose statement for this property has gone out — sent to the landlord or paid. */
export async function closedMonths(s: SupabaseClient, propertyId: string): Promise<Set<string>> {
  const { data } = await s.from('landlord_statements').select('statement_date, sent_at, paid_date').eq('property_id', propertyId)
  return new Set(((data ?? []) as any[]).filter(r => r.statement_date && (r.sent_at || r.paid_date)).map(r => monthStart(String(r.statement_date))))
}

/** The first statement month, from the expense's own month, that is still open. */
export function firstOpenMonth(expenseDate: string, closed: Set<string>, from?: string | null): string {
  let m = monthStart(from && from > expenseDate ? from : expenseDate)
  for (let i = 0; i < 36 && closed.has(m); i++) m = addMonths(m, 1)
  return m
}

/** Where an expense will be (or was) deducted, for showing to the admin. */
export async function deductionMonth(s: SupabaseClient, propertyId: string, expenseDate: string, chosen?: string | null) {
  const closed = await closedMonths(s, propertyId)
  const auto = firstOpenMonth(expenseDate, closed)
  if (chosen) {
    const c = monthStart(chosen)
    if (closed.has(c)) return { month: auto, adjusted: true, auto }   // that statement has already gone out
    return { month: c, adjusted: false, auto }
  }
  return { month: auto, adjusted: false, auto }
}

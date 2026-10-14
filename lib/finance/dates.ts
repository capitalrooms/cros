// The two dates every agency chooses when it starts on CROS (Settings › Your records; 14 Oct 2026, Harry: "we should
// be able to have tenancies from the past but only require statements from a date where financial recording starts …
// something people choose on setup"):
//   records_start        — the first month CROS keeps the books for. Statements are expected from here; tenancies may
//                          start long before it. Months between this and the next date come from your old system
//                          (uploaded statements).
//   client_ledger_start  — the month CROS starts collecting rent itself (lib/clientLedger ledgerStart): arrears, bank
//                          matching and the client account count from here, and CROS prepares the statements.
// Both are the 1st of a month, and the books can't start after CROS starts collecting.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ledgerStart } from '@/lib/clientLedger'

export { ledgerStart }
const ISO = /^\d{4}-\d{2}-01$/

export async function recordsStart(s: SupabaseClient): Promise<string> {
  const { data } = await s.from('system_settings').select('value').eq('key', 'records_start').maybeSingle()
  const v = String(data?.value ?? '')
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : await ledgerStart(s)
}

export async function financeDates(s: SupabaseClient) {
  const [records, ledger] = await Promise.all([recordsStart(s), ledgerStart(s)])
  return { recordsStart: records <= ledger ? records : ledger, ledgerStart: ledger }
}

/** A month ("2026-05") of a managed property: needs an uploaded statement, one prepared in CROS, or none. */
export function statementDue(month: string, d: { recordsStart: string; ledgerStart: string }, thisMonth: string): 'none' | 'upload' | 'prepare' | 'current' {
  if (`${month}-01` < d.recordsStart) return 'none'
  if (month >= thisMonth) return 'current'
  return `${month}-01` < d.ledgerStart ? 'upload' : 'prepare'
}

export const isMonthStart = (v: unknown) => typeof v === 'string' && ISO.test(v)

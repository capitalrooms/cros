// How far the real bank statements have been imported (whole days). A day imported on the same day it ended is only
// part covered, so it doesn't count. Used by the Finance home's Import diary and by the payment run, which won't pay
// a landlord until the bank is imported up to their statement — money not yet seen in the bank is "uncleared"
// (3 Nov 2026, checked against Reapit: landlords aren't paid until the bank statement is reconciled).
import type { SupabaseClient } from '@supabase/supabase-js'

const london = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

export async function bankCoveredTo(s: SupabaseClient, opts: { practice?: boolean } = {}): Promise<string | null> {
  const { data } = await s.from('bank_import_batches').select('period_to, imported_at, is_practice').not('period_to', 'is', null).limit(1000)
  return ((data ?? []) as any[]).filter(b => !!b.is_practice === !!opts.practice)
    .map(b => (london(b.imported_at) > b.period_to ? b.period_to : prevDay(b.period_to))).sort().pop() ?? null
}

// Demo/test properties (properties.is_demo, migration 186) are kept out of every money figure —
// rent due/collected, arrears, charges, fee income, empty rooms, certificates on the Money tab.
// Before the migration runs the column doesn't exist; then nothing is treated as demo.
import type { SupabaseClient } from '@supabase/supabase-js'

/** Which houses a money view covers: the real books leave demo houses out; practice mode (migration 209) shows only them. */
export const inScope = (demo: Set<string>, practice = false) => (propertyId: string | null | undefined) => demo.has(propertyId ?? '') === practice

/** Practice mode needs migration 209 (X numbers); until then a demo house's money records would take real numbers. */
export async function practiceReady(s: SupabaseClient): Promise<boolean> {
  const { error } = await s.from('payment_runs').select('is_practice').limit(1)
  return !error
}
export const PRACTICE_NOT_READY = 'Practice mode needs migration 209 first — until then a demo house’s entries would use real numbers'

export async function demoPropertyIds(s: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await s.from('properties').select('id').eq('is_demo', true)
  if (error) return new Set()
  return new Set((data ?? []).map((p: { id: string }) => p.id))
}

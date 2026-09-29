// Demo/test properties (properties.is_demo, migration 186) are kept out of every money figure —
// rent due/collected, arrears, charges, fee income, empty rooms, certificates on the Money tab.
// Before the migration runs the column doesn't exist; then nothing is treated as demo.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function demoPropertyIds(s: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await s.from('properties').select('id').eq('is_demo', true)
  if (error) return new Set()
  return new Set((data ?? []).map((p: { id: string }) => p.id))
}

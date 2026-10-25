// Each house's regular cleaner (migration 243, 24 Oct 2026) and the cleaners who work at a house. Until 243 is run
// the column isn't there: everything here then behaves as "no regular cleaner" rather than failing.
import type { SupabaseClient } from '@supabase/supabase-js'

/** The house's regular cleaner, or null (none chosen, or migration 243 not run yet). */
export async function regularCleanerId(s: SupabaseClient, propertyId: string | null | undefined): Promise<string | null> {
  if (!propertyId) return null
  const { data, error } = await s.from('properties').select('regular_cleaner_id').eq('id', propertyId).maybeSingle()
  return error ? null : ((data as any)?.regular_cleaner_id ?? null)
}

/** Everyone who cleans this house: its regular cleaner, whoever has its cleans from the last six months on, and
 *  whoever has its open move-out cleans. Only people who are still cleaners. */
export async function houseCleanerIds(s: SupabaseClient, propertyId: string): Promise<string[]> {
  const since = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10)
  const [regular, { data: cleans }, { data: moveOuts }] = await Promise.all([
    regularCleanerId(s, propertyId),
    s.from('cleans').select('cleaner_id').eq('property_id', propertyId).gte('clean_date', since).not('cleaner_id', 'is', null),
    s.from('assigned_jobs').select('cleaner_id').eq('property_id', propertyId).eq('status', 'pending').not('cleaner_id', 'is', null),
  ])
  const ids = [...new Set([regular, ...(cleans ?? []).map((c: any) => c.cleaner_id), ...(moveOuts ?? []).map((j: any) => j.cleaner_id)].filter(Boolean) as string[])]
  if (!ids.length) return []
  const { data: still } = await s.from('people').select('id').in('id', ids).eq('role', 'cleaner')
  return (still ?? []).map((p: any) => p.id)
}

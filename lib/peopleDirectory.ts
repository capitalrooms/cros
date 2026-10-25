// Names of other people, for the tenant / contractor / cleaner / landlord apps (25 Oct 2026, security audit).
// Their full people record (date of birth, income, credit check, bank details, ID photo…) is office-only now
// (migration 244); everyone else reads names from the people_directory view — the same people they could see
// before, names and company only. Office screens keep reading people as before.
import type { SupabaseClient } from '@supabase/supabase-js'

export type DirectoryName = { id: string; salutation: string | null; first_name: string | null; last_name: string | null; full_name: string | null; company?: string | null }

/** Put each row's person (by `idKey`) on it as `as`, from the directory — in place of a people(...) join. */
export async function withNames<T extends Record<string, any>>(sb: SupabaseClient, rows: T[], idKey: string, as = 'people'): Promise<T[]> {
  const ids = [...new Set(rows.map(r => r[idKey]).filter(Boolean))] as string[]
  if (!ids.length) return rows
  let { data, error } = await sb.from('people_directory').select('id, salutation, first_name, last_name, full_name, company').in('id', ids)
  // before migration 244 there's no directory yet — the people table still answers then
  if (error) ({ data } = await sb.from('people').select('id, salutation, first_name, last_name, full_name, company').in('id', ids))
  const byId = new Map(((data ?? []) as DirectoryName[]).map(p => [p.id, p]))
  return rows.map(r => ({ ...r, [as]: byId.get(r[idKey]) ?? null }))
}

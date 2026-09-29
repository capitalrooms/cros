// maintenance_tickets.contractor_id has no foreign key to people, so contractors can't be embedded in the
// same query. Fetch the tickets, then attach each contractor with this helper (one extra query).
import type { SupabaseClient } from '@supabase/supabase-js'

export async function withContractors<T extends { contractor_id?: string | null }>(
  supabase: SupabaseClient,
  tickets: T[] | null | undefined,
  select = 'id, full_name, first_name, last_name, email, phone',
): Promise<(T & { contractor: any | null })[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const list = tickets ?? []
  const ids = [...new Set(list.map(t => t.contractor_id).filter(Boolean))] as string[]
  if (!ids.length) return list.map(t => ({ ...t, contractor: null }))
  const { data } = await supabase.from('people').select(select).in('id', ids)
  const byId = new Map(((data ?? []) as any[]).map(p => [p.id, p])) // eslint-disable-line @typescript-eslint/no-explicit-any
  return list.map(t => ({ ...t, contractor: (t.contractor_id && byId.get(t.contractor_id)) || null }))
}

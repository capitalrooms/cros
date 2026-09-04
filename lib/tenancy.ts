import { createClient } from './supabase'

export interface ActiveTenancy {
  id: string
  property_id: string
  room_id: string | null
  start_date: string
  end_date: string | null
  status: string | null
  notice_received_date: string | null
  rent_amount: number | null
  rent_due_day: number | null
  properties: { name: string; address: string } | null
  rooms: { name: string } | null
}

/**
 * The tenant's CURRENT tenancy, or null if they no longer live anywhere.
 *
 * Everything tenant-facing must derive property and room from here rather than
 * from `people.property_id` / `people.room_id`. Those columns are a static
 * assignment that nobody remembers to clear, so a former tenant would keep
 * receiving notifications about a room somebody else now lives in.
 *
 * Deriving it from the tenancy means an end date simply passing is enough — no
 * "mark inactive" step for anyone to forget.
 */
export async function getActiveTenancy(personId: string): Promise<ActiveTenancy | null> {
  if (!personId) return null
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('tenancies')
    .select(
      'id, property_id, room_id, start_date, end_date, status, notice_received_date, rent_amount, rent_due_day, properties(name, address), rooms(name)'
    )
    .eq('person_id', personId)
    .lte('start_date', today)
    // Open-ended, or not yet ended.
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as any) ?? null
}

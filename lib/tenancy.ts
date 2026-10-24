import { createClient } from './supabase'

export interface ActiveTenancy {
  id: string
  property_id: string
  room_id: string | null
  start_date: string
  end_date: string | null
  // status column does not exist in live DB — use notice_received_date instead
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
  return currentTenancy<ActiveTenancy>(personId,
    'id, property_id, room_id, start_date, end_date, notice_received_date, rent_amount, rent_due_day, properties(name, address), rooms(name)')
}

/**
 * The same current tenancy with the columns a screen needs. Every tenant screen uses this (24 Oct 2026) — they each
 * had their own lookup, and most broke on ordinary tenancies: smart repair reporting only looked at tenancies WITH an
 * end date (so never a periodic one), early move-out only at ones WITHOUT (so never after notice), important notes
 * and rescind notice failed for anyone with an old tenancy on record.
 */
export async function currentTenancy<T = any>(personId: string | null | undefined, select: string): Promise<T | null> {
  if (!personId) return null
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data } = await createClient()
    .from('tenancies')
    .select(select)
    .or(`person_id.eq.${personId},co_tenant_id.eq.${personId}`)   // joint tenants too
    .is('let_cancelled_at', null)
    .lte('start_date', today)
    // Open-ended, or not yet ended.
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as T) ?? null
}

// Rent charges belong to a tenancy and a month (rent_charges.tenancy_id + charge_month — migration 217, 12 Oct 2026;
// two tenants in one room in a changeover month each have their own charge). Before 217 there was only room + month,
// so a charge without a tenancy_id is matched the old way: by its room and the tenancy's dates. These helpers also add
// `due_date` (= charge_month) for screens written against the old shape.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TenancyWindow { id?: string; room_id: string | null; start_date: string | null; end_date: string | null }

const monthStart = (d: string) => `${d.slice(0, 7)}-01`

/** Does this charge belong to this tenancy? Its own tenancy_id when it has one, else the room and dates. */
export function chargeBelongsTo(c: { tenancy_id?: string | null; room_id: string | null; charge_month: string }, t: TenancyWindow): boolean {
  if (c.tenancy_id) return !!t.id && c.tenancy_id === t.id
  return t.room_id === c.room_id &&
    (!t.start_date || c.charge_month >= monthStart(t.start_date)) &&
    (!t.end_date || c.charge_month <= t.end_date)
}
const withTenancyId = (select: string) => select === '*' || /\btenancy_id\b/.test(select) ? select : `${select}, tenancy_id`

export async function rentChargesForTenancies(
  supabase: SupabaseClient,
  tenancies: TenancyWindow[],
  select = '*',
): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rooms = [...new Set(tenancies.map(t => t.room_id).filter(Boolean))] as string[]
  if (!rooms.length) return []
  const { data, error } = await supabase.from('rent_charges').select(withTenancyId(select)).in('room_id', rooms).order('charge_month', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter(c => tenancies.some(t => chargeBelongsTo(c, t)))
    .map(c => ({ ...c, due_date: c.charge_month }))
}

export async function rentChargesForTenancyId(supabase: SupabaseClient, tenancyId: string, select = '*') {
  const { data: t, error } = await supabase.from('tenancies').select('id, room_id, start_date, end_date').eq('id', tenancyId).maybeSingle()
  if (error) throw new Error(error.message)
  return t ? rentChargesForTenancies(supabase, [t as TenancyWindow], select) : []
}

const monthBounds = (chargeMonth: string) => {
  const [y, m] = chargeMonth.slice(0, 7).split('-').map(Number)
  const start = `${chargeMonth.slice(0, 7)}-01`
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)   // last day of the month (UTC-safe)
  return { start, end }
}

/** The charge's tenancy: its own tenancy_id, else the tenancy occupying the room that month (charges made before 217). */
export async function tenancyForCharge(
  supabase: SupabaseClient,
  charge: { room_id: string | null; charge_month: string | null; tenancy_id?: string | null },
  select = '*',
): Promise<any | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (charge.tenancy_id) {
    const { data } = await supabase.from('tenancies').select(select).eq('id', charge.tenancy_id).maybeSingle()
    if (data) return data
  }
  if (!charge.room_id || !charge.charge_month) return null
  const { start, end } = monthBounds(charge.charge_month)
  const { data } = await supabase.from('tenancies').select(select)
    .eq('room_id', charge.room_id)
    .lte('start_date', end)
    .or(`end_date.is.null,end_date.gte.${start}`)
    .order('start_date', { ascending: false })
    .limit(1).maybeSingle()
  return data ?? null
}

/** Attach `tenancy` to many charges at once (one query for all rooms). */
export async function attachTenancies<T extends { room_id: string | null; charge_month: string | null; tenancy_id?: string | null }>(
  supabase: SupabaseClient,
  charges: T[],
  select = 'id, room_id, start_date, end_date, person_id',
): Promise<(T & { tenancy: any | null })[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rooms = [...new Set(charges.map(c => c.room_id).filter(Boolean))] as string[]
  if (!rooms.length) return charges.map(c => ({ ...c, tenancy: null }))
  const base0 = select.includes('room_id') ? select : `room_id, start_date, end_date, ${select}`
  const base = /\bid\b/.test(base0) ? base0 : `id, ${base0}`
  const { data } = await supabase.from('tenancies').select(base).in('room_id', rooms)
  const tenancies = (data ?? []) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  return charges.map(c => {
    if (c.tenancy_id) { const own = tenancies.find(t => t.id === c.tenancy_id); if (own) return { ...c, tenancy: own } }
    if (!c.room_id || !c.charge_month) return { ...c, tenancy: null }
    const { start, end } = monthBounds(c.charge_month)
    const t = tenancies
      .filter(t => t.room_id === c.room_id && (!t.start_date || t.start_date <= end) && (!t.end_date || t.end_date >= start))
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0]
    return { ...c, tenancy: t ?? null }
  })
}

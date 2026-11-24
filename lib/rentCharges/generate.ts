import type { SupabaseClient } from '@supabase/supabase-js'
import { demoPropertyIds, inScope, practiceReady, PRACTICE_NOT_READY } from '@/lib/demoProperties'
import { chargeRow, rentDueForMonth, r2, dayMs, iso, addDays, minIso, rentPeriod } from './proRata'
export { rentDueForMonth }

export async function generateMonthCharges(s: SupabaseClient, chargeMonth: string, opts: { practice?: boolean } = {}) {
  if (!/^\d{4}-\d{2}-01$/.test(chargeMonth)) throw new Error('Month must be the 1st, e.g. 2026-10-01')
  const [y, m] = chargeMonth.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const { data: tenancies, error } = await s.from('tenancies')
    .select('id, room_id, property_id, rent_amount, rent_due_day, start_date, end_date, rooms(name, is_let_only), properties(property_code, letting_type)')
    .lte('start_date', monthEnd)
    .or(`end_date.is.null,end_date.gte.${chargeMonth}`)
    .is('let_cancelled_at', null)                         // a let that fell through owes nothing
    .not('rent_amount', 'is', null)
  if (error) throw new Error(error.message)

  const demo = await demoPropertyIds(s)
  if (opts.practice && !(await practiceReady(s))) throw new Error(PRACTICE_NOT_READY)
  const ok = inScope(demo, !!opts.practice)
  // let-only houses and let-only rooms: we find the tenant, the landlord collects the rent — never raise monthly charges (as the rent roll)
  const live = (tenancies ?? []).filter((t: any) => ok(t.property_id) && t.room_id && Number(t.rent_amount) > 0 && t.properties?.letting_type !== 'let_only' && !t.rooms?.is_let_only)
  const { genRentRef } = await import('@/lib/references')
  const rows = live.map((t: any) => chargeRow(t, chargeMonth, monthEnd, genRentRef)).filter((r): r is NonNullable<typeof r> => !!r)
  if (!rows.length) return { created: 0, total: 0, month: chargeMonth }

  // one charge per tenancy per month (migration 217) — two tenants in a room in a changeover month each get theirs
  const { data: inserted, error: upErr } = await s.from('rent_charges')
    .upsert(rows, { onConflict: 'tenancy_id,charge_month', ignoreDuplicates: true }).select('id')
  if (upErr) throw new Error(upErr.message)
  return { created: inserted?.length ?? 0, total: rows.length, month: chargeMonth, partMonths: rows.filter(r => 'amount_due_note' in r).length }
}

/** One tenancy's charge for a month, with the part-month rule. A tenancy starting after the 1st gets the start day on
 *  its reference (RR-075CR-R05-2610-17), so it can sit beside the outgoing tenant's charge for the same room. */
export async function ensureTenancyCharge(s: SupabaseClient, tenancyId: string, chargeMonth: string): Promise<string | null> {
  const [y, m] = chargeMonth.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const { data: t } = await s.from('tenancies').select('id, room_id, property_id, rent_amount, rent_due_day, start_date, end_date, let_cancelled_at, rooms(name, is_let_only), properties(property_code, letting_type)').eq('id', tenancyId).maybeSingle()
  if (!t || !t.room_id || t.let_cancelled_at || !(Number(t.rent_amount) > 0)) return null
  // let-only (house or room): the landlord collects the rent, so there is never a charge to raise here
  if ((t as any).properties?.letting_type === 'let_only' || (t as any).rooms?.is_let_only) return null
  if (t.start_date > monthEnd || (t.end_date && t.end_date < chargeMonth)) return null
  const { data: own } = await s.from('rent_charges').select('id').eq('tenancy_id', t.id).eq('charge_month', chargeMonth).maybeSingle()
  if (own) return own.id
  const { genRentRef } = await import('@/lib/references')
  const row = chargeRow(t, chargeMonth, monthEnd, genRentRef)
  if (!row) return null
  const { data, error } = await s.from('rent_charges').upsert(row, { onConflict: 'tenancy_id,charge_month' }).select('id').single()
  return error ? null : data.id
}

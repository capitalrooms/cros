// Raise one month's rent charges for every tenancy running in that month (demo properties excluded — or, in practice
// mode, only demo properties: their charges get practice numbers, migration 209).
// Used by the "Generate charges" button and by the monthly cron, so it must be safe to run twice:
// existing charges (room + month) are left alone.
//
// Part months use the house pro-rata rule (monthly rent × 12 ÷ 365 × days):
//   • a tenancy starting after the 1st is charged from its start date (the same figure as its check-in balance)
//   • a tenancy ending before the month's last day is charged up to its end date
import type { SupabaseClient } from '@supabase/supabase-js'
import { demoPropertyIds, inScope, practiceReady, PRACTICE_NOT_READY } from '@/lib/demoProperties'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const dayMs = 86_400_000

export async function generateMonthCharges(s: SupabaseClient, chargeMonth: string, opts: { practice?: boolean } = {}) {
  if (!/^\d{4}-\d{2}-01$/.test(chargeMonth)) throw new Error('Month must be the 1st, e.g. 2026-10-01')
  const [y, m] = chargeMonth.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const { data: tenancies, error } = await s.from('tenancies')
    .select('id, room_id, property_id, rent_amount, start_date, end_date, rooms(name), properties(property_code)')
    .lte('start_date', monthEnd)
    .or(`end_date.is.null,end_date.gte.${chargeMonth}`)
    .not('rent_amount', 'is', null)
  if (error) throw new Error(error.message)

  const demo = await demoPropertyIds(s)
  if (opts.practice && !(await practiceReady(s))) throw new Error(PRACTICE_NOT_READY)
  const ok = inScope(demo, !!opts.practice)
  const live = (tenancies ?? []).filter((t: any) => ok(t.property_id) && t.room_id && Number(t.rent_amount) > 0)
  const { genRentRef } = await import('@/lib/references')

  const rows = live.map((t: any) => {
    const monthly = Number(t.rent_amount)
    const from = t.start_date > chargeMonth ? t.start_date : chargeMonth
    const to = t.end_date && t.end_date < monthEnd ? t.end_date : monthEnd
    const days = Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1
    const whole = from === chargeMonth && to === monthEnd
    const amount = whole ? monthly : r2((monthly * 12 / 365) * days)
    const reference = t.properties?.property_code && t.rooms?.name ? genRentRef(t.properties.property_code, t.rooms.name, new Date(chargeMonth)) : null
    return {
      room_id: t.room_id, property_id: t.property_id, charge_month: chargeMonth,
      amount_due: amount, amount_received: 0, status: 'pending',
      ...(whole ? {} : { amount_due_note: `Part month: ${days} days (${from} to ${to}) at £${monthly} × 12 ÷ 365` }),
      ...(reference ? { reference } : {}),
    }
  })
  if (!rows.length) return { created: 0, total: 0, month: chargeMonth }

  const { data: inserted, error: upErr } = await s.from('rent_charges')
    .upsert(rows, { onConflict: 'room_id,charge_month', ignoreDuplicates: true }).select('id')
  if (upErr) throw new Error(upErr.message)
  return { created: inserted?.length ?? 0, total: rows.length, month: chargeMonth, partMonths: rows.filter(r => 'amount_due_note' in r).length }
}

/** Make sure one tenancy has its charge for a month (e.g. a bank payment arrived before that month's charges were
 *  raised). Same part-month rule as the monthly run. Returns the charge id, or null if the tenancy isn't running then. */
export async function ensureTenancyCharge(s: SupabaseClient, tenancyId: string, chargeMonth: string): Promise<string | null> {
  const [y, m] = chargeMonth.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const { data: t } = await s.from('tenancies').select('id, room_id, property_id, rent_amount, start_date, end_date, rooms(name), properties(property_code)').eq('id', tenancyId).maybeSingle()
  if (!t || !t.room_id || !(Number(t.rent_amount) > 0)) return null
  if (t.start_date > monthEnd || (t.end_date && t.end_date < chargeMonth)) return null
  const { data: existing } = await s.from('rent_charges').select('id').eq('room_id', t.room_id).eq('charge_month', chargeMonth).maybeSingle()
  if (existing) return existing.id
  const monthly = Number(t.rent_amount)
  const from = t.start_date > chargeMonth ? t.start_date : chargeMonth
  const to = t.end_date && t.end_date < monthEnd ? t.end_date : monthEnd
  const days = Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1
  const whole = from === chargeMonth && to === monthEnd
  const { genRentRef } = await import('@/lib/references')
  const tt: any = t
  const reference = tt.properties?.property_code && tt.rooms?.name ? genRentRef(tt.properties.property_code, tt.rooms.name, new Date(chargeMonth)) : null
  const { data, error } = await s.from('rent_charges').upsert({
    room_id: t.room_id, property_id: t.property_id, charge_month: chargeMonth,
    amount_due: whole ? monthly : r2((monthly * 12 / 365) * days), amount_received: 0, status: 'pending',
    ...(whole ? {} : { amount_due_note: `Part month: ${days} days (${from} to ${to}) at £${monthly} × 12 ÷ 365` }),
    ...(reference ? { reference } : {}),
  }, { onConflict: 'room_id,charge_month' }).select('id').single()
  return error ? null : data.id
}

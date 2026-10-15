// Raise one month's rent charges for every tenancy running in that month (demo properties excluded — or, in practice
// mode, only demo properties: their charges get practice numbers, migration 209).
// Used by the "Generate charges" button and by the monthly cron, so it must be safe to run twice:
// existing charges (tenancy + month) are left alone.
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
    .select('id, room_id, property_id, rent_amount, rent_due_day, start_date, end_date, rooms(name), properties(property_code, letting_type)')
    .lte('start_date', monthEnd)
    .or(`end_date.is.null,end_date.gte.${chargeMonth}`)
    .is('let_cancelled_at', null)                         // a let that fell through owes nothing
    .not('rent_amount', 'is', null)
  if (error) throw new Error(error.message)

  const demo = await demoPropertyIds(s)
  if (opts.practice && !(await practiceReady(s))) throw new Error(PRACTICE_NOT_READY)
  const ok = inScope(demo, !!opts.practice)
  // let-only houses: we find the tenant, the landlord collects the rent — never raise monthly charges (as the rent roll)
  const live = (tenancies ?? []).filter((t: any) => ok(t.property_id) && t.room_id && Number(t.rent_amount) > 0 && t.properties?.letting_type !== 'let_only')
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
function chargeRow(t: any, chargeMonth: string, monthEnd: string, genRentRef: (code: string, room: string, d: Date) => string) {
  const monthly = Number(t.rent_amount)
  const dueDay = Number(t.rent_due_day) || 1
  let from: string, to: string, amount: number, whole: boolean, note: string | null = null
  if (dueDay === 1) {
    // rent due on the 1st: calendar months (as always)
    from = t.start_date > chargeMonth ? t.start_date : chargeMonth
    to = t.end_date && t.end_date < monthEnd ? t.end_date : monthEnd
    const days = Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1
    whole = from === chargeMonth && to === monthEnd
    amount = whole ? monthly : r2((monthly * 12 / 365) * days)
    if (!whole) note = `Part month: ${days} days (${from} to ${to}) at £${monthly} × 12 ÷ 365`
  } else {
    // rent due on another day (15 Oct 2026, e.g. "full month — rent due on the 6th"): this month's charge is the rent
    // period that starts on that day (6th → 5th), plus any days before it when the tenancy starts this month — the
    // same figures as the first payment on the check-in balance and the agreement (lib/tenancy/firstRent)
    const p = rentPeriod(chargeMonth, dueDay)
    const parts: [string, string][] = []
    if (t.start_date >= chargeMonth && t.start_date < p.start) parts.push([t.start_date, minIso(addDays(p.start, -1), t.end_date)])
    const f = t.start_date > p.start ? t.start_date : p.start
    const e = minIso(p.end, t.end_date)
    if (f <= e) parts.push([f, e])
    if (!parts.length) return null   // e.g. the tenancy ended before this month's rent day
    from = parts[0][0]; to = parts[parts.length - 1][1]
    whole = parts.length === 1 && from === p.start && to === p.end
    amount = r2(parts.reduce((t2, [a, b]) => t2 + (a === p.start && b === p.end ? monthly : (monthly * 12 / 365) * (Math.round((Date.parse(b) - Date.parse(a)) / dayMs) + 1)), 0))
    if (!whole) note = `Rent due on the ${dueDay}${dueDay % 10 === 1 && dueDay !== 11 ? 'st' : dueDay % 10 === 2 && dueDay !== 12 ? 'nd' : dueDay % 10 === 3 && dueDay !== 13 ? 'rd' : 'th'}: ${parts.map(([a, b]) => a === p.start && b === p.end ? `full month ${a} to ${b}` : `${Math.round((Date.parse(b) - Date.parse(a)) / dayMs) + 1} days (${a} to ${b})`).join(' + ')} at £${monthly} × 12 ÷ 365 a day`
  }
  const base = t.properties?.property_code && t.rooms?.name ? genRentRef(t.properties.property_code, t.rooms.name, new Date(chargeMonth)) : null
  const reference = base && from > chargeMonth ? `${base}-${from.slice(8, 10)}` : base
  return {
    tenancy_id: t.id, room_id: t.room_id, property_id: t.property_id, charge_month: chargeMonth,
    amount_due: amount, amount_received: 0, status: 'pending',
    ...(note ? { amount_due_note: note } : {}),
    ...(reference ? { reference } : {}),
  }
}

/** Make sure one tenancy has its charge for a month (e.g. a bank payment arrived before that month's charges were
 *  raised). Same part-month rule as the monthly run. Returns the charge id, or null if the tenancy isn't running then. */
export async function ensureTenancyCharge(s: SupabaseClient, tenancyId: string, chargeMonth: string): Promise<string | null> {
  const [y, m] = chargeMonth.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const { data: t } = await s.from('tenancies').select('id, room_id, property_id, rent_amount, rent_due_day, start_date, end_date, let_cancelled_at, rooms(name), properties(property_code)').eq('id', tenancyId).maybeSingle()
  if (!t || !t.room_id || t.let_cancelled_at || !(Number(t.rent_amount) > 0)) return null
  if (t.start_date > monthEnd || (t.end_date && t.end_date < chargeMonth)) return null
  const { data: own } = await s.from('rent_charges').select('id').eq('tenancy_id', t.id).eq('charge_month', chargeMonth).maybeSingle()
  if (own) return own.id
  const { genRentRef } = await import('@/lib/references')
  const row = chargeRow(t, chargeMonth, monthEnd, genRentRef)
  if (!row) return null
  const { data, error } = await s.from('rent_charges').upsert(row, { onConflict: 'tenancy_id,charge_month' }).select('id').single()
  return error ? null : data.id
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (isoDate: string, n: number) => iso(new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * dayMs))
const minIso = (a: string, b?: string | null) => (b && b < a ? b : a)
/** The rent period beginning on the rent day in this month (clamped to the month's length), to the day before the next. */
function rentPeriod(chargeMonth: string, dueDay: number) {
  const [y, m] = chargeMonth.split('-').map(Number)
  const dim = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate()   // mm 1-based
  const start = iso(new Date(Date.UTC(y, m - 1, Math.min(dueDay, dim(y, m)))))
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  const nextDue = iso(new Date(Date.UTC(ny, nm - 1, Math.min(dueDay, dim(ny, nm)))))
  return { start, end: addDays(nextDue, -1) }
}

export { chargeRow as chargeRowForTest }

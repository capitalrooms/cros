// Pro-rata rent for a month, as the charge generator raises it. Pure (no database), so it can be tested.
// Used by lib/rentCharges/generate.ts and by lib/finance/calc.test.ts.
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const dayMs = 86_400_000

export function chargeRow(t: any, chargeMonth: string, monthEnd: string, genRentRef: (code: string, room: string, d: Date) => string) {
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
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (isoDate: string, n: number) => iso(new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * dayMs))
export const minIso = (a: string, b?: string | null) => (b && b < a ? b : a)
/** The rent period beginning on the rent day in this month (clamped to the month's length), to the day before the next. */
export function rentPeriod(chargeMonth: string, dueDay: number) {
  const [y, m] = chargeMonth.split('-').map(Number)
  const dim = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate()   // mm 1-based
  const start = iso(new Date(Date.UTC(y, m - 1, Math.min(dueDay, dim(y, m)))))
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  const nextDue = iso(new Date(Date.UTC(ny, nm - 1, Math.min(dueDay, dim(ny, nm)))))
  return { start, end: addDays(nextDue, -1) }
}

export { chargeRow as chargeRowForTest }

/** What a tenancy owes for one month under the part-month rule above, given its dates (e.g. a proposed new end date).
 *  null = nothing due that month. Used by the end-date preview so it shows exactly what the charges would be. */
export function rentDueForMonth(t: { id?: string; room_id?: string; property_id?: string; start_date: string; end_date: string | null; rent_amount: number; rent_due_day?: number | null }, chargeMonth: string): { amount: number; note: string | null } | null {
  const [y, m] = chargeMonth.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  if (t.start_date > monthEnd || (t.end_date && t.end_date < chargeMonth)) return null
  const row = chargeRow(t, chargeMonth, monthEnd, () => '')
  return row ? { amount: Number(row.amount_due), note: (row as any).amount_due_note ?? null } : null
}

// The first rent payment of a tenancy — shared by the check-in balance demand and the tenancy agreement,
// so the two documents can never show different figures.
//
// If rent is due on the same day of the month as the tenancy starts, the first payment is a full month.
// Otherwise it covers the days from the start date up to the day before the first rent day, at the
// standard UK daily rate: monthly rent × 12 ÷ 365. (Harry's practice — e.g. £1,350 pcm starting 15 October,
// rent due on the 1st → 17 days → £754.52.)

export interface FirstRent {
  amount: number          // £, rounded to the penny
  from: Date              // tenancy start
  to: Date                // last day this payment covers
  days: number
  full: boolean           // true = a normal full month
  nextDue: Date           // first normal rent day after this period
  dailyRate: number
}

const atNoon = (y: number, m: number, d: number) => new Date(y, m, d, 12)
const dim = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

/** Parse "2026-10-15", "15/10/2026", "15th October 2026" into a local date at noon (no timezone drift). */
export function parseTenancyDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : atNoon(v.getFullYear(), v.getMonth(), v.getDate())
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return atNoon(+m[1], +m[2] - 1, +m[3])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) return atNoon(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1])
  const t = new Date(s.replace(/(\d+)(st|nd|rd|th)\b/i, '$1'))
  return isNaN(t.getTime()) ? null : atNoon(t.getFullYear(), t.getMonth(), t.getDate())
}

export function firstRentPayment(startIn: string | Date, monthlyRent: number, rentDueDay?: number | null): FirstRent | null {
  const start = parseTenancyDate(startIn)
  if (!start || !(monthlyRent > 0)) return null
  const y = start.getFullYear(), mo = start.getMonth(), d = start.getDate()
  const dailyRate = (monthlyRent * 12) / 365
  const due = rentDueDay && rentDueDay >= 1 && rentDueDay <= 31 ? rentDueDay : d

  // First rent day strictly after the start date (clamped to the month's length, e.g. the 31st in June → 30th)
  let nextDue = atNoon(y, mo, Math.min(due, dim(y, mo)))
  if (nextDue <= start) nextDue = atNoon(y, mo + 1, Math.min(due, dim(y, mo + 1)))

  if (due === d || (due > dim(y, mo) && d === dim(y, mo))) {
    // Rent day is the start day → a normal full month, up to the day before the next rent day
    const to = atNoon(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate() - 1)
    return { amount: Math.round(monthlyRent * 100) / 100, from: start, to, days: Math.round((to.getTime() - start.getTime()) / 86_400_000) + 1, full: true, nextDue, dailyRate }
  }
  const to = atNoon(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate() - 1)
  const days = Math.round((to.getTime() - start.getTime()) / 86_400_000) + 1
  return { amount: Math.round(dailyRate * days * 100) / 100, from: start, to, days, full: false, nextDue, dailyRate }
}

export const ukLongDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

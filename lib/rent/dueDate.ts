// The date rent is due in a month (27 Oct 2026 — rent days went only to the 28th; Harry needed the 29th for a tenant).
// Any day 1–31; a month too short for it takes its last day (29th → 28 February, 31st → 30 April). The first-rent and
// monthly-charge sums (lib/tenancy/firstRent, lib/rentCharges/generate) already clamp this way.

/** "2026-02" + 29 → "2026-02-28"; "2026-03" + 29 → "2026-03-29". `month` may be "YYYY-MM" or a full date. */
export function rentDueDate(month: string, rentDueDay: number | string | null | undefined): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  const day = Math.min(Math.max(Math.round(Number(rentDueDay) || 1), 1), 31)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, '0')}`
}

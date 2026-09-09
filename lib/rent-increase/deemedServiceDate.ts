/**
 * Deemed service date for Section 13 notices sent by email.
 *
 * Rule (Service by Electronic Means, The Assured Tenancies and Agricultural
 * Occupancies (Forms) (England) Regulations 1997 as amended, and general
 * rule in Interpretation Act 1978 s.7):
 *
 *   • Sent on a business day (Mon–Fri) at or before 16:30 UK time
 *     → deemed served that same day
 *   • Sent after 16:30 UK time, or on a weekend
 *     → deemed served on the next business day
 *
 * UK bank holidays are not checked (would require an API or hardcoded list);
 * Mon–Fri is used as the proxy. If a notice is sent on a bank holiday, the
 * deemed date returned may be wrong — admin should confirm manually.
 *
 * Returns the deemed service date as an ISO 8601 date string (YYYY-MM-DD).
 */
export function getDeemedServiceDate(sendMoment: Date = new Date()): string {
  // Convert to UK time
  const ukTimeStr = sendMoment.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // en-GB format: "DD/MM/YYYY, HH:MM"
  const [datePart, timePart] = ukTimeStr.split(', ')
  const [dayStr, monthStr, yearStr] = datePart.split('/')
  const [hourStr, minStr] = (timePart || '00:00').split(':')

  const ukYear  = parseInt(yearStr, 10)
  const ukMonth = parseInt(monthStr, 10) - 1 // 0-indexed
  const ukDay   = parseInt(dayStr, 10)
  const ukHour  = parseInt(hourStr, 10)
  const ukMin   = parseInt(minStr, 10)

  const ukDate    = new Date(ukYear, ukMonth, ukDay) // local midnight, used for day-of-week only
  const dayOfWeek = ukDate.getDay() // 0 = Sun, 1 = Mon, …, 5 = Fri, 6 = Sat
  const isoDate   = `${ukYear}-${String(ukMonth + 1).padStart(2, '0')}-${String(ukDay).padStart(2, '0')}`

  const isWeekday   = dayOfWeek >= 1 && dayOfWeek <= 5
  const before1630  = ukHour < 16 || (ukHour === 16 && ukMin <= 30)
  const isServedNow = isWeekday && before1630

  if (isServedNow) return isoDate

  // Advance to the next business day (Mon–Fri only; skips weekends)
  let next = new Date(ukYear, ukMonth, ukDay)
  do {
    next.setDate(next.getDate() + 1)
  } while (next.getDay() === 0 || next.getDay() === 6) // skip Sun (0) and Sat (6)

  const ny = next.getFullYear()
  const nm = String(next.getMonth() + 1).padStart(2, '0')
  const nd = String(next.getDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

/**
 * Human-readable description of the deemed service date for display in the UI.
 * e.g. "today (sent before 16:30)" or "next business day (sent after 16:30)"
 */
export function getDeemedServiceDescription(sendMoment: Date = new Date()): string {
  const deemedDate = getDeemedServiceDate(sendMoment)
  const todayStr   = sendMoment.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-') // DD/MM/YYYY → YYYY-MM-DD

  const fmt = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

  // Compare date strings directly (both YYYY-MM-DD)
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  if (deemedDate === todayIso) {
    return `${fmt(deemedDate)} (sent before 16:30 — deemed served today)`
  }
  return `${fmt(deemedDate)} (sent after 16:30 or on a weekend — deemed served next business day)`
}

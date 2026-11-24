// Times for the informal video call (24 Nov 2026). Monday to Friday only, London time, always in the future.
// Pure functions, so the same rules run in the emails, the pages and the reminders.

export const CALL_TIMES = ['12:00', '12:30', '13:00', '13:30', '17:30', '18:00'] as const
export const MIN_NOTICE_MINUTES = 120      // nothing sooner than two hours from now
export const WORKING_DAYS_AHEAD = 5        // the list covers the next five working days

const LONDON = 'Europe/London'

/** The London clock offset, in minutes, at an instant. */
export function londonOffset(instant: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instant).map(x => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000)
}

/** A London date and time (YYYY-MM-DD, HH:MM) as the real instant. */
export function londonInstant(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let off = londonOffset(new Date(guess))
  let instant = guess - off * 60000
  const off2 = londonOffset(new Date(instant))
  if (off2 !== off) instant = guess - off2 * 60000   // across a clock change
  return new Date(instant)
}

/** The London calendar date of an instant, YYYY-MM-DD. */
export function londonDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

/** Monday to Friday for a London date. */
export function isWorkingDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return dow >= 1 && dow <= 5
}

/** The next working dates after `now`, in London, `count` of them. */
export function nextWorkingDates(now: Date, count = WORKING_DAYS_AHEAD): string[] {
  const out: string[] = []
  let cursor = new Date(now.getTime())
  for (let i = 0; i < 14 && out.length < count; i++) {
    const day = londonDate(cursor)
    if (isWorkingDate(day) && !out.includes(day)) out.push(day)
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000)
  }
  return out
}

/** The candidate instants (ISO) from the standard list, next working days, not sooner than the notice period. */
export function candidateSlots(now: Date): string[] {
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * 60000
  const out: string[] = []
  for (const day of nextWorkingDates(now)) for (const t of CALL_TIMES) {
    const at = londonInstant(day, t)
    if (at.getTime() >= earliest) out.push(at.toISOString())
  }
  return out
}

/** Only the slots a landlord ticked that are still usable right now. */
export function usableSlots(landlordSlots: string[], now: Date): string[] {
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * 60000
  return landlordSlots.filter(s => new Date(s).getTime() >= earliest && isWorkingDate(londonDate(new Date(s)))).sort()
}

/** A slot as people read it: "Thursday 27 November, 1:30pm". */
export function slotLabel(iso: string): string {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(' ', '').toLowerCase()
  return `${day}, ${time}`
}

// When someone can ask to view (12 Nov 2026, Harry): Monday to Friday, in the next week — lunchtime 12:00 to 1:30pm and
// evenings 5:00 to 6:30pm, 15-minute viewings — and they choose up to 3. Shared by the website form and the server check.
export const MAX_SLOTS = 3
export const LUNCH = ['12:00', '12:15', '12:30', '12:45', '13:00', '13:15']
export const EVENING = ['17:00', '17:15', '17:30', '17:45', '18:00', '18:15']

const isoLondon = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

/** The weekdays someone can choose: tomorrow onwards, the next 7 days, Monday–Friday. */
export function requestDays(now = new Date()): string[] {
  const out: string[] = []
  const base = new Date(`${isoLondon(now)}T12:00:00Z`)
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + i)
    const wd = d.getUTCDay()
    if (wd >= 1 && wd <= 5) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export const slotOk = (date: string, time: string, now = new Date()) => requestDays(now).includes(date) && (LUNCH.includes(time) || EVENING.includes(time))

export const slotLabel = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number)
  return `${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} at ${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`
}

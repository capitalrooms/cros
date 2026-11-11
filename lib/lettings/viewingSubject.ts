// The subject line for "a viewing is coming" emails to the tenants (11 Nov 2026, Harry: "Viewing arranged" needed a
// more professional title). Says what, where and when, in the house style of the other viewing emails:
//   "Viewing at 12 Saltwell Street – Friday 13 November, 2pm"
export function viewingSubject(house: string | null | undefined, date: string | null | undefined, time?: string | null): string {
  const where = house?.trim() ? ` at ${house.trim()}` : ''
  const d = date && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    : ''
  const m = String(time ?? '').match(/^(\d{1,2}):(\d{2})/)
  const t = m ? `${(+m[1] % 12) || 12}${m[2] === '00' ? '' : `:${m[2]}`}${+m[1] < 12 ? 'am' : 'pm'}` : ''
  const when = [d, t].filter(Boolean).join(', ')
  return `Viewing${where}${when ? ` – ${when}` : ''}`
}

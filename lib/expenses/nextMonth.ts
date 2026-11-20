/** The first day of next month (UK), as yyyy-mm-01. An invoice filed without a job is charged to this month's next statement. */
export function nextMonthStart(now = new Date()): string {
  const uk = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const [y, m] = uk.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7) + '-01'
}

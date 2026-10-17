// The month a landlord statement is for (17 Oct 2026). Rent is due on the 1st (unless a tenancy says otherwise), so
// a statement is about one calendar month — but the previous agent's statements carry payout-to-payout dates
// ("31 Aug – 30 Sept", "1 Oct – 1 Nov", even "1 Jun – 1 Jun" on an October statement). Those dates are kept exactly
// as the agent's statement shows them; screens and reports use this instead, the same order lib/finance/importedRent
// uses: the month on the reference ("LS1033 · Sept 2026"), else the statement date of an agent statement, else the
// month most of the period falls in.
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

export interface StatementDates { statement_reference?: string | null; statement_date?: string | null; period_start?: string | null; period_end?: string | null }

export function statementMonth(st: StatementDates): string | null {
  const ref = String(st.statement_reference ?? '')
  const m = ref.match(/·\s*([A-Za-z]{3,9})\.?\s+(\d{4})\s*$/)
  if (m) { const n = MONTHS[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith('sept') ? 4 : 3)]; if (n) return `${m[2]}-${String(n).padStart(2, '0')}` }
  if (/^LS\d+/i.test(ref) && st.statement_date) return String(st.statement_date).slice(0, 7)
  const s = st.period_start ? String(st.period_start).slice(0, 10) : null
  const e = st.period_end ? String(st.period_end).slice(0, 10) : null
  if (s && e) {
    // "31 Aug – 30 Sept" → Sept; "1 Oct – 1 Nov" → Oct: the month holding most of the days
    const days = new Map<string, number>()
    for (let d = new Date(`${s}T12:00:00Z`); d.toISOString().slice(0, 10) <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 7); days.set(k, (days.get(k) ?? 0) + 1)
      if (days.size > 3) break
    }
    return [...days.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? s.slice(0, 7)
  }
  return (s ?? e ?? (st.statement_date ? String(st.statement_date) : null))?.slice(0, 7) ?? null
}

/** The rent period for that month: the 1st to the last day ("2026-09" → 2026-09-01 … 2026-09-30) */
export function monthPeriod(month: string): { start: string; end: string } {
  const [y, mm] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` }
}

export const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Statements whose rent month (due on its 1st) falls between two dates — for reports. Reads a wider window of
 *  agent dates and keeps those whose month is in range; returns each statement's id, property and month. */
export async function statementsInMonths(s: { from: (t: string) => any }, from: string, to: string, propertyIds?: string[]): Promise<{ id: string; property_id: string; month: string }[]> {
  const widen = (d: string, days: number) => new Date(Date.parse(`${d.slice(0, 10)}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
  let q = s.from('landlord_statements').select('id, property_id, statement_reference, statement_date, period_start, period_end')
    .gte('statement_date', widen(from, -75)).lte('statement_date', widen(to, 75))
  if (propertyIds?.length) q = q.in('property_id', propertyIds)
  const { data } = await q
  // a month counts when its rent day (the 1st) is in range — so a 6 April–5 April tax year is May … April, and April's
  // rent (due 1 April) is in the year before
  const next = (m: string) => { const [y, mm] = m.split('-').map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}` }
  const lo = from.slice(8, 10) === '01' ? from.slice(0, 7) : next(from.slice(0, 7)), hi = to.slice(0, 7)
  return ((data ?? []) as any[]).map(st => ({ id: st.id, property_id: st.property_id, month: statementMonth(st) ?? '' }))
    .filter(x => x.month && x.month >= lo && x.month <= hi)
}

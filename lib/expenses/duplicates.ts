// Is a new landlord expense a duplicate of one already on record for the property?
//
// Same amount alone means little — cleaning is £130 every month. What matters is WHAT and WHEN:
//   • same supplier invoice number                         → certain duplicate
//   • same amount, same job, and it names the same period   → likely duplicate
//   • same amount, same job, but names a different period   → a repeat (e.g. "Cleaning September" / "Cleaning October") — fine
//   • one-off work (roof, boiler, repair…) same amount + job within 90 days → likely duplicate
//   • regular services (cleaning, gardening, bills…) same amount + job a few weeks apart → a repeat — fine,
//     but within 7 days → likely duplicate
//   • same job, same day, different amount                  → possible (typo or part invoice)
export interface ExpenseLike {
  id?: string
  description: string
  amount: number
  date: string                 // YYYY-MM-DD
  invoiceNumber?: string | null
  roomId?: string | null
  source?: 'expense' | 'statement'
  label?: string               // how to describe it back to the admin
}
export interface DuplicateHit { level: 'certain' | 'likely' | 'possible'; match: ExpenseLike; reason: string }

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}
const RECURRING = /\b(clean|cleaning|cleaner|garden|gardening|window|bins?|rubbish|waste|broadband|internet|wifi|electric|electricity|gas bill|energy|water|council tax|insurance|service charge|ground rent|licen[cs]e fee|tv licen[cs]e|utilities|utility|subscription|monthly|weekly|pest|alarm monitoring)\b/i
const ONE_OFF = /\b(roof|boiler|repair|repairs|fix|fixed|replace|replaced|replacement|install|installed|leak|plumb|plumber|electrician|rewire|window repair|door|lock|carpentry|decorat|paint|damp|mould|appliance|fridge|washing machine|oven|survey|certificate|eicr|gas safety|epc|fire)\b/i
const STOP = new Set(['the', 'a', 'an', 'and', 'for', 'of', 'to', 'at', 'in', 'on', 'room', 'rm', 'flat', 'property', 'invoice', 'inv', 'ref', 'no', 'job', 'works', 'work', 'cost', 'costs', 'charge', 'payment', 'paid'])

/** The period a description names ("Cleaning September", "Cleaning 09/2026", "w/c 5 Oct", "Q3"), as a comparable key. */
export function periodOf(text: string): string | null {
  const t = text.toLowerCase()
  const keys: string[] = []
  for (const m of t.matchAll(/\b([a-z]{3,9})\b/g)) if (MONTHS[m[1]]) keys.push(`m${MONTHS[m[1]]}`)
  for (const m of t.matchAll(/\b(0?[1-9]|1[0-2])[\/.-](20\d{2}|\d{2})\b/g)) keys.push(`m${Number(m[1])}`)
  for (const m of t.matchAll(/\bq([1-4])\b/g)) keys.push(`q${m[1]}`)
  for (const m of t.matchAll(/\b(?:week|wk|w\/c)\s*(\d{1,2})\b/g)) keys.push(`w${m[1]}`)
  for (const m of t.matchAll(/\b(20\d{2})\b/g)) keys.push(`y${m[1]}`)
  return keys.length ? [...new Set(keys)].sort().join(',') : null
}

/** The job itself, without the period, numbers and filler words. */
export function coreWords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w) && !MONTHS[w] && !/^(q[1-4]|wk|week)$/.test(w))
    .map(w => w.replace(/(ing|ed|es|s)$/, '')))
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let common = 0
  for (const w of a) if (b.has(w)) common++
  return common / Math.min(a.size, b.size)         // "roof fix" vs "roof fix – ridge tiles" counts as the same job
}

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
const pennies = (n: number) => Math.round(Number(n) * 100)
const invNo = (s?: string | null) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function findDuplicates(e: ExpenseLike, existing: ExpenseLike[]): DuplicateHit[] {
  const hits: DuplicateHit[] = []
  const core = coreWords(e.description), period = periodOf(e.description)
  const recurring = RECURRING.test(e.description), oneOff = ONE_OFF.test(e.description)
  for (const x of existing) {
    if (x.id && x.id === e.id) continue
    if (e.roomId && x.roomId && e.roomId !== x.roomId) continue
    if (invNo(e.invoiceNumber) && invNo(e.invoiceNumber) === invNo(x.invoiceNumber)) {
      hits.push({ level: 'certain', match: x, reason: `Same invoice number (${x.invoiceNumber})` }); continue
    }
    const sim = similarity(core, coreWords(x.description))
    if (sim < 0.6) continue
    const gap = days(e.date, x.date)
    const xPeriod = periodOf(x.description)
    if (pennies(e.amount) !== pennies(x.amount)) {
      if (gap < 1 && sim >= 0.8) hits.push({ level: 'possible', match: x, reason: 'Same job on the same day, different amount' })
      continue
    }
    if (period && xPeriod) {
      if (period === xPeriod) hits.push({ level: 'likely', match: x, reason: 'Same job, same amount and the same period' })
      continue                                   // different named periods → a repeat, not a duplicate
    }
    if (recurring && !oneOff) {
      if (gap <= 7) hits.push({ level: 'likely', match: x, reason: `Same amount for the same service ${gap < 1 ? 'on the same day' : `${Math.round(gap)} days apart`}` })
      continue
    }
    if (gap <= 90) hits.push({ level: 'likely', match: x, reason: `Same job and amount ${gap < 1 ? 'on the same day' : `${Math.round(gap)} days apart`}` })
    else if (oneOff && gap <= 365) hits.push({ level: 'possible', match: x, reason: `Same job and amount ${Math.round(gap / 30)} months ago` })
  }
  const rank = { certain: 0, likely: 1, possible: 2 }
  return hits.sort((a, b) => rank[a.level] - rank[b.level])
}

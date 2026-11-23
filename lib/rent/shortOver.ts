// What to do when a month's rent is paid short or over (Harry, 22 Nov 2026). Two choices, always with exact figures:
//   A — "pay the difference now": a short month is topped up this month, so the statement goes to the landlord in full.
//   B — "settle next month": the difference is added to (short) or taken off (over) next month's rent.
// Money is never moved between months by this file. It only works out the figures and words. The rent account
// (lib/rent/resolve rentPosition) already keeps every month's shortfall as arrears and any overpayment as credit,
// so the tenant's total is always right whichever choice is made.
// Pure: no database, no sending. Tested by lib/rent/shortOver.test.ts.

export type ShortOverSide = 'short' | 'over' | 'exact'

export interface ShortOverInput {
  month: string        // the month that was paid, e.g. '2026-11-01'
  due: number          // rent due for that month
  received: number     // paid against that month so far
  nextMonth: string    // the following month
  nextDue: number      // rent due next month
  creditBefore?: number // money already held on the account (an earlier overpayment not yet used)
}

export interface ShortOverPlan {
  side: ShortOverSide
  difference: number                 // how much short or over, to the penny (0 when exact)
  topUp: number                      // option A: pay this now (only when short)
  nextMonthPayable: number           // option B: what the tenant pays next month
  creditCarried: number              // option B: credit left on the account after next month
  lines: { option: 'A' | 'B'; text: string }[]
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const gbp = (n: number) => `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthName = (iso: string) => new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function shortOverPlan(i: ShortOverInput): ShortOverPlan {
  const due = r2(i.due), received = r2(i.received), nextDue = r2(i.nextDue), credit = r2(i.creditBefore ?? 0)
  const diff = r2(received - due)
  const side: ShortOverSide = Math.abs(diff) < 0.005 ? 'exact' : diff < 0 ? 'short' : 'over'
  const short = side === 'short' ? r2(-diff) : 0
  const over = side === 'over' ? diff : 0
  const month = monthName(i.month), next = monthName(i.nextMonth)

  // B: next month's payment absorbs the difference, and any earlier credit too
  let nextMonthPayable: number, creditCarried: number
  if (side === 'short') {
    nextMonthPayable = r2(nextDue + short)
    creditCarried = 0
  } else {
    const available = r2(over + credit)
    nextMonthPayable = r2(Math.max(0, nextDue - available))
    creditCarried = r2(Math.max(0, available - nextDue))
  }

  const lines: ShortOverPlan['lines'] = []
  if (side === 'exact') {
    lines.push({ option: 'B', text: `We received the full ${gbp(due)} for ${month}. Nothing more is needed. Next month: ${gbp(nextDue)}.` })
    return { side, difference: 0, topUp: 0, nextMonthPayable: nextDue, creditCarried: credit, lines }
  }
  if (side === 'short') {
    lines.push({ option: 'A', text: `We received ${gbp(received)} of the ${gbp(due)} rent for ${month}, so ${gbp(short)} is still to pay. Please pay the ${gbp(short)} within 24 hours, so we can pay your landlord the full amount for ${month}.` })
    lines.push({ option: 'B', text: `We received ${gbp(received)} of the ${gbp(due)} rent for ${month}, so ${gbp(short)} is short. If you prefer, pay ${gbp(nextDue)} plus ${gbp(short)}, making ${gbp(nextMonthPayable)} for ${next}.` })
  } else {
    lines.push({ option: 'B', text: `You paid ${gbp(received)} for ${month}, which is ${gbp(over)} more than the ${gbp(due)} due.${nextMonthPayable === 0 ? ` That covers ${next} as well, and ${gbp(creditCarried)} is held on your account.` : ` We will take the ${gbp(over)} off ${next}, so you pay ${gbp(nextMonthPayable)} for ${next} instead of ${gbp(nextDue)}.`}` })
  }
  return { side, difference: Math.abs(diff), topUp: short, nextMonthPayable, creditCarried, lines }
}

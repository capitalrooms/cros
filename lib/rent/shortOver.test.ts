// Run: node --experimental-strip-types lib/rent/shortOver.test.ts   (the script exits non-zero if any check fails)
import assert from 'node:assert/strict'
import { shortOverPlan } from './shortOver.ts'

const base = { month: '2026-11-01', nextMonth: '2026-12-01' }
const cases: [string, Parameters<typeof shortOverPlan>[0], Partial<ReturnType<typeof shortOverPlan>>][] = [
  ['exact', { ...base, due: 800, received: 800, nextDue: 800 }, { side: 'exact', topUp: 0, nextMonthPayable: 800, creditCarried: 0 }],
  ['10p short', { ...base, due: 800, received: 799.90, nextDue: 800 }, { side: 'short', difference: 0.10, topUp: 0.10, nextMonthPayable: 800.10, creditCarried: 0 }],
  ['£50 short', { ...base, due: 800, received: 750, nextDue: 800 }, { side: 'short', topUp: 50, nextMonthPayable: 850 }],
  ['10p over', { ...base, due: 800, received: 800.10, nextDue: 800 }, { side: 'over', difference: 0.10, topUp: 0, nextMonthPayable: 799.90, creditCarried: 0 }],
  ['£900 over (rent £800)', { ...base, due: 800, received: 1700, nextDue: 800 }, { side: 'over', nextMonthPayable: 0, creditCarried: 100 }],
  ['over with earlier credit', { ...base, due: 800, received: 800.10, nextDue: 800, creditBefore: 20 }, { side: 'over', nextMonthPayable: 779.90, creditCarried: 0 }],
]
let failed = 0
for (const [name, input, want] of cases) {
  const got = shortOverPlan(input)
  try { for (const [k, v] of Object.entries(want)) assert.equal((got as any)[k], v, `${name}: ${k}`); console.log('ok  ', name) }
  catch (e: any) { failed++; console.log('FAIL', name, '-', e.message) }
}
// the wording must carry the exact figures
const short = shortOverPlan({ ...base, due: 800, received: 799.90, nextDue: 800 })
assert.ok(short.lines[0].text.includes('£0.10'), 'option A names the 10p')
assert.ok(short.lines[1].text.includes('£800.10'), 'option B names the £800.10')
const over = shortOverPlan({ ...base, due: 800, received: 800.10, nextDue: 800 })
assert.ok(over.lines[0].text.includes('£799.90'), 'over: next month figure is £799.90')
console.log(failed ? `${failed} failed` : 'all checks passed')
process.exit(failed ? 1 : 0)

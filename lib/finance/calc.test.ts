// Calculation tests on a made-up house (no database, nothing written). Run:
//   node --experimental-strip-types lib/finance/calc.test.ts
// Covers: pro-rata first month, a full month, an overpayment, an underpayment of 10p, a part payment, a room with no
// charge yet, management fees by basis, the option A/B figures, the house readiness list and an expense total.
import assert from 'node:assert/strict'
import { rentDueForMonth } from '../rentCharges/proRata.ts'
import { resolveFee, feeAmount } from '../fees/managementFee.ts'
import { shortOverPlan } from '../rent/shortOver.ts'
import { houseReadiness, readinessSummary } from './readiness.ts'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
let failed = 0
const check = (name: string, fn: () => void) => { try { fn(); console.log('ok  ', name) } catch (e: any) { failed++; console.log('FAIL', name, '-', e.message) } }

// The made-up house: 7 tenants, £800 a month each
const RENT = 800
const tenants = {
  alice: { room: '1', start_date: '2026-11-20', end_date: null, rent_amount: RENT, rent_due_day: 1 },   // moves in mid-month
  ben:   { room: '2', start_date: '2026-06-01', end_date: null, rent_amount: RENT, rent_due_day: 1 },
  cara:  { room: '3', start_date: '2026-06-01', end_date: null, rent_amount: RENT, rent_due_day: 1 },   // overpays £50
  dan:   { room: '4', start_date: '2026-06-01', end_date: null, rent_amount: RENT, rent_due_day: 1 },   // underpays 10p
  eve:   { room: '5', start_date: '2026-06-01', end_date: null, rent_amount: RENT, rent_due_day: 1 },   // pays half
  fay:   { room: '6', start_date: '2026-06-01', end_date: null, rent_amount: RENT, rent_due_day: 1 },   // charge not raised yet
  gus:   { room: '7', start_date: '2026-06-01', end_date: null, rent_amount: RENT, rent_due_day: 1 },
}
const NOV = '2026-11'
const expenses = [{ what: 'Boiler service', amount: 120.00 }, { what: 'Light bulbs', amount: 45.50 }, { what: 'Bin bags', amount: 9.99 }]

check('pro rata: moves in on the 20th, 11 days of 30 at £800 × 12 ÷ 365', () => {
  const due = rentDueForMonth(tenants.alice as any, NOV)!
  assert.equal(due.amount, r2(RENT * 12 / 365 * 11))
  assert.equal(due.amount, 289.32)
  assert.match(due.note ?? '', /Part month: 11 days/)
})
check('full month is the whole rent', () => {
  assert.equal(rentDueForMonth(tenants.ben as any, NOV)!.amount, RENT)
})
check('no charge is due after a tenancy has ended', () => {
  assert.equal(rentDueForMonth({ ...tenants.ben, end_date: '2026-10-15' } as any, NOV), null)
})

// What each tenant paid in November
const paid: Record<string, number> = { alice: 289.32, ben: 800, cara: 850, dan: 799.90, eve: 400, fay: 0, gus: 800 }
const dueOf = (k: keyof typeof tenants) => (k === 'alice' ? 289.32 : RENT)

check('overpayment: £50 over, option B takes it off December', () => {
  const plan = shortOverPlan({ month: '2026-11-01', due: dueOf('cara'), received: paid.cara, nextMonth: '2026-12-01', nextDue: RENT })
  assert.equal(plan.side, 'over')
  assert.equal(plan.difference, 50)
  assert.equal(plan.nextMonthPayable, 750)
})
check('underpayment: 10p short, option A asks for 10p, option B makes December £800.10', () => {
  const plan = shortOverPlan({ month: '2026-11-01', due: dueOf('dan'), received: paid.dan, nextMonth: '2026-12-01', nextDue: RENT })
  assert.equal(plan.side, 'short')
  assert.equal(plan.topUp, 0.10)
  assert.equal(plan.nextMonthPayable, 800.10)
})
check('part payment: £400 of £800, option B makes December £1,200', () => {
  const plan = shortOverPlan({ month: '2026-11-01', due: dueOf('eve'), received: paid.eve, nextMonth: '2026-12-01', nextDue: RENT })
  assert.equal(plan.topUp, 400)
  assert.equal(plan.nextMonthPayable, 1200)
})
check('exact payment needs nothing more', () => {
  const plan = shortOverPlan({ month: '2026-11-01', due: dueOf('gus'), received: paid.gus, nextMonth: '2026-12-01', nextDue: RENT })
  assert.equal(plan.side, 'exact')
})
check('pro-rata tenant who paid their part month is exact', () => {
  const plan = shortOverPlan({ month: '2026-11-01', due: dueOf('alice'), received: paid.alice, nextMonth: '2026-12-01', nextDue: RENT })
  assert.equal(plan.side, 'exact')
})

// Management fees: 10% of rent received (the usual basis), and a fixed fee as an override
check('10% of rent received on £800 is £80.00', () => {
  const fee = resolveFee({}, { management_fee_type: 'pct_received', management_fee_pct: 10 })
  assert.equal(feeAmount(fee, { received: 800, charged: 800 }), 80)
})
check('on the underpaid 10p, the fee is 10% of what was received (£79.99)', () => {
  const fee = resolveFee({}, { management_fee_type: 'pct_received', management_fee_pct: 10 })
  assert.equal(feeAmount(fee, { received: 799.90, charged: 800 }), 79.99)
})
check('a tenancy fee overrides the property default', () => {
  const fee = resolveFee({ management_fee_type: 'fixed', management_fee_fixed: 50 }, { management_fee_type: 'pct_received', management_fee_pct: 10 })
  assert.equal(fee.source, 'tenancy')
  assert.equal(feeAmount(fee, { received: 800, charged: 800 }), 50)
})
check('no fee set is "not set", never assumed', () => {
  const fee = resolveFee({}, {})
  assert.equal(fee.source, 'none')
  assert.equal(feeAmount(fee, { received: 800, charged: 800 }), null)
})

// Expenses logged for the house this month
check('expenses for the house add to £175.49', () => {
  assert.equal(r2(expenses.reduce((t, e) => t + e.amount, 0)), 175.49)
})

// Readiness for the house, built from a rent roll like the one the rent roll screen reads
const room = (r: string, status: string, due: number | null, received: number, extra: any = {}) => ({
  roomId: r, room: `Room ${r}`, tenant: `Tenant ${r}`, tenancyId: 't', reference: null, chargeId: 'c', chargeNo: null,
  due, received, difference: due == null ? null : r2(received - due), status, receipts: [], paidOver: 0, statement: null, expected: RENT, ...extra })
const roll: any = { month: '2026-11-01', source: 'cros', takeover: '2026-10-01', totals: {}, properties: [{
  id: 'house', name: 'Test House', code: null, landlord: 'Test Landlord', due: 0, received: 289.32 + 800 + 850 + 799.90 + 400 + 0 + 800, missing: 0, readyForStatement: 0, statements: [],
  rooms: [
    room('1', 'paid', 289.32, 289.32),
    room('2', 'paid', 800, 800),
    room('3', 'over', 800, 850),
    room('4', 'part', 800, 799.90),
    room('5', 'part', 800, 400),
    room('6', 'no_charge', null, 0),
    room('7', 'paid', 800, 800),
  ] }] }
const [house] = houseReadiness(roll)
check('readiness: three rooms hold the house up: two part paid and one with no charge yet', () => {
  assert.equal(house.state, 'waiting')
  assert.equal(house.unitsTotal, 7)
  assert.equal(house.blockers.length, 3)
  assert.match(house.blockers.map(b => b.text).join(' | '), /Room 4 · Tenant 4: part paid, £0\.10 short/)
  assert.match(house.blockers.map(b => b.text).join(' | '), /Room 5 · Tenant 5: part paid, £400\.00 short/)
  assert.match(house.blockers.map(b => b.text).join(' | '), /Room 6: no rent charge raised yet/)
})
check('readiness: the overpaid room is not a blocker', () => {
  assert.equal(house.blockers.some(b => b.text.includes('Room 3')), false)
})
check('readiness: the house is not ready until the part-paid and missing rooms are sorted', () => {
  assert.deepEqual(readinessSummary([house]), { houses: 1, ready: 0, waiting: 1, notStarted: 0 })
})

console.log(failed ? `${failed} failed` : 'all calculation checks passed')
process.exit(failed ? 1 : 0)

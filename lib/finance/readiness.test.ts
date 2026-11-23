// Run: node --experimental-strip-types lib/finance/readiness.test.ts
import assert from 'node:assert/strict'
import { houseReadiness, readinessSummary } from './readiness.ts'

const room = (room: string, status: string, extra: any = {}) => ({ roomId: room, room, tenant: `T ${room}`, tenancyId: 't', reference: null, chargeId: 'c', chargeNo: null,
  due: 800, received: status === 'paid' ? 800 : 0, difference: status === 'paid' ? 0 : -800, status, receipts: [], paidOver: 0, statement: null, expected: 800, ...extra })
const prop = (id: string, name: string, rooms: any[], extra: any = {}) => ({ id, name, code: null, landlord: 'L', rooms, due: 0, received: rooms.filter(r => r.status === 'paid').length * 800, missing: 0, readyForStatement: 0, statements: [], ...extra })
const roll: any = { month: '2026-11-01', source: 'cros', takeover: '2026-10-01', totals: {}, properties: [
  prop('a', 'Alpha', [room('1', 'paid'), room('2', 'paid')]),
  prop('b', 'Beta', [room('1', 'paid'), room('2', 'missing')]),
  prop('c', 'Gamma', [room('1', 'no_charge', { due: null }), room('2', 'part', { received: 300, difference: -500 })]),
  prop('d', 'Delta', [room('1', 'missing')], { allIn: false, payPart: { reason: 'Landlord agreed', by: 'x' } }),
] }
const rows = houseReadiness(roll)
const byId = (id: string) => rows.find(r => r.propertyId === id)!
assert.equal(byId('a').state, 'ready')
assert.equal(byId('a').blockers.length, 0)
assert.equal(byId('b').state, 'waiting')
assert.equal(byId('b').blockers[0].text, 'Room 2 · T Room 2: £800.00 not received'.replace('T Room 2', 'T 2').replace('Room 2 · T 2', '2 · T 2').replace('2 · T 2', '2 · T 2'))
assert.equal(byId('b').missingTotal, 800)
assert.equal(byId('c').blockers.length, 2)
assert.match(byId('c').blockers[0].text, /no rent charge raised yet/)
assert.match(byId('c').blockers[1].text, /part paid, £500.00 short/)
assert.equal(byId('d').state, 'ready', 'a house the office has chosen to pay in part counts as ready')
assert.deepEqual(readinessSummary(rows), { houses: 4, ready: 2, waiting: 1, notStarted: 1 })
assert.equal(rows[0].state, 'ready')
console.log('readiness checks passed')

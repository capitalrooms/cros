// node --experimental-strip-types lib/calls/slots.test.ts
import assert from 'node:assert/strict'
import { candidateSlots, londonInstant, londonDate, isWorkingDate, nextWorkingDates, slotLabel, usableSlots } from './slots.ts'

// Friday 27 November 2026, 10:00 London (GMT, so 10:00 UTC)
const fri = new Date('2026-11-27T10:00:00Z')
assert.equal(londonDate(fri), '2026-11-27')
assert.equal(isWorkingDate('2026-11-28'), false)          // Saturday
assert.equal(isWorkingDate('2026-11-30'), true)           // Monday
assert.deepEqual(nextWorkingDates(fri, 3), ['2026-11-27', '2026-11-30', '2026-12-01'])
// 1:30pm London in November is 13:30 UTC (GMT)
assert.equal(londonInstant('2026-11-30', '13:30').toISOString(), '2026-11-30T13:30:00.000Z')
// British summer time: 1:30pm London is 12:30 UTC
assert.equal(londonInstant('2026-06-01', '13:30').toISOString(), '2026-06-01T12:30:00.000Z')
// no weekend slots, nothing inside the two-hour notice, nothing in the past
const slots = candidateSlots(fri)
assert.ok(slots.every(s => isWorkingDate(londonDate(new Date(s)))))
assert.ok(slots.every(s => new Date(s).getTime() >= fri.getTime() + 120 * 60000))
// Friday 10:00: the 12:00 slot is only two hours away, so it is allowed; 12:00 is the first
assert.equal(new Date(slots[0]).toISOString(), '2026-11-27T12:00:00.000Z')
// a landlord's ticked time that has since become too soon is dropped
assert.deepEqual(usableSlots(['2026-11-27T11:00:00.000Z', '2026-11-30T13:30:00.000Z'], fri), ['2026-11-30T13:30:00.000Z'])
assert.equal(slotLabel('2026-11-30T13:30:00.000Z'), 'Monday 30 November, 1:30pm')
console.log('slots: all checks pass')

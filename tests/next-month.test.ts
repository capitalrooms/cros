/** Filed-without-a-job expenses go to next month's statement (19 Nov 2026). Run: npx tsx --test tests/next-month.test.ts */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nextMonthStart } from '../lib/expenses/nextMonth'

describe('nextMonthStart', () => {
  test('mid-month goes to the 1st of next month', () => assert.equal(nextMonthStart(new Date('2026-11-19T10:00:00Z')), '2026-12-01'))
  test('December rolls into January', () => assert.equal(nextMonthStart(new Date('2026-12-31T10:00:00Z')), '2027-01-01'))
  test('the UK date is used, not UTC (31 Oct is still October in London)', () => assert.equal(nextMonthStart(new Date('2026-10-31T23:30:00Z')), '2026-11-01'))
})

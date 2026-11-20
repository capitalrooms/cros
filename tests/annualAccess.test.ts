/**
 * Annual financial reports (19 Nov 2026): who may call which routes. Pure logic — the same canCallApi that proxy.ts and
 * requireAdmin use. Signed-in checks (real sessions) are separate; see the report.
 * Run: npx tsx --test tests/annualAccess.test.ts
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { canCallApi, ALL_AREAS, areasFor, ANNUAL_KEY, isAnnualPath } from '../lib/access/areas'

const ANNUAL_CALLS = [
  '/api/admin/reports/tax-year', '/api/admin/reports/resold', '/api/admin/reports/mtd',
  '/api/admin/agency-income', '/api/admin/company-pnl',
]
// monthly Finance: the accounts work the brief asks to keep open
const MONTHLY_CALLS = [
  '/api/admin/reports/fees', '/api/admin/landlord-statement', '/api/admin/statements', '/api/admin/payment-run',
  '/api/admin/expenses', '/api/admin/accountant-pack', '/api/admin/landlord-vat', '/api/admin/rent-roll', '/api/admin/finance-home',
]
const ACCOUNTS_MANAGER = areasFor('lettings', ['dashboard', 'finance', 'properties', 'people'])
const ORDINARY_OFFICE = areasFor('lettings', null)   // lettings + diary

describe('isAnnualPath', () => {
  test('annual routes and pages are recognised', () => {
    for (const p of ANNUAL_CALLS) assert.equal(isAnnualPath(p), true, p)
    assert.equal(isAnnualPath('/admin/reports/tax-year'), true)
    assert.equal(isAnnualPath('/api/admin/reports/export-pdf'), false)   // checked inside the route by type
  })
})

describe('owner (annual = true, administrator role)', () => {
  test('may call every annual route', () => {
    for (const p of ANNUAL_CALLS) assert.equal(canCallApi(p, ALL_AREAS, 'administrator', 'GET', true), true, p)
  })
  test('keeps monthly Finance', () => {
    for (const p of MONTHLY_CALLS) assert.equal(canCallApi(p, ALL_AREAS, 'administrator', 'GET', true), true, p)
  })
})

describe('administrator who is not the owner (annual = false)', () => {
  test('is refused every annual route — administrator status is not enough', () => {
    for (const p of ANNUAL_CALLS) assert.equal(canCallApi(p, ALL_AREAS, 'administrator', 'GET', false), false, p)
  })
  test('keeps monthly Finance', () => {
    for (const p of MONTHLY_CALLS) assert.equal(canCallApi(p, ALL_AREAS, 'administrator', 'GET', false), true, p)
  })
})

describe('Accounts Manager with monthly Finance, no annual permission', () => {
  test('refused every annual route', () => {
    for (const p of ANNUAL_CALLS) assert.equal(canCallApi(p, ACCOUNTS_MANAGER, 'lettings', 'GET', false), false, p)
  })
  test('keeps the monthly accounts process', () => {
    for (const p of MONTHLY_CALLS) assert.equal(canCallApi(p, ACCOUNTS_MANAGER, 'lettings', 'GET', false), true, p)
  })
})

describe('Accounts Manager granted the annual permission by the owner', () => {
  test('may call the annual routes', () => {
    for (const p of ANNUAL_CALLS) assert.equal(canCallApi(p, ACCOUNTS_MANAGER, 'lettings', 'GET', true), true, p)
  })
})

describe('ordinary office user (lettings + diary, no annual permission)', () => {
  test('refused annual routes and monthly Finance', () => {
    for (const p of ANNUAL_CALLS) assert.equal(canCallApi(p, ORDINARY_OFFICE, 'lettings', 'GET', false), false, p)
    for (const p of MONTHLY_CALLS) assert.equal(canCallApi(p, ORDINARY_OFFICE, 'lettings', 'GET', false), false, p)
  })
})

describe('the permission string', () => {
  test('is never an area on the rail, so it never shows as a tick box in areas', () => {
    assert.equal((ALL_AREAS as string[]).includes(ANNUAL_KEY), false)
    assert.equal(areasFor('lettings', [ANNUAL_KEY, 'finance']).includes(ANNUAL_KEY as any), false)
  })
})

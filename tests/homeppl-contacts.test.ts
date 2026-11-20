/**
 * Homeppl candidates and the contacts step (19 Nov 2026). Synthetic records only — no real people.
 * Run: npx tsx --test tests/homeppl-contacts.test.ts
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { candidateFromValidation } from '../lib/homeppl/candidates'
import { missingContacts } from '../lib/tenancy/contacts'

describe('candidateFromValidation', () => {
  test('maps a Homeppl validation to a candidate, with the phone', () => {
    const app = { uuid: 'app-1', address: '1 Test Street' }
    const v = { uuid: 'val-1', first_name: 'Test', last_name: 'Tenant', email: 'test.tenant@example.invalid', phone: '07000 000000', check_status: 'APPROVED', creation_dtm: '2026-11-01T10:00:00Z', relocation_date: '2026-12-01' }
    assert.deepEqual(candidateFromValidation(app, v), { validationUuid: 'val-1', firstName: 'Test', lastName: 'Tenant', email: 'test.tenant@example.invalid', phone: '07000 000000', status: 'APPROVED', created: '2026-11-01T10:00:00Z', address: '1 Test Street', moveIn: '2026-12-01' })
  })
  test('falls back to the nested applicant when the flat fields are absent', () => {
    const c = candidateFromValidation({}, { uuid: 'val-2', applicant: { first_name: 'Nested', last_name: 'Person', email: 'n@example.invalid', phone: '07111 111111' } })
    assert.equal(c.firstName, 'Nested'); assert.equal(c.email, 'n@example.invalid'); assert.equal(c.phone, '07111 111111')
  })
  test('missing fields become empty strings, never undefined', () => {
    const c = candidateFromValidation({}, { uuid: 'val-3' })
    assert.equal(c.email, ''); assert.equal(c.phone, ''); assert.equal(c.firstName, '')
  })
})

describe('missingContacts', () => {
  test('lists tenants with no email or no phone, and nothing else', () => {
    const out = missingContacts([
      { name: 'Test One', email: 'one@example.invalid', phone: '07000 000001' },
      { name: 'Test Two', email: '', phone: null },
      { name: 'Test Three', email: 'three@example.invalid' },
    ])
    assert.deepEqual(out, [{ name: 'Test Two', missing: ['email', 'phone'] }, { name: 'Test Three', missing: ['phone'] }])
  })
  test('whitespace counts as missing', () => {
    assert.deepEqual(missingContacts([{ name: 'Test Four', email: '   ', phone: ' ' }]), [{ name: 'Test Four', missing: ['email', 'phone'] }])
  })
  test('nothing to ask for when everyone is complete', () => {
    assert.deepEqual(missingContacts([{ name: 'Test Five', email: 'five@example.invalid', phone: '07000 000005' }]), [])
  })
})

import { tenantsFromAgreement } from '../lib/tenancy/contacts'
describe('tenantsFromAgreement', () => {
  test('every tenant on the agreement, in order', () => {
    const out = tenantsFromAgreement({ tenants: [{ name: 'Test One', email: 'one@example.invalid', phone: '' }, { name: 'Test Two', email: '', phone: '07000 000002' }] })
    assert.deepEqual(out, [{ name: 'Test One', email: 'one@example.invalid', phone: '' }, { name: 'Test Two', email: '', phone: '07000 000002' }])
  })
  test('a single-person result still gives one tenant', () => {
    assert.deepEqual(tenantsFromAgreement({ person_name: 'Test Solo', person_email: 'solo@example.invalid' }), [{ name: 'Test Solo', email: 'solo@example.invalid', phone: '' }])
  })
  test('blank names are dropped; nothing found gives none', () => {
    assert.deepEqual(tenantsFromAgreement({ tenants: [{ name: '  ' }, { name: 'Test Three' }] }), [{ name: 'Test Three', email: '', phone: '' }])
    assert.deepEqual(tenantsFromAgreement({}), [])
  })
})

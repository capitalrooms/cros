/**
 * Greeting regression (18 Nov 2026): the "Dear …" line in every document and email type, checked on rendered output.
 * Titled people keep their greeting exactly; nobody gets a lone surname or first name in a formal greeting.
 * Run: npx tsx --test tests/greetingRender.test.ts  (Supabase env is set to placeholders — nothing is contacted).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'placeholder'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'placeholder'

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dearName, dearFromText, hiName } from '../lib/people'

const greetingOf = (html: string) => html.match(/Dear ([^<]*?),/)?.[1]

const page = { salutation: 'Mr', first_name: 'Richard', last_name: 'Page', company: 'Page Properties Ltd' }
const tenant = { salutation: 'Miss', first_name: 'Donna', last_name: 'Pious' }
const joint = { salutation: 'Mr', first_name: 'John', last_name: 'Smith', joint_salutation: 'Mrs', joint_first_name: 'Jane', joint_last_name: 'Smith' }
const surnameOnly = { last_name: 'Page' }

describe('shared rule (lib/people)', () => {
  test('titled records keep their greeting', () => {
    assert.equal(dearName(page), 'Mr Page')
    assert.equal(dearName(tenant), 'Miss Pious')
    assert.equal(dearName(joint), 'Mr Smith and Mrs Smith')
  })
  test('no title: whole name, or Sir or Madam — never a lone surname', () => {
    assert.equal(dearName({ first_name: 'Richard', last_name: 'Page' }), 'Richard Page')
    assert.equal(dearName(surnameOnly), 'Sir or Madam')
  })
  test('short "Hi" name: first name for a person, formal for a business', () => {
    assert.equal(hiName(tenant), 'Donna')
    assert.equal(hiName({ salutation: 'Mr', last_name: 'Page' }), 'Mr Page')
  })
  test('typed names keep titles intact', () => {
    assert.equal(dearFromText('Mr Richard Page'), 'Mr Page')
    assert.equal(dearFromText('Richard Page'), 'Richard Page')
  })
})

describe('house certificate emails (lib/houseDocs)', async () => {
  const { houseEmailHtml } = await import('../lib/houseDocs')
  const docs = [{ key: 'gas', label: 'Gas safety', url: 'https://x', uploadedAt: null, nextDue: null, recent: true }] as any
  const html = (p: any) => houseEmailHtml(dearName(p), '12 Saltwell Street', docs, 'msg')
  test('landlord with title + company', () => assert.equal(greetingOf(html(page)), 'Mr Page'))
  test('tenant keeps title', () => assert.equal(greetingOf(html(tenant)), 'Miss Pious'))
  test('joint landlords', () => assert.equal(greetingOf(html(joint)), 'Mr Smith and Mrs Smith'))
  test('surname only → Sir or Madam', () => assert.equal(greetingOf(html(surnameOnly)), 'Sir or Madam'))
})

describe('tenant correspondence', async () => {
  const { emailHtml } = await import('../lib/tenancy/quickMessages')
  test('quick message to a titled tenant', () => {
    assert.equal(greetingOf(emailHtml('Your rent is due.', 'Miss Pious')), 'Miss Pious')
  })
  test('joint tenants', () => {
    assert.equal(greetingOf(emailHtml('Hello.', 'Miss Pious and Mr Ade')), 'Miss Pious and Mr Ade')
  })
})

describe('letters (lib/letters/personalise)', async () => {
  const { fill } = await import('../lib/letters/personalise')
  test('{dear} and the generic salutation use the formal greeting', () => {
    assert.match(fill('Dear Landlord,\n\nYour rent is due.', { name: 'Richard Page', dear: 'Mr Page' }), /Dear Mr Page,/)
  })
})

describe('move-in pack email (lib/movein/email)', async () => {
  const { packEmailHtml } = await import('../lib/movein/email')
  test('greeting is the tenant dear line', () => {
    const ctx = { first: null, address: '12 Saltwell Street, Poplar', tenant: { dear: 'Miss Pious', firstName: 'Donna' }, amountDue: 0, deposit: 0, holdingDeposit: 0, payBy: '', paymentRef: '', rentDueDay: '', rentMonthly: 0, startDate: '' } as any
    const out = packEmailHtml(ctx, [], 'https://example.test/pack/x', 'Please read.')
    assert.equal(greetingOf(out), 'Miss Pious')
  })
})

/**
 * The greeting rule ("Dear …") for emails and letters — lib/people. Harry, 15 Oct 2026: Richard Page's certificate
 * email said "Dear Page". A greeting is the title and surname ("Mr Page"), never a lone surname or first name.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dearName, dearFromText, hiName } from '../lib/people'

describe('dearName', () => {
  test('title and surname', () => {
    assert.equal(dearName({ salutation: 'Mr', first_name: 'Richard', last_name: 'Page' }), 'Mr Page')
  })
  test('joint owners', () => {
    assert.equal(dearName({ salutation: 'Mr', first_name: 'John', last_name: 'Smith', joint_salutation: 'Mrs', joint_first_name: 'Jane', joint_last_name: 'Smith' }), 'Mr Smith and Mrs Smith')
  })
  test('no title on file: the whole name, never a lone surname', () => {
    assert.equal(dearName({ first_name: 'Richard', last_name: 'Page' }), 'Richard Page')
    assert.equal(dearName({ last_name: 'Page' }), 'Sir or Madam')
    assert.equal(dearName({ last_name: 'Page', full_name: 'Richard Page' }), 'Richard Page')
  })
  test('a company or missing person: Sir or Madam', () => {
    assert.equal(dearName({ company: 'Page Properties Ltd' }), 'Sir or Madam')
    assert.equal(dearName({ first_name: 'Page', last_name: 'Properties' }), 'Sir or Madam')
    assert.equal(dearName(null), 'Sir or Madam')
  })
  test('never "Dear Page" for a landlord record that has only a surname', () => {
    assert.notEqual(dearName({ salutation: null, first_name: null, last_name: 'Page', company: 'Page Properties' }), 'Page')
  })
})

describe('dearFromText', () => {
  test('a name typed with its title', () => {
    assert.equal(dearFromText('Mr Richard Page'), 'Mr Page')
  })
  test('a name without a title is kept whole', () => {
    assert.equal(dearFromText('Richard Page'), 'Richard Page')
  })
})

describe('hiName', () => {
  test('friendly greeting uses the first name for a person', () => {
    assert.equal(hiName({ salutation: 'Ms', first_name: 'Donna', last_name: 'Pious' }), 'Donna')
  })
})

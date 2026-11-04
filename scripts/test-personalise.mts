// Proves "Letter to several landlords" personalises every copy (4 Nov 2026). Read-only: loads the landlord list,
// builds each copy's greeting, letter body and email exactly as the screen does, and checks nothing generic or
// another landlord's name gets through. Run: npx tsx scripts/test-personalise.mts
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
const P: any = await import('../lib/people.ts'); const { dearName, landlordFormalNames } = P.dearName ? P : P.default
const X: any = await import('../lib/letters/personalise.ts'); const { bodyFor, messageFor, fill, nameLeaks } = X.fill ? X : X.default
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const [{ data: people }, { data: props }] = await Promise.all([
  s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, joint_salutation, joint_first_name, joint_last_name').eq('role', 'landlord'),
  s.from('properties').select('landlord_id, is_demo'),
])
const live = new Set(((props ?? []) as any[]).filter(p => !p.is_demo && p.landlord_id).map(p => p.landlord_id))
const lls = ((people ?? []) as any[]).filter(p => live.has(p.id)).map(p => ({ name: p.company || landlordFormalNames(p), dear: dearName(p) || p.company || 'Sir or Madam', email: p.email }))

// the traps: drafted greetings, a greeting at the top of the body, {name}/{dear} fields, an email with no greeting
const subject = 'VAT on management fees from November 2026'
const body = 'Dear Sir or Madam,\n\nFrom 1 November 2026 our fees will include VAT.\n\nAs ever, {name}, thank you for your business.'
const emails = ['Dear Sir or Madam,\n\nPlease find our letter attached.', 'Dear Landlord,\n\nAttached.', 'Please find our letter attached.', '']
let bad = 0
for (const l of lls) {
  const b = bodyFor(body, l), subj = fill(subject, l)
  const problems: string[] = []
  if (/Sir or Madam|\{name\}|\{dear\}/.test(b + subj)) problems.push('generic/field left in letter')
  if (/^\s*Dear/i.test(b)) problems.push('second greeting at top of body')
  if (!b.includes(l.name)) problems.push('{name} not filled')
  for (const e of emails) {
    const m = messageFor(e, subject, l)
    if (!m.startsWith(`Dear ${l.dear},`)) problems.push(`email opens "${m.split('\n')[0]}"`)
    if (/Sir or Madam|Landlord,|\{name\}|\{dear\}/.test(m)) problems.push('generic left in email')
    for (const o of lls) if (o !== l && o.dear !== l.dear && m.includes(`Dear ${o.dear},`)) problems.push(`greets ${o.dear}`)
  }
  if (l.dear === 'Sir or Madam') problems.push('no name on file — greeting would be Sir or Madam')
  if (problems.length) bad++
  console.log(`${problems.length ? '✗' : '✓'} ${l.name} → letter "Dear ${l.dear}," · email "${messageFor(emails[0], subject, l).split('\n')[0]}"${problems.length ? '  !! ' + problems.join('; ') : ''}`)
}
// the guard: a landlord's name typed into the shared wording must be caught
const caught = nameLeaks('Dear Nigel, VAT is coming', lls)
console.log(caught.some(c => c.word === 'Nigel') ? '✓ a typed name ("Nigel") is caught and blocks sending' : '✗ typed name NOT caught')
const clean = nameLeaks(`${subject}\n${body}\nPlease find our letter attached.`, lls)
console.log(clean.length ? `✗ false alarm on: ${clean.map(c => c.word).join(', ')}` : '✓ the real wording raises no false alarm')
console.log(bad ? `${bad} PROBLEM(S)` : `ALL ${lls.length} COPIES PERSONALISED`)

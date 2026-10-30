// What to ask a landlord for when their AML checks didn't pass (30 Oct 2026, Harry: "automate emails to send back what
// we require if they did not pass AML e.g. request what is needed to pass"). The failed or unclear checks in the
// automated review (lib/landlordOnboarding/review) become plain requests — one per document per person.
// Never included: sanctions screening and PEP findings — telling someone they're being looked at for those can be
// "tipping off" (Proceeds of Crime Act 2002 s.333A; sanctions regulations). The office handles those alone.
import type { AutomatedReview, ReviewCheck } from '@/lib/landlordOnboarding/review'

export interface Request { key: string; text: string }

const ACCEPTED_ADDRESS = 'a utility bill, bank or building society statement, council tax bill or HMRC letter'
const OWNERSHIP = 'the Land Registry title, a mortgage statement or the completion statement'

const fullDate = (s: string) => {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/) ?? s.match(/(\d{2})[./](\d{2})[./](\d{4})/)
  if (!m) return s
  const iso = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(`${iso}T12:00:00Z`)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
const join = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

export function whatWeNeed(review: AutomatedReview | null | undefined, form: Record<string, unknown>): Request[] {
  if (!review) return []
  const str = (k: string) => (typeof form[k] === 'string' ? (form[k] as string).trim() : '')
  const joint = form.entity_type !== 'company' && form.joint === 'yes'
  const first = [str('salutation'), str('first_name'), str('last_name')].filter(Boolean).join(' ')
  const second = [str('j_salutation'), str('j_first_name'), str('j_last_name')].filter(Boolean).join(' ')
  // who a check is about, as the landlord would read it (older reviews say "First landlord")
  const person = (who: string) => who === 'First landlord' || who === 'Landlord' ? first : who === 'Second landlord' ? second : who
  const forWhom = (who: string) => (joint && who && who !== 'The directors' ? ` for ${who}` : '')

  type Bits = { missing?: boolean; unreadable?: boolean; wrongType?: boolean; notNamed?: boolean; old?: string; postcode?: { form: string; doc: string }; quality?: boolean; name?: boolean; dob?: boolean; expired?: boolean }
  const id = new Map<string, Bits>(), addr = new Map<string, Bits>(), other: Request[] = []
  const bits = (m: Map<string, Bits>, who: string) => m.get(who) ?? m.set(who, {}).get(who)!

  for (const c of review.checks as ReviewCheck[]) {
    if (c.status === 'pass') continue
    const i = c.label.indexOf(': ')
    const who = i > 0 ? person(c.label.slice(0, i)) : ''
    const what = i > 0 ? c.label.slice(i + 2) : c.label
    if (c.area === 'Identity') {
      const b = bits(id, who)
      if (what === 'photo ID') c.status === 'fail' ? (b.missing = true) : (b.unreadable = true)
      else if (what === 'photo ID type') b.wrongType = true
      else if (what === 'name on ID') b.name = true
      else if (what === 'date of birth') b.dob = true
      else if (what === 'ID in date' && c.status === 'fail') b.expired = true
      else if (/document quality|things to look at/.test(what)) b.quality = true
    } else if (c.area === 'Address') {
      const b = bits(addr, who)
      if (what === 'proof of address') c.status === 'fail' ? (b.missing = true) : (b.unreadable = true)
      else if (what === 'proof of address type') b.wrongType = true
      else if (what === 'postcode matches' && c.status === 'fail') b.postcode = { form: c.detail.match(/Form:\s*([^·]+)/)?.[1]?.trim() ?? '', doc: c.detail.match(/Document:\s*(.+)$/)?.[1]?.trim() ?? '' }
      else if (what === 'name on proof of address' && c.status === 'fail') b.notNamed = true
      else if (what === 'dated within 3 months' && c.status === 'fail') b.old = fullDate(c.detail)
      else if (/document quality|things to look at/.test(what) && !/3 months|dated|issue date/i.test(c.detail)) b.quality = true
    } else if (c.area === 'Ownership') {
      if (c.label === 'Proof of ownership' && c.status === 'fail') other.push({ key: 'own', text: `Proof that you own the property — ${OWNERSHIP}.` })
      else if (c.label === 'Owner named on document' && c.status === 'fail') other.push({ key: 'own-name', text: `Proof of ownership showing the owner’s name as it is on the form — ${OWNERSHIP}. If the property is owned by someone else or a company, tell us who.` })
      else if (c.label === 'Property postcode matches') other.push({ key: 'own-pc', text: 'Proof of ownership for the property you’re letting with us — the one sent appears to be for a different address.' })
      else if (/document quality|things to look at/i.test(c.label)) other.push({ key: 'own-q', text: /not a|doesn.t show|does not show|not .*title/i.test(c.detail) ? `Proof of ownership — the document sent doesn’t show who owns the property. Please send ${OWNERSHIP}.` : `A clearer copy of the proof of ownership — every page, readable.` })
    } else if (c.area === 'Source of funds') {
      if (/evidence/i.test(c.detail)) other.push({ key: 'sof', text: 'Something showing how the property was paid for — for example the mortgage offer, the completion statement, or a bank statement showing the funds.' })
      else if (c.detail === 'Not answered') other.push({ key: 'sof-q', text: 'How the property was paid for (mortgage, savings, inheritance and so on) — this question was left blank.' })
    } else if (c.area === 'Beneficial ownership') {
      if (c.label === 'Acting for another person' && c.status === 'fail') other.push({ key: 'bo', text: 'Photo ID and proof of address for the person or company you’re acting for, and how you’re connected.' })
      else if (c.detail === 'Not answered') other.push({ key: 'bo-q', text: 'Whether anyone else owns or benefits from the property — this question was left blank.' })
    }
    // Sanctions, PEP, geography and delivery channel: office only — never asked of the landlord
  }

  const out: Request[] = []
  for (const [who, b] of id) {
    const w = forWhom(who)
    if (b.missing) out.push({ key: `id:${who}`, text: `Photo ID${w}: a clear photo or scan of a passport or driving licence, with all four corners showing.` })
    else if (b.wrongType) out.push({ key: `id:${who}`, text: `Photo ID${w}: the upload doesn’t look like a passport or driving licence — please add one of those.` })
    else if (b.expired) out.push({ key: `id:${who}`, text: `An in-date passport or driving licence${w} — the one sent has expired.` })
    else if (b.unreadable || b.quality) out.push({ key: `id:${who}`, text: `A clearer copy of the photo ID${w} — a direct scan, or a photo of the original taken flat in good light with all four corners showing (not a screenshot or a photo of a screen).` })
    if (b.name) out.push({ key: `idn:${who}`, text: `Photo ID in the name given on the form${w} — or, if the name has changed, tell us and add the marriage certificate or deed poll.` })
    if (b.dob) out.push({ key: `idd:${who}`, text: `Please check the date of birth on the form${w} — it doesn’t match the photo ID.` })
  }
  for (const [who, b] of addr) {
    const w = forWhom(who)
    if (b.missing) { out.push({ key: `ad:${who}`, text: `Proof of home address${w}, dated within the last 3 months — ${ACCEPTED_ADDRESS}.` }); continue }
    const needs: string[] = []
    if (b.notNamed) needs.push(`in ${who ? `${who}’s` : 'your'} own name`)
    if (b.old) needs.push(`dated within the last 3 months (the one sent is dated ${b.old})`)
    if (b.postcode) needs.push(`for the home address on the form (${b.postcode.form}) — the one sent is for ${b.postcode.doc || 'a different postcode'}; if the form has a typo, just correct the address instead`)
    if (b.wrongType) needs.push(`one of: ${ACCEPTED_ADDRESS}`)
    if (needs.length) out.push({ key: `ad:${who}`, text: `A new proof of address${w} — it needs to be ${join(needs)}.` })
    else if (b.unreadable || b.quality) out.push({ key: `ad:${who}`, text: `A clearer copy of the proof of address${w} — the whole page, readable and dated.` })
  }
  // the wrong ownership document already covers "not named on it" — ask once
  if (other.some(r => r.key === 'own-q' && /doesn’t show/.test(r.text))) other.splice(0, other.length, ...other.filter(r => r.key !== 'own-name'))
  const seen = new Set(out.map(r => r.key))
  for (const r of other) if (!seen.has(r.key)) { seen.add(r.key); out.push(r) }
  return out
}

/**
 * Utility helpers for the `people` table.
 * All name display should go through these so first_name/last_name is consistent.
 *
 * Live DB column reality (confirmed 31 Aug 2026):
 *   - full_name  TEXT  — the original column (exists)
 *   - name       —     — does NOT exist in live DB
 *   - first_name TEXT  — added by migration 102
 *   - last_name  TEXT  — added by migration 102
 */

export const SALUTATIONS = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev', 'Mx'] as const
export type Salutation = typeof SALUTATIONS[number]

export interface PersonLike {
  salutation?: string | null
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  full_name?: string | null
  name?: string | null   // keep for TS compat with any stale types
  company?: string | null
  joint_salutation?: string | null
  joint_first_name?: string | null
  joint_last_name?: string | null
}

/** Full display name with the title — "Miss Donna Pious" (Harry, 13 Oct 2026: never a name without a salutation).
 *  Falls back to full_name. For a greeting use first_name; for matching bank payee names use nameNoTitle. */
export function displayName(person: PersonLike | null | undefined): string {
  if (!person) return '—'
  if (person.first_name) {
    return [person.salutation, person.first_name, person.last_name].filter(Boolean).join(' ')
  }
  return person.full_name || person.name || person.company || '—'
}

/** A landlord onboarding record's name with the title from their form — "Mr John Smith". */
export function onboardingName(row: { full_name?: string | null; form_data?: any } | null | undefined): string {
  const name = String(row?.full_name || '').trim()
  const title = row?.form_data?.salutation
  if (!name) return ''
  return title && !name.startsWith(title + ' ') ? `${title} ${name}` : name
}

/** First and last name without the title — only for matching names (bank payees, imports), never for display. */
export function nameNoTitle(person: PersonLike | null | undefined): string {
  if (!person) return ''
  return [person.first_name, person.last_name].filter(Boolean).join(' ') || person.full_name || ''
}

/** Full legal name — first, middle and surname (no title). E.g. "Oliver James Wells". */
export function legalName(person: PersonLike | null | undefined): string {
  if (!person) return '—'
  if (person.first_name) return [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' ')
  return displayName(person)
}

/** Formal name for letters and agreements — title, first, middle and surname. E.g. "Mr Oliver James Wells". */
export function formalName(person: PersonLike | null | undefined): string {
  if (!person) return '—'
  const base = legalName(person)
  if (!person.salutation || base === '—') return base
  return `${person.salutation} ${base}`
}

/**
 * Landlord / entity display name.
 * - Company only (e.g. ShivAgni Limited):        "ShivAgni Limited"
 * - Person + company (e.g. Richard Page of PPL): "Richard Page (Page Properties Ltd)"
 * - Person only:                                  "Christopher Gale"
 * Use this wherever a landlord or corporate entity is displayed.
 */
export function landlordName(person: PersonLike | null | undefined): string {
  if (!person) return '—'
  const primary = [person.salutation, person.first_name, person.last_name].filter(Boolean).join(' ')
    || person.full_name || person.name || ''
  const joint = [person.joint_salutation, person.joint_first_name, person.joint_last_name].filter(Boolean).join(' ')
  const personal = primary && joint ? `${primary} & ${joint}` : primary || joint
  if (person.company) {
    return personal ? `${personal} (${person.company})` : person.company
  }
  return personal || '—'
}

/** Formal names for documents, e.g. "Mr Harry Buchanan & Mr Adam Montague". */
export function landlordFormalNames(person: PersonLike | null | undefined): string {
  if (!person) return ''
  const primary = [person.salutation, person.first_name, person.last_name].filter(Boolean).join(' ')
    || person.full_name || ''
  const joint = person.joint_first_name
    ? [person.joint_salutation, person.joint_first_name, person.joint_last_name].filter(Boolean).join(' ')
    : ''
  const people = joint ? `${primary} & ${joint}` : primary
  // a landlord who owns through a company: "Mr Richard Page of Page Properties Ltd"
  if (person.company) return people ? `${people} of ${person.company}` : person.company
  return people
}

/** First name only — used in email greetings etc. */
export function firstName(person: PersonLike | null | undefined): string {
  if (!person) return 'there'
  if (person.first_name) return person.first_name
  const full = person.full_name || person.name || ''
  return full.split(' ')[0] || 'there'
}

/**
 * Converts a {first_name, last_name} pair into the fields to write to Supabase.
 * Writes both first_name/last_name (new) AND full_name (existing column) so
 * any code not yet updated still works.
 */
/** The name columns to save. Pass middle only from forms that ask for it (otherwise it's left as it is). */
export function nameFields(first: string, last: string, middle?: string | null) {
  const full = [first.trim(), (middle ?? '').trim(), last.trim()].filter(Boolean).join(' ')
  return {
    first_name: first.trim() || null,
    last_name:  last.trim()  || null,
    full_name:  full || null,
    ...(middle !== undefined ? { middle_name: (middle ?? '').trim() || null } : {}),
  }
}

// ── Greetings (15 Oct 2026, Harry: Richard Page's certificate email said "Dear Page" — "make sure it never happens
// again anywhere"). Every email and letter takes its greeting from here:
//   dearName — formal ("Dear …"): title + surname ("Mr Page"); joint owners "Mr Smith and Mrs Smith"; a company with no
//              person, or a record whose "name" is a company ("Page" "Properties"), "Sir or Madam". Never a lone first name.
//   hiName   — friendly ("Hi …", tenants, applicants, contractors): the first name — unless the record is a company.
const ENTITY_WORD = /\b(ltd|limited|llp|plc|inc|properties|property|lettings|letting|estates?|holdings?|group|investments?|services|homes|developments?|management|partners|partnership|trust|ventures|capital|assets|realty|company|co)\b\.?/i

/** A record whose "name" is really a business — company only, or a company typed into the name boxes. */
export function looksLikeEntity(p: PersonLike | null | undefined): boolean {
  if (!p) return false
  const first = String(p.first_name ?? '').trim(), last = String(p.last_name ?? '').trim()
  if (!first && !last) return !!p.company || ENTITY_WORD.test(String(p.full_name ?? p.name ?? ''))
  if (ENTITY_WORD.test(first) || ENTITY_WORD.test(last)) return true
  const company = String(p.company ?? '').trim().toLowerCase()
  return !!company && company.startsWith(`${first} ${last}`.trim().toLowerCase()) && !p.salutation
}

function formalOne(salutation?: string | null, first?: string | null, last?: string | null): string {
  const s = String(salutation ?? '').trim(), f = String(first ?? '').trim(), l = String(last ?? '').trim()
  if (s && l) return `${s} ${l}`
  return [s, f, l].filter(Boolean).join(' ')   // no title on file: the whole name, never just a first name
}

/** The name after "Dear" — "Mr Page", "Mr Smith and Mrs Smith", or "Sir or Madam". */
export function dearName(p: PersonLike | null | undefined): string {
  if (!p || looksLikeEntity(p)) return 'Sir or Madam'
  const primary = formalOne(p.salutation, p.first_name, p.last_name) || (ENTITY_WORD.test(String(p.full_name ?? '')) ? '' : String(p.full_name ?? '').trim())
  const joint = formalOne(p.joint_salutation, p.joint_first_name, p.joint_last_name)
  if (!primary) return joint || 'Sir or Madam'
  return joint ? `${primary} and ${joint}` : primary
}

/** "Dear Mr Page," — the whole opening line. */
export const dearLine = (p: PersonLike | null | undefined) => `Dear ${dearName(p)},`

/** The name after "Hi" — the first name for a person, the formal name for a business record. */
export function hiName(p: PersonLike | null | undefined): string {
  if (!p || ![p.first_name, p.last_name, p.full_name, p.name, p.company].some(v => String(v ?? '').trim())) return 'there'
  if (looksLikeEntity(p)) return dearName(p)
  const f = String(p.first_name ?? '').trim()
  return f || dearName(p)
}

/** From a typed full name and a title (forms, applicants, onboarding rows): "Ms" + "Joanna Rosen" → "Ms Rosen". */
export function dearFromFull(salutation: string | null | undefined, fullName: string | null | undefined): string {
  const name = String(fullName ?? '').trim().replace(/^(mr|mrs|ms|miss|mx|dr|prof|rev)\.?\s+/i, '')
  if (!name || ENTITY_WORD.test(name)) return 'Sir or Madam'
  const parts = name.split(/\s+/)
  return dearName({ salutation: salutation || null, first_name: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0], last_name: parts.length > 1 ? parts[parts.length - 1] : null })
}

/** From a name as text that may start with a title ("Mr Richard Page" → "Mr Page"); a business → "Sir or Madam";
 *  no title → the whole name, never a lone first name. For emails that only have the name as a string. */
export function dearFromText(text: string | null | undefined): string {
  const t = String(text ?? '').trim().replace(/\s*&\s*$/, '')
  if (!t || ENTITY_WORD.test(t)) return 'Sir or Madam'
  const joint = t.split(/\s+(?:&|and)\s+/i)
  if (joint.length === 2) return `${dearFromText(joint[0])} and ${dearFromText(joint[1])}`
  const parts = t.split(/\s+/)
  const title = parts[0].replace(/\.$/, '')
  if (/^(mr|mrs|ms|miss|mx|dr|prof|rev)$/i.test(title) && parts.length >= 2) return `${title.charAt(0).toUpperCase()}${title.slice(1).toLowerCase()} ${parts[parts.length - 1]}`
  return t
}

/** A person from a name typed as text ("Mr John Smith", "John Smith", "Page Properties Ltd") — for greetings when there's
 *  no people record (let-only contacts, typed contractor or cleaner names, viewing visitors). */
export function personFromText(text: string | null | undefined): PersonLike {
  const t = String(text ?? '').trim()
  if (!t || ENTITY_WORD.test(t)) return { full_name: t || null, company: t || null }
  const parts = t.split(/\s+/)
  const title = /^(mr|mrs|ms|miss|mx|dr|prof|rev)\.?$/i.test(parts[0]) ? parts.shift()!.replace(/\.$/, '') : null
  return {
    salutation: title ? title.charAt(0).toUpperCase() + title.slice(1).toLowerCase() : null,
    first_name: parts.length ? parts[0] : null,
    last_name: parts.length > 1 ? parts[parts.length - 1] : null,
    full_name: t,
  }
}

/** Two letters for an avatar — first name and surname, never the title ("Mr Joseph Edwards" → "JE"); a business →
 *  its first two words ("Page Properties Ltd" → "PP"). The one rule for every avatar (16 Oct 2026). */
export function initials(p: PersonLike | string | null | undefined): string {
  const text = typeof p === 'string' ? p
    : !p ? '' : [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.name || p.company || ''
  const words = String(text).replace(/^(mr|mrs|ms|miss|mx|dr|prof|rev)\.?\s+/i, '').replace(/\b(ltd|limited|llp|plc)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  // a person record: first name + the start of the surname ("Diafuku Nsombi" → D)
  const pick = typeof p !== 'string' && p && p.first_name && p.last_name ? [String(p.first_name).trim(), String(p.last_name).trim()] : words.slice(0, 2)
  return pick.map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

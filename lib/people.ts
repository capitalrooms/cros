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

interface PersonLike {
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

/** Full display name (no salutation) — prefers first+last, falls back to full_name. */
export function displayName(person: PersonLike | null | undefined): string {
  if (!person) return '—'
  if (person.first_name) {
    return [person.first_name, person.last_name].filter(Boolean).join(' ')
  }
  return person.full_name || person.name || person.company || '—'
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
  const primary = [person.first_name, person.last_name].filter(Boolean).join(' ')
    || person.full_name || person.name || ''
  const joint = [person.joint_first_name, person.joint_last_name].filter(Boolean).join(' ')
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

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
  last_name?: string | null
  full_name?: string | null
  name?: string | null   // keep for TS compat with any stale types
  company?: string | null
}

/** Full display name (no salutation) — prefers first+last, falls back to full_name. */
export function displayName(person: PersonLike | null | undefined): string {
  if (!person) return '—'
  if (person.first_name) {
    return [person.first_name, person.last_name].filter(Boolean).join(' ')
  }
  return person.full_name || person.name || person.company || '—'
}

/** Formal display name — includes salutation if present. E.g. "Mr Oliver Wells". */
export function formalName(person: PersonLike | null | undefined): string {
  if (!person) return '—'
  const base = displayName(person)
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
  const personal = [person.first_name, person.last_name].filter(Boolean).join(' ')
    || person.full_name || person.name || ''
  if (person.company) {
    return personal ? `${personal} (${person.company})` : person.company
  }
  return personal || '—'
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
export function nameFields(first: string, last: string) {
  const full = [first.trim(), last.trim()].filter(Boolean).join(' ')
  return {
    first_name: first.trim() || null,
    last_name:  last.trim()  || null,
    full_name:  full || null,
  }
}

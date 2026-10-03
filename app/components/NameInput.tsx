'use client'

/**
 * NameInput — standard name capture component used across the entire app.
 *
 * Renders title (salutation) + first name + (optional) middle name(s) + surname — the standard for every
 * person CROS records. Pass withMiddle for tenants and applicants (their full legal name goes on agreements).
 *
 * Usage:
 *   <NameInput value={name} onChange={setName} required />
 *
 * Use toFullName(v) to get a display string like "Mr James Smith".
 * Use toDisplayName(v) to get "James Smith" (no salutation).
 */

export interface NameValue {
  salutation: string
  first_name: string
  middle_name?: string
  last_name:  string
}

export function emptyName(): NameValue {
  return { salutation: '', first_name: '', middle_name: '', last_name: '' }
}

/** "Mr James Robert Smith" */
export function toFullName(n: NameValue | null | undefined): string {
  if (!n) return ''
  return [n.salutation, n.first_name, n.middle_name, n.last_name].map(x => x?.trim()).filter(Boolean).join(' ')
}

/** "James Robert Smith" (no title) — what full_name holds */
export function toLegalName(n: NameValue | null | undefined): string {
  if (!n) return ''
  return [n.first_name, n.middle_name, n.last_name].map(x => x?.trim()).filter(Boolean).join(' ')
}

/** "James Smith" (no salutation) */
export function toDisplayName(n: NameValue | null | undefined): string {
  if (!n) return ''
  return [n.first_name, n.last_name].filter(Boolean).join(' ')
}

/**
 * Parse a legacy full_name string (e.g. "Mr James Smith") into NameValue.
 * Recognises common salutations as the first token.
 */
const SALUTATIONS = new Set(['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev', 'Sir', 'Lord', 'Lady'])

export function parseFullName(raw: string | null | undefined): NameValue {
  if (!raw?.trim()) return emptyName()
  const parts = raw.trim().split(/\s+/)
  if (parts.length === 0) return emptyName()
  if (SALUTATIONS.has(parts[0])) {
    const salutation = parts[0]
    const first_name = parts[1] ?? ''
    const last_name  = parts.slice(2).join(' ')
    return { salutation, first_name, last_name }
  }
  return { salutation: '', first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

const SALUTATION_OPTIONS = ['Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Dr', 'Prof', 'Rev']

interface Props {
  value:       NameValue
  onChange:    (n: NameValue) => void
  required?:   boolean
  className?:  string
  inputClass?: string
  labelClass?: string
  /** Show a heading above the fields */
  label?:      string
  /** Show the middle name(s) box — tenants and applicants */
  withMiddle?: boolean
  /** Make the title required too */
  titleRequired?: boolean
}

export default function NameInput({
  value,
  onChange,
  required   = false,
  className  = '',
  inputClass = 'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900',
  labelClass = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1',
  label,
  withMiddle = false,
  titleRequired = false,
}: Props) {
  function set(field: keyof NameValue, val: string) {
    onChange({ ...value, [field]: val })
  }

  const req = required ? ' *' : ''

  return (
    <div className={className}>
      {label && <p className="text-sm font-bold text-neutral-700 mb-3">{label}</p>}
      <div className={`grid grid-cols-1 gap-3 ${withMiddle ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <div>
          <label className={labelClass}>Title{titleRequired ? ' *' : ''}</label>
          <select value={value.salutation} onChange={e => set('salutation', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {SALUTATION_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>First name{req}</label>
          <input
            value={value.first_name}
            onChange={e => set('first_name', e.target.value)}
            className={inputClass}
            placeholder="e.g. James"
          />
        </div>
        {withMiddle && (
          <div>
            <label className={labelClass}>Middle name(s)</label>
            <input
              value={value.middle_name ?? ''}
              onChange={e => set('middle_name', e.target.value)}
              className={inputClass}
              placeholder="If any"
            />
          </div>
        )}
        <div>
          <label className={labelClass}>Surname{req}</label>
          <input
            value={value.last_name}
            onChange={e => set('last_name', e.target.value)}
            className={inputClass}
            placeholder="e.g. Smith"
          />
        </div>
      </div>
    </div>
  )
}

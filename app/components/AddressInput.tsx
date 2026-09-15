'use client'

/**
 * AddressInput — standard UK address capture component.
 *
 * Shows a postcode search that auto-fills individual fields,
 * then separate editable fields for Line 1, Line 2, Town, County, Postcode.
 *
 * Usage:
 *   <AddressInput value={addr} onChange={setAddr} label="Property address" />
 *
 * `value` and `onChange` use the structured AddressValue type.
 * Use `toAddressString(v)` to get a display string.
 * Use `toAddressLines(v)` to get an array of non-empty lines.
 */

import { useState, useEffect, useRef } from 'react'

export interface AddressValue {
  line1:    string
  line2:    string
  town:     string
  county:   string
  postcode: string
}

export function emptyAddress(): AddressValue {
  return { line1: '', line2: '', town: '', county: '', postcode: '' }
}

/** Full address as newline-separated string (for DB storage, display) */
export function toAddressString(a: AddressValue | null | undefined): string {
  if (!a) return ''
  return [a.line1, a.line2, a.town, a.county, a.postcode]
    .map(s => s?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
}

/** Full address as array of non-empty lines */
export function toAddressLines(a: AddressValue | null | undefined): string[] {
  if (!a) return []
  return [a.line1, a.line2, a.town, a.county, a.postcode]
    .map(s => s?.trim() ?? '')
    .filter(Boolean)
}

/** Parse a legacy comma- or newline-separated address string into AddressValue */
export function parseAddressString(raw: string | null | undefined): AddressValue {
  if (!raw?.trim()) return emptyAddress()
  const parts = raw.includes('\n')
    ? raw.split('\n').map(s => s.trim()).filter(Boolean)
    : raw.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return emptyAddress()
  const postcode = parts.at(-1) ?? ''
  const town     = parts.at(-2) ?? ''
  const line2    = parts.length >= 4 ? (parts.at(-3) ?? '') : ''
  const line1    = parts.length >= 4
    ? parts.slice(0, -3).join(', ')
    : (parts.length >= 3 ? (parts.at(0) ?? '') : (parts.at(0) ?? ''))
  return { line1, line2, town, county: '', postcode }
}

interface Props {
  value:      AddressValue
  onChange:   (a: AddressValue) => void
  label?:     string
  required?:  boolean
  className?: string
  inputClass?: string
  labelClass?: string
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

export default function AddressInput({
  value,
  onChange,
  label      = 'Address',
  required   = false,
  className  = '',
  inputClass = 'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900',
  labelClass = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1',
}: Props) {
  const [query,      setQuery]      = useState('')
  const [searching,  setSearching]  = useState(false)
  const [addresses,  setAddresses]  = useState<string[]>([])
  const [showDrop,   setShowDrop]   = useState(false)
  const [searchErr,  setSearchErr]  = useState('')
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef   = useRef<HTMLDivElement>(null)

  function set(field: keyof AddressValue, val: string) {
    onChange({ ...value, [field]: val })
  }

  // Live autocomplete — fires 350 ms after the user stops typing (≥ 3 chars)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 3) { setAddresses([]); setShowDrop(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchErr('')
      try {
        const res  = await fetch(`/api/admin/postcode-lookup?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (data.mode === 'full' && data.addresses?.length) {
          setAddresses(data.addresses)
          setShowDrop(true)
        } else if (data.mode === 'partial') {
          // Postcode matched but no individual addresses — fill town
          onChange({ ...value, town: data.town ?? '', postcode: (data.postcode ?? q).toUpperCase() })
          setSearchErr('No individual addresses found — town auto-filled. Edit the fields below.')
          setShowDrop(false)
        } else {
          setAddresses([])
          setShowDrop(false)
        }
      } catch {
        setSearchErr('Lookup failed. Please enter the address manually.')
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleSelect(raw: string) {
    setShowDrop(false)
    setQuery('')
    // Parse the comma-separated address from the API
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
    const postcode = parts.at(-1) ?? ''
    const town     = parts.at(-2) ?? ''
    const line2    = parts.length >= 4 ? (parts.at(-3) ?? '') : ''
    const line1    = parts.length >= 4
      ? parts.slice(0, -3).join(', ')
      : (parts.at(0) ?? '')
    onChange({
      line1:    titleCase(line1),
      line2:    titleCase(line2),
      town:     titleCase(town),
      county:   value.county,
      postcode: postcode.toUpperCase(),
    })
  }

  const req = required ? ' *' : ''

  return (
    <div className={`space-y-3 ${className}`} ref={wrapperRef}>
      {label && (
        <p className="text-sm font-bold text-neutral-700">{label}{req}</p>
      )}

      {/* Live address search */}
      <div className="relative">
        <div className="relative flex items-center">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setShowDrop(false)}
            placeholder="Start typing an address or postcode…"
            autoComplete="off"
            className={`${inputClass} pr-8`}
          />
          {searching && (
            <span className="absolute right-3 text-neutral-400 text-xs">⟳</span>
          )}
        </div>
      </div>

      {searchErr && (
        <p className="text-xs text-neutral-500">{searchErr}</p>
      )}

      {/* Live autocomplete dropdown */}
      {showDrop && addresses.length > 0 && (
        <div className="relative z-50">
          <div className="absolute top-0 left-0 right-0 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
            {addresses.map((addr, i) => {
              const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
              const main  = parts.slice(0, -2).join(', ')
              const sub   = parts.slice(-2).join(', ')
              return (
                <button
                  key={i}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleSelect(addr) }}
                  className="w-full text-left px-3 py-2.5 text-sm text-neutral-800 hover:bg-neutral-50 transition border-b border-neutral-100 last:border-0 flex items-start gap-2"
                >
                  <span className="mt-0.5 text-neutral-300 shrink-0">📍</span>
                  <span>
                    <span className="font-medium text-neutral-900">{main || parts[0]}</span>
                    {sub && <span className="block text-xs text-neutral-400 mt-0.5">{sub}</span>}
                  </span>
                </button>
              )
            })}
            <p className="px-3 py-2 text-xs text-neutral-400 italic border-t border-neutral-100">
              Not listed? Fill in the fields below manually.
            </p>
          </div>
        </div>
      )}

      {/* Individual address fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={labelClass}>Address line 1{required ? ' *' : ''}</label>
          <input value={value.line1} onChange={e => set('line1', e.target.value)} className={inputClass} placeholder="e.g. 4 Willis Road" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Address line 2</label>
          <input value={value.line2} onChange={e => set('line2', e.target.value)} className={inputClass} placeholder="Flat, building, estate (optional)" />
        </div>
        <div>
          <label className={labelClass}>Town / City{required ? ' *' : ''}</label>
          <input value={value.town} onChange={e => set('town', e.target.value)} className={inputClass} placeholder="e.g. London" />
        </div>
        <div>
          <label className={labelClass}>County</label>
          <input value={value.county} onChange={e => set('county', e.target.value)} className={inputClass} placeholder="e.g. Greater London" />
        </div>
        <div>
          <label className={labelClass}>Postcode{required ? ' *' : ''}</label>
          <input
            value={value.postcode}
            onChange={e => set('postcode', e.target.value.toUpperCase())}
            className={inputClass + ' font-mono'}
            placeholder="e.g. E15 3HH"
            maxLength={8}
          />
        </div>
      </div>
    </div>
  )
}

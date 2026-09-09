'use client'

/**
 * PostcodeAddressLookup — reusable UK address lookup widget.
 *
 * Usage:
 *   <PostcodeAddressLookup
 *     onSelect={(address) => setAddress(address)}
 *     label="Property address"          // optional, defaults to "Address"
 *     placeholder="Start with postcode…"
 *   />
 *
 * Modes (set automatically by what's configured on the server):
 *   full    — OS Places API key set → shows dropdown of all addresses at postcode
 *   partial — fallback (postcodes.io) → auto-fills town/county; user types street
 *
 * The parent receives a plain address string on selection.
 * If you need individual fields (line1, town, postcode) use onSelectParsed instead.
 */

import { useState, useRef, useEffect } from 'react'

export interface ParsedAddress {
  line1:    string   // e.g. "10 Downing Street"
  town:     string   // e.g. "London"
  county:   string   // e.g. "Greater London" (may be empty)
  postcode: string   // e.g. "SW1A 2AA"
  full:     string   // full comma-joined string
}

interface Props {
  onSelect?:       (address: string) => void
  onSelectParsed?: (a: ParsedAddress) => void
  label?:          string
  placeholder?:    string
  initialValue?:   string
  className?:      string
}

function parseAddress(raw: string): ParsedAddress {
  // Raw addresses come back as "BUILDING, STREET, TOWN, POSTCODE"
  // or "BUILDING NUMBER STREET, TOWN, POSTCODE" — normalise to Title Case
  const title = (s: string) =>
    s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
  const postcode = parts.at(-1) ?? ''
  const town     = parts.at(-2) ?? ''
  const line1    = parts.slice(0, -2).join(', ')
  return {
    line1:    title(line1),
    town:     title(town),
    county:   '',
    postcode,
    full:     [title(line1), title(town), postcode].filter(Boolean).join(', '),
  }
}

export default function PostcodeAddressLookup({
  onSelect,
  onSelectParsed,
  label       = 'Address',
  placeholder = 'Enter postcode to search…',
  initialValue = '',
  className   = '',
}: Props) {
  const [postcode,   setPostcode]   = useState('')
  const [searching,  setSearching]  = useState(false)
  const [mode,       setMode]       = useState<'idle' | 'full' | 'partial' | 'error'>('idle')
  const [addresses,  setAddresses]  = useState<string[]>([])
  const [town,       setTown]       = useState('')
  const [county,     setCounty]     = useState('')
  const [foundPC,    setFoundPC]    = useState('')   // postcode returned by API
  const [open,       setOpen]       = useState(false)
  const [manualValue, setManualValue] = useState(initialValue)
  const [showManual, setShowManual] = useState(!!initialValue)
  const dropRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSearch() {
    if (!postcode.trim()) return
    setSearching(true)
    setMode('idle')
    setAddresses([])
    setOpen(false)

    try {
      const res  = await fetch(`/api/admin/postcode-lookup?postcode=${encodeURIComponent(postcode.trim())}`)
      const data = await res.json()

      if (!res.ok) {
        setMode('error')
        return
      }

      setFoundPC(data.postcode ?? postcode.toUpperCase())

      if (data.mode === 'full' && data.addresses?.length) {
        setAddresses(data.addresses)
        setMode('full')
        setOpen(true)
      } else {
        // Partial mode — auto-fill town/county
        setTown(data.town ?? '')
        setCounty(data.county ?? '')
        setMode('partial')
        setShowManual(true)
      }
    } catch {
      setMode('error')
    } finally {
      setSearching(false)
    }
  }

  function handleSelect(raw: string) {
    setOpen(false)
    const parsed = parseAddress(raw)
    setManualValue(parsed.full)
    setShowManual(true)
    onSelect?.(parsed.full)
    onSelectParsed?.(parsed)
  }

  function handleManualChange(val: string) {
    setManualValue(val)
    onSelect?.(val)
  }

  function handleManualBlur() {
    if (manualValue.trim()) {
      onSelect?.(manualValue.trim())
    }
  }

  const inp = 'rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'

  return (
    <div className={`space-y-sm ${className}`}>
      {/* ── Label ──────────────────────────────────────────────────────────── */}
      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide">
        {label}
      </label>

      {/* ── Postcode search row ─────────────────────────────────────────────── */}
      <div className="flex gap-sm">
        <input
          value={postcode}
          onChange={e => setPostcode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Postcode  e.g. EC2A 4NA"
          className={`${inp} w-40 font-mono`}
          maxLength={8}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !postcode.trim()}
          className="rounded-xl bg-neutral-900 text-white px-md py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 whitespace-nowrap"
        >
          {searching ? 'Searching…' : 'Find address'}
        </button>
        {(showManual || mode !== 'idle') && (
          <button
            type="button"
            onClick={() => {
              setShowManual(true)
              setMode('idle')
              setOpen(false)
              setManualValue('')
              onSelect?.('')
            }}
            className="text-xs text-neutral-400 hover:text-neutral-700 transition underline whitespace-nowrap self-center"
          >
            Enter manually
          </button>
        )}
      </div>

      {/* ── Status messages ─────────────────────────────────────────────────── */}
      {mode === 'error' && (
        <p className="text-xs text-red-600">
          Postcode not found. Check the postcode or enter the address manually below.
        </p>
      )}
      {mode === 'partial' && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-sm py-xs">
          ℹ️ Address lookup not fully configured — town auto-filled from postcode. Enter the street address below.
          {' '}<a href="https://osdatahub.os.uk/" target="_blank" rel="noreferrer" className="underline font-semibold">Add a free OS DataHub key</a> for full dropdown lookup.
        </p>
      )}

      {/* ── Full address dropdown ────────────────────────────────────────────── */}
      {mode === 'full' && open && addresses.length > 0 && (
        <div ref={dropRef} className="relative z-50">
          <div className="absolute top-0 left-0 right-0 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
            <p className="text-xs text-neutral-400 px-md py-xs border-b border-neutral-100">
              {addresses.length} address{addresses.length !== 1 ? 'es' : ''} found for {foundPC}
            </p>
            {addresses.map((addr, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(addr)}
                className="w-full text-left px-md py-sm text-sm text-neutral-800 hover:bg-neutral-50 transition border-b border-neutral-50 last:border-0"
              >
                {addr.split(',').map((p, j) => p.trim()).filter(Boolean).join(', ')}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setOpen(false); setShowManual(true) }}
              className="w-full text-left px-md py-sm text-xs text-neutral-400 hover:text-neutral-700 transition italic"
            >
              Not listed? Enter manually…
            </button>
          </div>
        </div>
      )}

      {/* ── Partial mode: auto-filled town hint ─────────────────────────────── */}
      {mode === 'partial' && (town || county) && (
        <div className="flex gap-sm text-xs text-neutral-500">
          {town   && <span className="bg-neutral-100 rounded px-sm py-xs">Town: <strong>{town}</strong></span>}
          {county && <span className="bg-neutral-100 rounded px-sm py-xs">County: <strong>{county}</strong></span>}
        </div>
      )}

      {/* ── Manual / confirmed address text area ────────────────────────────── */}
      {showManual && (
        <div>
          <textarea
            value={manualValue}
            onChange={e => handleManualChange(e.target.value)}
            onBlur={handleManualBlur}
            rows={3}
            placeholder={placeholder}
            className={`${inp} w-full`}
          />
          {mode === 'partial' && (
            <p className="text-xs text-neutral-400 mt-xs">
              Include house number, street, {town ? `${town}, ` : ''}{foundPC}
            </p>
          )}
        </div>
      )}

      {/* ── Show dropdown again if it was closed ────────────────────────────── */}
      {mode === 'full' && !open && addresses.length > 0 && !showManual && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-neutral-500 hover:text-neutral-900 underline"
        >
          Show {addresses.length} addresses again
        </button>
      )}
    </div>
  )
}

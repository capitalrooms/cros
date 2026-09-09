'use client'

/**
 * PostcodeLookupWidget — shared postcode/address lookup component.
 *
 * Used in:
 *   • app/admin/properties/new/page.tsx  (autoLookup mode — fires on typing)
 *   • app/admin/properties/audit/page.tsx (button mode — admin clicks "Look up")
 *
 * Wraps:
 *   • An address text input
 *   • The /api/lookup/council-info call
 *   • CouncilInfoModal (field-by-field accept/reject)
 *
 * The parent keeps the address string in its own state and passes it down via
 * `value` + `onChange`.  When the admin accepts lookup results in the modal,
 * `onResult` fires with the kept fields plus lat/lng from the raw response.
 */

import { useState } from 'react'
import CouncilInfoModal from '@/app/admin/properties/new/components/CouncilInfoModal'

export interface PostcodeLookupResult {
  postcode?:          string  | null
  council_name?:      string  | null
  council_email?:     string  | null
  council_phone?:     string  | null
  council_website?:   string  | null
  bin_collection_day?: string | null
  council_tax_band?:  string  | null
  lat?:               number  | null   // from API latitude
  lng?:               number  | null   // from API longitude
}

interface Props {
  value:           string
  onChange:        (v: string) => void
  onResult?:       (data: PostcodeLookupResult) => void
  /** Fire the lookup automatically when `value` exceeds 10 chars (new-property mode) */
  autoLookup?:     boolean
  placeholder?:    string
  /** Extra className forwarded to the <input> element */
  inputClassName?: string
  /** Extra className forwarded to the "Look up" button (button mode only) */
  buttonClassName?: string
}

export default function PostcodeLookupWidget({
  value,
  onChange,
  onResult,
  autoLookup      = false,
  placeholder     = 'Full property address with postcode…',
  inputClassName  = '',
  buttonClassName = '',
}: Props) {
  const [loading,     setLoading]     = useState(false)
  const [pendingInfo, setPendingInfo] = useState<any>(null)
  const [rawFull,     setRawFull]     = useState<any>(null)   // full API response kept for lat/lng
  const [showModal,   setShowModal]   = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  async function doLookup(addr: string) {
    if (!addr.trim()) return
    setLoading(true)
    setLookupError(null)
    try {
      const res = await fetch('/api/lookup/council-info', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address: addr }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setLookupError(d.error || 'Lookup failed — check the postcode and try again.')
        return
      }
      const d = await res.json()
      setRawFull(d.data)
      setPendingInfo(d.data)
      setShowModal(true)
    } catch {
      setLookupError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    onChange(v)
    if (autoLookup && v.length > 10) doLookup(v)
  }

  function handleAccept(keptFields: Record<string, any>) {
    setShowModal(false)
    setPendingInfo(null)
    // Merge the admin-selected fields with lat/lng from the raw full response
    // (lat/lng aren't shown in CouncilInfoModal but are useful for the DB)
    onResult?.({
      ...keptFields,
      lat: rawFull?.latitude  ?? null,
      lng: rawFull?.longitude ?? null,
    } as PostcodeLookupResult)
  }

  function handleReject() {
    setShowModal(false)
    setPendingInfo(null)
  }

  const defaultInput = [
    'w-full rounded-xl border border-neutral-200 bg-white px-md py-sm',
    'text-sm text-neutral-900 placeholder:text-neutral-400',
    'focus:outline-none focus:ring-2 focus:ring-blue-300',
  ].join(' ')

  const defaultButton = [
    'shrink-0 rounded-xl border border-neutral-300 bg-white px-md py-sm',
    'text-sm font-medium text-neutral-700 hover:bg-neutral-50',
    'disabled:opacity-40 whitespace-nowrap',
  ].join(' ')

  return (
    <div className="space-y-xs">
      <div className="flex gap-sm">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={inputClassName || defaultInput}
        />
        {!autoLookup && (
          <button
            type="button"
            onClick={() => doLookup(value)}
            disabled={loading || !value.trim()}
            className={buttonClassName || defaultButton}
          >
            {loading ? 'Looking up…' : '🔍 Look up'}
          </button>
        )}
      </div>

      {lookupError && (
        <p className="text-xs text-red-600">{lookupError}</p>
      )}

      {/* CouncilInfoModal is rendered as an overlay when data is ready */}
      {showModal && pendingInfo && (
        <CouncilInfoModal
          councilInfo={pendingInfo}
          onAccept={handleAccept}
          onReject={handleReject}
          loading={false}
        />
      )}
    </div>
  )
}

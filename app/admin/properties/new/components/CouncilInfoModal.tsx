'use client'

import { useEffect, useState } from 'react'

interface CouncilInfoModalProps {
  councilInfo: any
  onAccept: (data: any) => void
  onReject: () => void
  loading?: boolean
}

// Friendly labels for the fields the lookup can return, in display order.
const FIELDS: Array<{ key: string; label: string; mono?: boolean }> = [
  { key: 'council_name', label: 'Council' },
  { key: 'postcode', label: 'Postcode', mono: true },
  { key: 'council_tax_band', label: 'Council tax band' },
  { key: 'council_phone', label: 'Phone' },
  { key: 'council_email', label: 'Email' },
  { key: 'council_website', label: 'Website' },
  { key: 'bin_collection_day', label: 'Bin collection' },
]

/**
 * Reviews what the address lookup found and lets the admin keep or discard each
 * field individually — e.g. take the council tax band but leave out the bin day —
 * rather than accepting or rejecting the whole lot (25 Aug notes #7).
 */
export default function CouncilInfoModal({
  councilInfo,
  onAccept,
  onReject,
  loading = false,
}: CouncilInfoModalProps) {
  // Only the fields that actually came back with a value are reviewable.
  const present = FIELDS.filter((f) => councilInfo && councilInfo[f.key])
  const [keep, setKeep] = useState<Record<string, boolean>>({})

  // Default every found field to "keep" whenever a new lookup arrives.
  useEffect(() => {
    if (!councilInfo) return
    const init: Record<string, boolean> = {}
    for (const f of present) init[f.key] = true
    setKeep(init)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [councilInfo])

  if (!councilInfo || loading) return null

  const keptCount = present.filter((f) => keep[f.key]).length

  function applySelected() {
    // Pass on only the fields the admin chose to keep.
    const filtered: Record<string, any> = {}
    for (const f of present) if (keep[f.key]) filtered[f.key] = councilInfo[f.key]
    onAccept(filtered)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
      <div className="bg-white rounded-lg max-w-lg w-full p-lg">
        <h2 className="text-lg font-bold text-neutral-900 mb-xs">📍 Here&apos;s what we found</h2>
        <p className="text-sm text-neutral-600 mb-md">
          Tick the details you want to keep — untick anything that looks wrong or you&apos;d rather leave out.
        </p>

        {present.length === 0 ? (
          <div className="mb-lg rounded-lg border border-neutral-200 bg-neutral-50 p-md text-sm text-neutral-500">
            Nothing usable came back for this address.
          </div>
        ) : (
          <div className="space-y-sm mb-lg">
            {present.map((f) => (
              <label
                key={f.key}
                className={`flex cursor-pointer items-start gap-md rounded-lg border p-md transition ${
                  keep[f.key] ? 'border-green-300 bg-green-50' : 'border-neutral-200 bg-neutral-50 opacity-70'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!keep[f.key]}
                  onChange={(e) => setKeep((k) => ({ ...k, [f.key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600">{f.label}</p>
                  <p className={`text-sm text-neutral-900 break-words ${f.mono ? 'font-mono' : ''}`}>
                    {councilInfo[f.key]}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-md">
          <button
            onClick={() => onReject()}
            className="flex-1 px-lg py-sm bg-neutral-200 text-neutral-900 rounded font-semibold text-sm hover:bg-neutral-300 transition"
          >
            Discard all
          </button>
          <button
            onClick={applySelected}
            disabled={keptCount === 0}
            className="flex-1 px-lg py-sm bg-green-600 text-white rounded font-semibold text-sm hover:bg-green-700 transition disabled:opacity-50"
          >
            {keptCount === present.length ? 'Keep all' : `Keep ${keptCount} selected`}
          </button>
        </div>

        <p className="text-xs text-neutral-500 mt-md text-center">
          You can edit any of this later on the property detail page.
        </p>
      </div>
    </div>
  )
}

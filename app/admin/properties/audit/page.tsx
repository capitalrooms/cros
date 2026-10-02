'use client'

// /admin/properties/audit
// Address & postcode audit checklist.
//
// For each property, shows the current stored address alongside the shared
// PostcodeLookupWidget (the same tool used in the new-property setup flow).
// Admin can edit the address, trigger a postcode lookup, accept any returned
// council info, then confirm — which stamps postcode_confirmed_at/by on the
// property and saves any corrected address or council data.
//
// Properties are ordered: unconfirmed first, then confirmed, both sorted
// alphabetically within each group.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import PostcodeLookupWidget, { PostcodeLookupResult } from '@/components/admin/PostcodeLookupWidget'

interface PropertyRow {
  id:                     string
  name:                   string
  address:                string | null
  council_name:           string | null
  lat:                    number | null
  lng:                    number | null
  postcode_confirmed_at:  string | null
  postcode_confirmed_by:  string | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/** Extract postcode from a full address string, e.g. "E15 3HH" */
function extractPostcode(address: string | null): string {
  if (!address) return ''
  const m = address.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i)
  return m ? m[0].toUpperCase() : ''
}

export default function PropertyAuditPage() {
  const router = useRouter()
  const [loading,    setLoading]    = useState(true)
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [adminEmail, setAdminEmail] = useState('')

  // Which row is currently expanded
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Per-property edit state (address text field)
  const [editAddrs,     setEditAddrs]     = useState<Record<string, string>>({})
  // Per-property lookup results (kept fields from CouncilInfoModal)
  const [lookupResults, setLookupResults] = useState<Record<string, PostcodeLookupResult | null>>({})
  // Save / flash state
  const [saving,   setSaving]   = useState<string | null>(null)
  const [flashed,  setFlashed]  = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function load() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role)) {
        router.push('/login')
        return
      }
      setAdminEmail(user.email || '')

      const sb = createClient()
      const { data, error } = await sb
        .from('properties')
        .select('id, name, address, council_name, lat, lng, postcode_confirmed_at, postcode_confirmed_by')
        .order('name', { ascending: true })

      if (error || !data) { setLoading(false); return }

      // Sort: unconfirmed first, then confirmed, both alpha by name
      const rows = [...data as PropertyRow[]].sort((a, b) => {
        const aC = !!a.postcode_confirmed_at
        const bC = !!b.postcode_confirmed_at
        if (aC !== bC) return aC ? 1 : -1        // unconfirmed rises to top
        return (a.name || '').localeCompare(b.name || '')
      })
      setProperties(rows)

      // Pre-fill edit addresses from DB
      const addrs: Record<string, string> = {}
      rows.forEach(p => { addrs[p.id] = p.address || '' })
      setEditAddrs(addrs)

      setLoading(false)
    }
    load()
  }, [router])

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  async function handleConfirm(p: PropertyRow) {
    setSaving(p.id)
    const newAddr = (editAddrs[p.id] ?? p.address ?? '').trim()
    const result  = lookupResults[p.id]

    const sb = createClient()
    const patch: Record<string, any> = {
      address:               newAddr || p.address,
      postcode_confirmed_at: new Date().toISOString(),
      postcode_confirmed_by: adminEmail,
    }
    // Apply any council fields the admin chose to keep from the lookup
    if (result?.council_name)      patch.council_name      = result.council_name
    if (result?.council_email)     patch.council_email     = result.council_email
    if (result?.council_phone)     patch.council_phone     = result.council_phone
    if (result?.council_website)   patch.council_website   = result.council_website
    if (result?.bin_collection_day) patch.bin_collection_day = result.bin_collection_day
    if (result?.council_tax_band)  patch.council_tax_band  = result.council_tax_band
    if (result?.lat != null)       patch.lat               = result.lat
    if (result?.lng != null)       patch.lng               = result.lng

    const { error } = await sb.from('properties').update(patch).eq('id', p.id)
    if (!error) {
      setProperties(prev => prev.map(row =>
        row.id !== p.id ? row : {
          ...row,
          address:               patch.address,
          postcode_confirmed_at: patch.postcode_confirmed_at,
          postcode_confirmed_by: adminEmail,
          council_name:          result?.council_name ?? row.council_name,
          lat:                   result?.lat          ?? row.lat,
          lng:                   result?.lng          ?? row.lng,
        }
      ))
      setFlashed(prev => ({ ...prev, [p.id]: true }))
      setExpandedId(null)
      setTimeout(() => setFlashed(prev => ({ ...prev, [p.id]: false })), 3000)
    }
    setSaving(null)
  }

  // ── Derived stats ────────────────────────────────────────────────────────────
  const total     = properties.length
  const confirmed = properties.filter(p => !!p.postcode_confirmed_at).length
  const pct       = total > 0 ? Math.round((confirmed / total) * 100) : 0
  const allDone   = total > 0 && confirmed === total

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />
      <p className="p-xl text-sm text-neutral-400">Loading properties…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero eyebrow="Portfolio" title="Address & postcode audit" subtitle="Some imported addresses may have incorrect or missing postcodes. Work through each property — look up the postcode, correct the address if needed, then confirm. You can do this gradually; your progress is saved after each confirmation." />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">
            Properties & Units
          </p>
        </div>

        {/* ── Progress card ───────────────────────────────────────────────── */}
        <div className={`rounded-2xl border p-lg mb-lg ${allDone ? 'border-green-200 bg-green-50' : 'border-neutral-200 bg-white'}`}>
          <div className="flex items-center justify-between mb-sm">
            <p className="text-sm font-semibold text-neutral-900">
              {allDone
                ? '🎉 All properties confirmed!'
                : `${confirmed} of ${total} confirmed`}
            </p>
            <p className="text-sm font-bold text-neutral-700">{pct}%</p>
          </div>
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {!allDone && (
            <p className="text-xs text-neutral-400 mt-sm">
              {total - confirmed} {total - confirmed === 1 ? 'property still needs' : 'properties still need'} review
            </p>
          )}
        </div>

        {/* ── Property checklist ──────────────────────────────────────────── */}
        <div className="space-y-sm">
          {properties.map(p => {
            const isConfirmed = !!p.postcode_confirmed_at
            const isExpanded  = expandedId === p.id
            const isSaving    = saving === p.id
            const justFlashed = flashed[p.id]
            const editAddr    = editAddrs[p.id] ?? p.address ?? ''
            const result      = lookupResults[p.id]
            const pc          = extractPostcode(p.address)

            return (
              <div
                key={p.id}
                className={`rounded-2xl border transition-all duration-150 ${
                  isExpanded
                    ? 'border-blue-300 bg-white shadow-md'
                    : isConfirmed
                      ? 'border-green-200 bg-green-50/40 hover:border-green-300'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                {/* Row header — always visible */}
                <button
                  type="button"
                  onClick={() => toggleExpand(p.id)}
                  className="flex w-full items-center gap-md px-lg py-md text-left"
                >
                  {/* Status dot */}
                  <span className={`shrink-0 h-2.5 w-2.5 rounded-full ${isConfirmed ? 'bg-green-500' : 'bg-amber-400'}`} />

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 text-sm leading-tight">{p.name}</p>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {p.address || <em className="text-red-400">No address stored</em>}
                    </p>
                  </div>

                  {/* Right-side chips */}
                  <div className="flex items-center gap-sm shrink-0">
                    {pc && (
                      <span className="font-mono text-xs text-neutral-500 bg-neutral-100 px-sm py-0.5 rounded">
                        {pc}
                      </span>
                    )}
                    {justFlashed && (
                      <span className="text-xs font-semibold text-green-700">✓ Saved</span>
                    )}
                    <span className={`rounded-full text-xs font-semibold px-sm py-0.5 ${
                      isConfirmed
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isConfirmed ? '✓ Confirmed' : '⚠ Needs review'}
                    </span>
                    <svg
                      className={`h-4 w-4 text-neutral-400 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* ── Expanded panel ────────────────────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-neutral-100 px-lg pb-lg pt-md space-y-md">

                    {/* Previous confirmation info (if re-confirming) */}
                    {isConfirmed && (
                      <div className="rounded-xl bg-green-50 border border-green-200 p-md text-xs">
                        <p className="font-semibold text-green-800 mb-0.5">Previously confirmed</p>
                        <p className="text-green-700">
                          By {p.postcode_confirmed_by} on {fmtDate(p.postcode_confirmed_at!)}
                        </p>
                        {p.council_name && (
                          <p className="text-green-600 mt-0.5">Council: {p.council_name}</p>
                        )}
                      </div>
                    )}

                    {/* Address field + lookup widget */}
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">
                        Address
                      </p>
                      <p className="text-xs text-neutral-400 mb-sm">
                        Edit if wrong, then click <strong>Look up</strong> to verify via postcodes.io.
                        Accept the fields you want to keep, then click Confirm to save.
                      </p>
                      {/* PostcodeLookupWidget — same shared component as new-property setup */}
                      <PostcodeLookupWidget
                        value={editAddr}
                        onChange={v => setEditAddrs(prev => ({ ...prev, [p.id]: v }))}
                        onResult={data => setLookupResults(prev => ({ ...prev, [p.id]: data }))}
                        placeholder="Full address with postcode, e.g. 4 Willis Road, London, E15 3HH"
                      />
                    </div>

                    {/* Lookup result summary (shown after admin accepts the modal) */}
                    {result && (
                      <div className="rounded-xl bg-blue-50 border border-blue-200 p-md text-xs space-y-xs">
                        <p className="font-semibold text-blue-900">📍 Lookup accepted</p>
                        {result.postcode    && <p className="text-blue-800">Postcode: <span className="font-mono font-semibold">{result.postcode}</span></p>}
                        {result.council_name && <p className="text-blue-800">Council: {result.council_name}</p>}
                        {result.lat != null && (
                          <p className="text-blue-700 font-mono">
                            {result.lat?.toFixed(5)}, {result.lng?.toFixed(5)}
                          </p>
                        )}
                        <p className="text-blue-600 mt-xs">
                          These fields will be saved to the property record when you confirm below.
                        </p>
                      </div>
                    )}

                    {/* Confirm / cancel */}
                    <div className="flex gap-sm pt-xs">
                      <button
                        type="button"
                        onClick={() => setExpandedId(null)}
                        className="px-lg py-sm rounded-xl border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirm(p)}
                        disabled={isSaving || !editAddr.trim()}
                        className="flex-1 px-lg py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                      >
                        {isSaving
                          ? 'Saving…'
                          : isConfirmed
                            ? 'Re-confirm address ✓'
                            : 'Confirm this address ✓'}
                      </button>
                    </div>

                    {/* Hint: confirming without a lookup is fine */}
                    <p className="text-xs text-neutral-400">
                      You don&apos;t have to run the lookup — you can confirm the address as-is if you know it&apos;s correct.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!loading && properties.length === 0 && (
          <div className="text-center py-3xl text-neutral-400 text-sm">
            No properties found.
          </div>
        )}
      </main>
    </div>
  )
}

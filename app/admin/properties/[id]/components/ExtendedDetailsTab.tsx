'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface ExtendedDetails {
  id: string
  bin_black_day?: string
  bin_blue_day?: string
  bin_green_day?: string
  bin_food_day?: string
  nearest_gp_name?: string
  nearest_gp_phone?: string
  nearest_gp_postcode?: string
  police_force_name?: string
  police_station_name?: string
  council_tax_band?: string
  council_contact_phone?: string
  council_contact_url?: string
  single_let_rental_value?: number
  hmo_total_value?: number
  valuation_source?: string
  data_last_synced?: string
}

interface Correction {
  id: string
  field_name: string
  original_value: string | null
  suggested_value: string
  suggested_by: string
  source_url?: string
  confidence_score: number
  status: 'pending' | 'accepted' | 'rejected'
  admin_notes?: string
}

interface ExtendedDetailsTabProps {
  propertyId: string
  propertyType: string
}

export default function ExtendedDetailsTab({ propertyId, propertyType }: ExtendedDetailsTabProps) {
  const supabase = createClient()

  const [extended, setExtended] = useState<ExtendedDetails | null>(null)
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState<'compliance' | 'factsheet' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isHmo = propertyType === 'hmo'

  useEffect(() => {
    loadData()
  }, [propertyId])

  async function loadData() {
    setLoading(true)
    const [extendedRes, correctionsRes] = await Promise.all([
      supabase
        .from('property_extended_details')
        .select('*')
        .eq('property_id', propertyId)
        .maybeSingle(),
      supabase
        .from('property_data_corrections')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
    ])

    if (extendedRes.data) setExtended(extendedRes.data)
    if (correctionsRes.data) setCorrections(correctionsRes.data)
    setLoading(false)
  }

  async function handleRescan() {
    setRefreshing(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/properties/extended-details/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          fields_to_refresh: ['bins', 'gp', 'police', 'valuation']
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to refresh data')
        return
      }

      setSuccess(`✓ Refreshed ${data.refreshed_fields.join(', ')}. ${data.suggestions_created} suggestion${data.suggestions_created === 1 ? '' : 's'} created.`)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleAccept(correctionId: string) {
    try {
      const res = await fetch('/api/properties/data-corrections/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction_id: correctionId,
          action: 'accept'
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.error || 'Failed to accept suggestion')
        return
      }

      setSuccess('✓ Suggestion accepted')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleReject(correctionId: string) {
    try {
      const res = await fetch('/api/properties/data-corrections/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction_id: correctionId,
          action: 'reject'
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.error || 'Failed to reject suggestion')
        return
      }

      setSuccess('✓ Suggestion rejected')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleExport(type: 'compliance' | 'factsheet') {
    if (type === 'compliance' && !isHmo) {
      setError('Compliance log export is for HMO properties only')
      return
    }

    setExporting(type)
    try {
      const endpoint = type === 'compliance'
        ? '/api/export/compliance-log-pdf'
        : '/api/export/property-fact-sheet-pdf'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId })
      })

      if (!res.ok) {
        setError(`Failed to export ${type}`)
        return
      }

      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.click()
      window.URL.revokeObjectURL(url)

      setSuccess(`✓ ${type === 'compliance' ? 'Compliance log' : 'Fact sheet'} opened in new tab`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setExporting(null)
    }
  }

  if (loading) return <div className="text-center py-xl text-neutral-500">Loading...</div>

  const pendingSuggestions = corrections.filter(c => c.status === 'pending')

  return (
    <div className="space-y-xl">
      {/* Error/Success Messages */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-md text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-md text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Rescan Button */}
      <div className="flex gap-md">
        <button
          onClick={handleRescan}
          disabled={refreshing}
          className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {refreshing ? '⟳ Rescanning...' : '🔄 Rescan Data'}
        </button>

        <button
          onClick={() => handleExport('factsheet')}
          disabled={exporting === 'factsheet'}
          className="px-lg py-md bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-800 disabled:opacity-50 transition"
        >
          {exporting === 'factsheet' ? 'Exporting...' : '📄 Export Fact Sheet'}
        </button>
      </div>

      {/* Extended Details */}
      <div className="rounded-lg border border-neutral-200 p-lg">
        <h3 className="font-bold text-lg mb-lg">Property Details</h3>

        {!extended ? (
          <p className="text-sm text-neutral-500 italic">No data yet. Click "Rescan Data" to fetch information.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            {/* Bins */}
            {(extended.bin_black_day || extended.bin_blue_day || extended.bin_green_day || extended.bin_food_day) && (
              <div className="p-md bg-neutral-50 rounded">
                <p className="font-semibold text-sm mb-sm">🗑️ Waste Management</p>
                <div className="space-y-xs text-sm text-neutral-600">
                  {extended.bin_black_day && <p>Black bin: <span className="font-mono">{extended.bin_black_day}</span></p>}
                  {extended.bin_blue_day && <p>Blue bin: <span className="font-mono">{extended.bin_blue_day}</span></p>}
                  {extended.bin_green_day && <p>Green bin: <span className="font-mono">{extended.bin_green_day}</span></p>}
                  {extended.bin_food_day && <p>Food waste: <span className="font-mono">{extended.bin_food_day}</span></p>}
                </div>
              </div>
            )}

            {/* GP */}
            {extended.nearest_gp_name && (
              <div className="p-md bg-neutral-50 rounded">
                <p className="font-semibold text-sm mb-sm">🏥 Local GP</p>
                <div className="space-y-xs text-sm text-neutral-600">
                  <p><strong>{extended.nearest_gp_name}</strong></p>
                  {extended.nearest_gp_phone && <p>Phone: {extended.nearest_gp_phone}</p>}
                  {extended.nearest_gp_postcode && <p>Postcode: {extended.nearest_gp_postcode}</p>}
                </div>
              </div>
            )}

            {/* Police */}
            {extended.police_force_name && (
              <div className="p-md bg-neutral-50 rounded">
                <p className="font-semibold text-sm mb-sm">🚔 Police</p>
                <div className="space-y-xs text-sm text-neutral-600">
                  <p><strong>{extended.police_force_name}</strong></p>
                  {extended.police_station_name && <p>Station: {extended.police_station_name}</p>}
                </div>
              </div>
            )}

            {/* Council */}
            {(extended.council_tax_band || extended.council_contact_phone) && (
              <div className="p-md bg-neutral-50 rounded">
                <p className="font-semibold text-sm mb-sm">🏛️ Council</p>
                <div className="space-y-xs text-sm text-neutral-600">
                  {extended.council_tax_band && <p>Tax Band: <span className="font-mono">{extended.council_tax_band}</span></p>}
                  {extended.council_contact_phone && <p>Contact: {extended.council_contact_phone}</p>}
                </div>
              </div>
            )}

            {/* Valuations */}
            {(extended.single_let_rental_value || extended.hmo_total_value) && (
              <div className="p-md bg-neutral-50 rounded">
                <p className="font-semibold text-sm mb-sm">💷 Valuation</p>
                <div className="space-y-xs text-sm text-neutral-600">
                  {extended.single_let_rental_value && <p>Est. Rental: £{extended.single_let_rental_value}/month</p>}
                  {extended.hmo_total_value && <p>Total Value: £{extended.hmo_total_value}</p>}
                  {extended.valuation_source && <p className="text-xs text-neutral-500">Source: {extended.valuation_source}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {extended?.data_last_synced && (
          <p className="text-xs text-neutral-500 mt-md">
            Last synced: {new Date(extended.data_last_synced).toLocaleDateString('en-GB')}
          </p>
        )}
      </div>

      {/* Pending Suggestions */}
      {pendingSuggestions.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-lg">
          <h3 className="font-bold text-lg mb-lg text-amber-900">
            ⚠️ Pending Suggestions ({pendingSuggestions.length})
          </h3>

          <div className="space-y-md">
            {pendingSuggestions.map((correction) => (
              <div key={correction.id} className="border border-amber-200 rounded p-md bg-white">
                <div className="flex items-start justify-between gap-md mb-sm">
                  <div>
                    <p className="font-semibold text-sm">{correction.field_name}</p>
                    <p className="text-xs text-neutral-500 mt-xs">
                      From: <span className="font-mono">{correction.suggested_by}</span>
                      {correction.confidence_score && ` • Confidence: ${Math.round(correction.confidence_score * 100)}%`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-mono px-md py-xs bg-neutral-100 rounded text-neutral-600">
                    Pending
                  </span>
                </div>

                <div className="mb-md p-sm bg-neutral-50 rounded text-sm font-mono">
                  {correction.suggested_value}
                </div>

                {correction.source_url && (
                  <p className="text-xs mb-md">
                    <a href={correction.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      View source ↗
                    </a>
                  </p>
                )}

                <div className="flex gap-sm">
                  <button
                    onClick={() => handleAccept(correction.id)}
                    className="flex-1 px-md py-xs bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 transition"
                  >
                    ✓ Accept
                  </button>
                  <button
                    onClick={() => handleReject(correction.id)}
                    className="flex-1 px-md py-xs bg-red-600 text-white rounded text-sm font-semibold hover:bg-red-700 transition"
                  >
                    ✗ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

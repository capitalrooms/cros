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
  // Property Insights — property scan
  epc_rating?: string
  epc_efficiency_score?: number
  epc_potential_rating?: string
  epc_potential_score?: number
  epc_property_type?: string
  epc_floor_area_sqm?: number
  epc_habitable_rooms?: number
  epc_inspected_date?: string
  epc_lodgement_date?: string
  flood_risk_level?: string
  flood_risk_river_sea?: string
  flood_risk_surface_water?: string
  broadband_max_download_mbps?: number
  broadband_max_upload_mbps?: number
  broadband_superfast?: boolean
  broadband_ultrafast?: boolean
  planning_constraints_count?: number
  planning_has_conservation_area?: boolean
  planning_has_listed_building?: boolean
  planning_has_article4?: boolean
  council_tax_authority?: string
  council_tax_band_rates?: Record<string, number>
  council_tax_year?: string
  // Property Insights — market scan
  crime_data?: Record<string, any>
  sold_prices_data?: Record<string, any>
  area_prices_data?: Record<string, any>
  // Property Insights — full scan extras
  schools_data?: Record<string, any>
  environmental_risk_data?: Record<string, any>
  property_insights_last_synced?: string
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
  const [scanning, setScanning] = useState<'property' | 'market' | 'full' | null>(null)
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

  async function handlePropertyInsightsScan(scan_type: 'property' | 'market' | 'full') {
    setScanning(scan_type)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/admin/property-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, scan_type }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Property Insights scan failed')
        return
      }

      setSuccess(`✓ Scan complete. Used ${data.creditsUsed} credits (${data.creditsRemaining} remaining).`)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setScanning(null)
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

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-md">
        {/* PI scan buttons */}
        <div className="flex flex-wrap gap-sm rounded-xl border border-violet-200 bg-violet-50 p-sm">
          <div className="w-full px-xs pb-xs">
            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">✨ Property Insights</p>
          </div>
          <button
            onClick={() => handlePropertyInsightsScan('property')}
            disabled={!!scanning}
            className="px-md py-sm bg-violet-600 text-white rounded-lg font-semibold text-xs hover:bg-violet-700 disabled:opacity-50 transition"
            title="EPC, flood risk, broadband, planning, council tax"
          >
            {scanning === 'property' ? '⟳ Scanning...' : '🏠 Property Scan (~5 credits)'}
          </button>
          <button
            onClick={() => handlePropertyInsightsScan('market')}
            disabled={!!scanning}
            className="px-md py-sm bg-violet-600 text-white rounded-lg font-semibold text-xs hover:bg-violet-700 disabled:opacity-50 transition"
            title="Crime, sold prices, area price trends"
          >
            {scanning === 'market' ? '⟳ Scanning...' : '📊 Market Scan (~3 credits)'}
          </button>
          <button
            onClick={() => handlePropertyInsightsScan('full')}
            disabled={!!scanning}
            className="px-md py-sm bg-violet-800 text-white rounded-lg font-semibold text-xs hover:bg-violet-900 disabled:opacity-50 transition"
            title="Everything: property + market + schools + environmental risk"
          >
            {scanning === 'full' ? '⟳ Scanning...' : '🔬 Full Scan (~10 credits)'}
          </button>
        </div>

        <button
          onClick={handleRescan}
          disabled={refreshing}
          className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {refreshing ? '⟳ Rescanning...' : '🔄 Rescan Local Data'}
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

      {/* Property Insights Section */}
      {extended?.property_insights_last_synced && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-lg">
          <div className="flex items-center justify-between mb-lg">
            <h3 className="font-bold text-lg text-violet-900">✨ Property Insights</h3>
            <span className="text-xs text-violet-500">
              Scanned {new Date(extended.property_insights_last_synced).toLocaleDateString('en-GB')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {/* EPC */}
            {extended.epc_rating && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-sm text-neutral-500 mb-sm uppercase tracking-wide text-xs">EPC Rating</p>
                <div className="flex items-center gap-sm">
                  <span className={`text-2xl font-black px-md py-xs rounded-lg text-white ${
                    extended.epc_rating === 'A' ? 'bg-green-600' :
                    extended.epc_rating === 'B' ? 'bg-green-500' :
                    extended.epc_rating === 'C' ? 'bg-yellow-500' :
                    extended.epc_rating === 'D' ? 'bg-orange-400' :
                    extended.epc_rating === 'E' ? 'bg-orange-500' :
                    extended.epc_rating === 'F' ? 'bg-red-500' :
                    'bg-red-700'
                  }`}>{extended.epc_rating}</span>
                  <div>
                    <p className="text-sm font-semibold">{extended.epc_efficiency_score}/100</p>
                    {extended.epc_potential_rating && (
                      <p className="text-xs text-neutral-500">
                        Potential: {extended.epc_potential_rating} ({extended.epc_potential_score}/100)
                      </p>
                    )}
                  </div>
                </div>
                {extended.epc_floor_area_sqm && (
                  <p className="text-xs text-neutral-500 mt-xs">{extended.epc_floor_area_sqm} m² · {extended.epc_habitable_rooms} rooms</p>
                )}
                {extended.epc_inspected_date && (
                  <p className="text-xs text-neutral-400 mt-xs">Inspected {new Date(extended.epc_inspected_date).toLocaleDateString('en-GB')}</p>
                )}
              </div>
            )}

            {/* Flood Risk */}
            {extended.flood_risk_level && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">Flood Risk</p>
                <div className="flex items-center gap-sm mb-xs">
                  <span className={`px-sm py-xs rounded-full text-xs font-bold uppercase ${
                    extended.flood_risk_level === 'none' ? 'bg-green-100 text-green-700' :
                    extended.flood_risk_level === 'low' ? 'bg-yellow-100 text-yellow-700' :
                    extended.flood_risk_level === 'medium' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>{extended.flood_risk_level}</span>
                </div>
                {extended.flood_risk_river_sea && extended.flood_risk_river_sea !== 'none' && (
                  <p className="text-xs text-neutral-600">River/Sea: {extended.flood_risk_river_sea}</p>
                )}
                {extended.flood_risk_surface_water && extended.flood_risk_surface_water !== 'none' && (
                  <p className="text-xs text-neutral-600">Surface water: {extended.flood_risk_surface_water}</p>
                )}
              </div>
            )}

            {/* Broadband */}
            {extended.broadband_max_download_mbps != null && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">Broadband</p>
                <p className="text-2xl font-black text-neutral-900">{extended.broadband_max_download_mbps}<span className="text-sm font-normal text-neutral-500"> Mbps</span></p>
                <p className="text-xs text-neutral-500">Up to {extended.broadband_max_upload_mbps} Mbps upload</p>
                <div className="flex gap-xs mt-xs flex-wrap">
                  {extended.broadband_superfast && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-xs py-xs rounded-full">Superfast</span>
                  )}
                  {extended.broadband_ultrafast && (
                    <span className="text-xs bg-blue-200 text-blue-800 px-xs py-xs rounded-full">Ultrafast</span>
                  )}
                  {!extended.broadband_superfast && !extended.broadband_ultrafast && (
                    <span className="text-xs bg-neutral-100 text-neutral-500 px-xs py-xs rounded-full">Basic only</span>
                  )}
                </div>
              </div>
            )}

            {/* Planning */}
            {extended.planning_constraints_count != null && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">Planning</p>
                <p className="text-sm font-semibold">{extended.planning_constraints_count} constraint{extended.planning_constraints_count !== 1 ? 's' : ''}</p>
                <div className="space-y-xs mt-xs">
                  {extended.planning_has_conservation_area && (
                    <p className="text-xs text-amber-700 font-medium">🏛 Conservation area</p>
                  )}
                  {extended.planning_has_listed_building && (
                    <p className="text-xs text-amber-700 font-medium">📜 Listed building nearby</p>
                  )}
                  {extended.planning_has_article4 && (
                    <p className="text-xs text-red-700 font-medium">⚠️ Article 4 direction</p>
                  )}
                  {!extended.planning_has_conservation_area && !extended.planning_has_listed_building && !extended.planning_has_article4 && (
                    <p className="text-xs text-green-600">No major restrictions</p>
                  )}
                </div>
              </div>
            )}

            {/* Council Tax */}
            {extended.council_tax_authority && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">Council Tax</p>
                <p className="text-sm font-semibold">{extended.council_tax_authority}</p>
                {extended.council_tax_year && (
                  <p className="text-xs text-neutral-500 mb-xs">{extended.council_tax_year}</p>
                )}
                {extended.council_tax_band_rates && (
                  <div className="grid grid-cols-4 gap-xs mt-xs">
                    {Object.entries(extended.council_tax_band_rates)
                      .slice(0, 8)
                      .map(([band, rate]) => (
                        <div key={band} className="text-center">
                          <p className="text-xs font-bold text-neutral-700 uppercase">{band.replace('band_', '')}</p>
                          <p className="text-xs text-neutral-500">£{Math.round(rate as number)}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Crime */}
            {extended.crime_data && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">🔴 Crime</p>
                {extended.crime_data.totalCrimes != null && (
                  <p className="text-2xl font-black text-neutral-900">
                    {extended.crime_data.totalCrimes}
                    <span className="text-sm font-normal text-neutral-500"> crimes</span>
                  </p>
                )}
                {extended.crime_data.crimeRate != null && (
                  <p className="text-xs text-neutral-500 mb-xs">
                    {extended.crime_data.crimeRate}/1k residents
                    {extended.crime_data.nationalAverage != null && (
                      <span className={extended.crime_data.crimeRate > extended.crime_data.nationalAverage ? ' text-red-500' : ' text-green-600'}>
                        {' '}(national avg: {extended.crime_data.nationalAverage})
                      </span>
                    )}
                  </p>
                )}
                {Array.isArray(extended.crime_data.categories) && (
                  <div className="space-y-xs mt-xs">
                    {extended.crime_data.categories.slice(0, 5).map((cat: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-neutral-600">{cat.category}</span>
                        <span className="font-mono text-neutral-700">{cat.count}</span>
                      </div>
                    ))}
                    {extended.crime_data.categories.length > 5 && (
                      <p className="text-xs text-neutral-400">+{extended.crime_data.categories.length - 5} more categories</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sold Prices */}
            {extended.sold_prices_data && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">💰 Recent Sales</p>
                {extended.sold_prices_data.averagePrice != null && (
                  <p className="text-lg font-black text-neutral-900">
                    £{Number(extended.sold_prices_data.averagePrice).toLocaleString()}
                    <span className="text-xs font-normal text-neutral-500"> avg</span>
                  </p>
                )}
                {Array.isArray(extended.sold_prices_data.transactions) && (
                  <div className="space-y-xs mt-sm">
                    {extended.sold_prices_data.transactions.slice(0, 4).map((t: any, i: number) => (
                      <div key={i} className="text-xs border-b border-neutral-50 pb-xs last:border-0">
                        <div className="flex justify-between">
                          <span className="text-neutral-700 font-semibold">£{Number(t.price).toLocaleString()}</span>
                          <span className="text-neutral-400">{t.date}</span>
                        </div>
                        {t.address && <p className="text-neutral-500 truncate">{t.address}</p>}
                        <div className="flex gap-xs mt-xs">
                          {t.type && <span className="bg-neutral-100 text-neutral-600 px-xs rounded text-xs">{t.type}</span>}
                          {t.tenure && <span className="bg-neutral-100 text-neutral-600 px-xs rounded text-xs">{t.tenure}</span>}
                        </div>
                      </div>
                    ))}
                    {extended.sold_prices_data.transactions.length > 4 && (
                      <p className="text-xs text-neutral-400">+{extended.sold_prices_data.transactions.length - 4} more sales</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Area Price Trends */}
            {extended.area_prices_data && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">📈 Area Prices</p>
                {extended.area_prices_data.averagePrice != null && (
                  <div className="flex items-baseline gap-sm mb-xs">
                    <p className="text-lg font-black text-neutral-900">£{Number(extended.area_prices_data.averagePrice).toLocaleString()}</p>
                    {extended.area_prices_data.priceChangePercent != null && (
                      <span className={`text-sm font-semibold ${extended.area_prices_data.priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {extended.area_prices_data.priceChangePercent >= 0 ? '↑' : '↓'}{Math.abs(extended.area_prices_data.priceChangePercent)}%
                      </span>
                    )}
                  </div>
                )}
                {Array.isArray(extended.area_prices_data.dataPoints) && (
                  <div className="space-y-xs">
                    {extended.area_prices_data.dataPoints.slice(-6).map((dp: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-neutral-500">{dp.period}</span>
                        <span className="font-mono text-neutral-700">£{Number(dp.averagePrice).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Schools */}
            {extended.schools_data && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">🏫 Schools</p>
                {Array.isArray(extended.schools_data.schools) && (
                  <div className="space-y-sm">
                    {extended.schools_data.schools.slice(0, 3).map((s: any, i: number) => (
                      <div key={i} className="text-xs">
                        <p className="font-semibold text-neutral-800 leading-tight">{s.name}</p>
                        <div className="flex gap-xs mt-xs flex-wrap">
                          {s.ofstedRating && (
                            <span className={`px-xs py-xs rounded text-xs font-bold ${
                              s.ofstedRating === 'Outstanding' ? 'bg-green-100 text-green-700' :
                              s.ofstedRating === 'Good' ? 'bg-blue-100 text-blue-700' :
                              s.ofstedRating === 'Requires Improvement' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>{s.ofstedRating}</span>
                          )}
                          {s.distance && <span className="text-neutral-400">{s.distance}</span>}
                          {s.type && <span className="text-neutral-400">{s.type}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Environmental Risk */}
            {extended.environmental_risk_data && (
              <div className="p-md bg-white rounded-lg border border-violet-100">
                <p className="font-semibold text-xs text-neutral-500 mb-sm uppercase tracking-wide">🌱 Environmental</p>
                {extended.environmental_risk_data.overallRisk && (
                  <span className={`inline-block px-sm py-xs rounded-full text-xs font-bold uppercase mb-xs ${
                    extended.environmental_risk_data.overallRisk === 'low' ? 'bg-green-100 text-green-700' :
                    extended.environmental_risk_data.overallRisk === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>{extended.environmental_risk_data.overallRisk} risk</span>
                )}
                <div className="space-y-xs mt-xs">
                  {extended.environmental_risk_data.contaminatedLand != null && (
                    <p className="text-xs text-neutral-600">
                      Contaminated land: <span className={extended.environmental_risk_data.contaminatedLand ? 'text-red-600 font-semibold' : 'text-green-600'}>
                        {extended.environmental_risk_data.contaminatedLand ? 'Yes' : 'No'}
                      </span>
                    </p>
                  )}
                  {extended.environmental_risk_data.airQualityIndex != null && (
                    <p className="text-xs text-neutral-600">Air quality index: <span className="font-mono">{extended.environmental_risk_data.airQualityIndex}</span></p>
                  )}
                  {extended.environmental_risk_data.radonLevel && (
                    <p className="text-xs text-neutral-600">Radon: {extended.environmental_risk_data.radonLevel}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

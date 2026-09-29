// POST /api/admin/property-insights
// Calls propertyinsights.co.uk APIs and stores results in property_extended_details.
//
// Body: { property_id: string, scan_type: 'property' | 'market' | 'full' }
//
// scan_type:
//   'property' (~5 credits)  — EPC, flood, broadband, planning, council tax
//   'market'   (~3 credits)  — crime, sold prices, area price trends
//   'full'     (~10 credits) — all of the above + schools + environmental risk

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE = 'https://propertyinsights.co.uk/api/v1'

function getKey() {
  const key = process.env.PROPERTY_INSIGHTS_API_KEY
  if (!key) throw new Error('PROPERTY_INSIGHTS_API_KEY not configured')
  return key
}

async function piGet(path: string, params: Record<string, string | number | boolean | undefined>) {
  const key = getKey()
  const query = new URLSearchParams()
  query.set('api_key', key)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) query.set(k, String(v))
  }
  const res = await fetch(`${BASE}${path}?${query}`, { headers: { Accept: 'application/json' } })
  const json = await res.json()
  return json
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { property_id, scan_type = 'property' } = body

  if (!property_id) {
    return NextResponse.json({ error: 'property_id is required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch property — prefer the dedicated postcode column, fall back to regex extraction
  const { data: property, error: propErr } = await supabase
    .from('properties')
    .select('id, address, name, postcode')
    .eq('id', property_id)
    .single()

  if (propErr || !property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  // Use stored postcode first; fall back to regex from address text
  let postcode = (property.postcode || '').replace(/\s+/g, '').toUpperCase()
  if (!postcode) {
    const postcodeMatch = (property.address || '').match(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i)
    postcode = postcodeMatch ? postcodeMatch[0].replace(/\s+/g, '').toUpperCase() : ''
  }
  if (!postcode) {
    return NextResponse.json({ error: 'Could not find a UK postcode for this property. Please add a postcode to the property record.' }, { status: 400 })
  }

  let totalCreditsUsed = 0
  let finalCreditsRemaining = 0

  const trackBilling = (res: any) => {
    if (res?.billing?.creditsCharged) totalCreditsUsed += res.billing.creditsCharged
    if (res?.billing?.creditsRemaining != null) finalCreditsRemaining = res.billing.creditsRemaining
  }

  const runProperty = scan_type === 'property' || scan_type === 'full'
  const runMarket   = scan_type === 'market'   || scan_type === 'full'
  const runExtras   = scan_type === 'full'

  // ── Fire all relevant calls in parallel ───────────────────────────────────
  const [
    epcRes, councilTaxRes, floodRes, broadbandRes, planningRes,
    crimeRes, soldPricesRes, areaPricesRes,
    schoolsRes, envRiskRes,
  ] = await Promise.allSettled([
    runProperty ? piGet('/epc/search',             { postcode }) : Promise.resolve(null),
    runProperty ? piGet('/council-tax/lookup',      { postcode }) : Promise.resolve(null),
    runProperty ? piGet('/property/flood-risk',     { postcode }) : Promise.resolve(null),
    runProperty ? piGet('/connectivity/broadband',  { postcode }) : Promise.resolve(null),
    runProperty ? piGet('/planning/constraints',    { postcode }) : Promise.resolve(null),
    runMarket   ? piGet('/crime/by-postcode',       { postcode }) : Promise.resolve(null),
    runMarket   ? piGet('/property/sold-prices',    { postcode }) : Promise.resolve(null),
    runMarket   ? piGet('/area/sold-prices',        { postcode }) : Promise.resolve(null),
    runExtras   ? piGet('/schools/search',          { postcode }) : Promise.resolve(null),
    runExtras   ? piGet('/property/environmental-risk', { postcode }) : Promise.resolve(null),
  ])

  // ── Parse EPC ─────────────────────────────────────────────────────────────
  let epcData: Record<string, any> = {}
  if (epcRes.status === 'fulfilled' && epcRes.value?.success) {
    const d = epcRes.value
    trackBilling(d)
    const sorted = [...(d.data?.results ?? [])].sort((a: any, b: any) =>
      (b['lodgement-date'] ?? '').localeCompare(a['lodgement-date'] ?? ''))
    const r = sorted[0]
    if (r) {
      epcData = {
        epc_rating:           r['current-energy-rating'] ?? null,
        epc_efficiency_score: r['current-energy-efficiency'] ? parseInt(r['current-energy-efficiency']) : null,
        epc_potential_rating: r['potential-energy-rating'] ?? null,
        epc_potential_score:  r['potential-energy-efficiency'] ? parseInt(r['potential-energy-efficiency']) : null,
        epc_property_type:    r['property-type'] ?? null,
        epc_floor_area_sqm:   r['total-floor-area'] ? parseFloat(r['total-floor-area']) : null,
        epc_habitable_rooms:  r['number-habitable-rooms'] ? parseInt(r['number-habitable-rooms']) : null,
        epc_inspected_date:   r['inspection-date'] ?? null,
        epc_lodgement_date:   r['lodgement-date'] ?? null,
      }
    }
  }

  // ── Parse council tax ─────────────────────────────────────────────────────
  let councilTaxData: Record<string, any> = {}
  if (councilTaxRes.status === 'fulfilled' && councilTaxRes.value?.success) {
    const d = councilTaxRes.value
    trackBilling(d)
    const r = d.data ?? {}
    councilTaxData = {
      council_tax_authority:  r.authority ?? null,
      council_tax_band_rates: r.councilTaxBands ?? null,
      council_tax_year:       r.taxYear ?? null,
    }
  }

  // ── Parse flood risk ──────────────────────────────────────────────────────
  let floodData: Record<string, any> = {}
  if (floodRes.status === 'fulfilled' && floodRes.value?.success) {
    const d = floodRes.value
    trackBilling(d)
    const r = d.data ?? {}
    floodData = {
      flood_risk_level:        r.riskLevel ?? null,
      flood_risk_river_sea:    r.risks?.riverAndSea?.riskLevel ?? null,
      flood_risk_surface_water: r.risks?.surfaceWater?.riskLevel ?? null,
    }
  }

  // ── Parse broadband ───────────────────────────────────────────────────────
  let broadbandData: Record<string, any> = {}
  if (broadbandRes.status === 'fulfilled' && broadbandRes.value?.success) {
    const d = broadbandRes.value
    trackBilling(d)
    const r = d.data?.broadband ?? {}
    broadbandData = {
      broadband_max_download_mbps: r.maxDownloadMbps ?? null,
      broadband_max_upload_mbps:   r.maxUploadMbps ?? null,
      broadband_superfast:         r.superfast?.available ?? null,
      broadband_ultrafast:         r.ultrafast?.available ?? null,
    }
  }

  // ── Parse planning ────────────────────────────────────────────────────────
  let planningData: Record<string, any> = {}
  if (planningRes.status === 'fulfilled' && planningRes.value?.success) {
    const d = planningRes.value
    trackBilling(d)
    const constraints: any[] = d.data?.constraints ?? []
    const datasets = constraints.map((c: any) => c.dataset)
    planningData = {
      planning_constraints_count:    constraints.length,
      planning_has_conservation_area: datasets.some((ds: string) => ds.includes('conservation')),
      planning_has_listed_building:  datasets.some((ds: string) => ds.includes('listed-building')),
      planning_has_article4:         datasets.some((ds: string) => ds.includes('article-4')),
    }
  }

  // ── Parse crime ───────────────────────────────────────────────────────────
  let crimeData: Record<string, any> = {}
  if (crimeRes.status === 'fulfilled' && crimeRes.value?.success) {
    const d = crimeRes.value
    trackBilling(d)
    crimeData = { crime_data: d.data ?? null }
  }

  // ── Parse sold prices ─────────────────────────────────────────────────────
  let soldPricesData: Record<string, any> = {}
  if (soldPricesRes.status === 'fulfilled' && soldPricesRes.value?.success) {
    const d = soldPricesRes.value
    trackBilling(d)
    soldPricesData = { sold_prices_data: d.data ?? null }
  }

  // ── Parse area price trends ───────────────────────────────────────────────
  let areaPricesData: Record<string, any> = {}
  if (areaPricesRes.status === 'fulfilled' && areaPricesRes.value?.success) {
    const d = areaPricesRes.value
    trackBilling(d)
    areaPricesData = { area_prices_data: d.data ?? null }
  }

  // ── Parse schools ─────────────────────────────────────────────────────────
  let schoolsData: Record<string, any> = {}
  if (schoolsRes.status === 'fulfilled' && schoolsRes.value?.success) {
    const d = schoolsRes.value
    trackBilling(d)
    schoolsData = { schools_data: d.data ?? null }
  }

  // ── Parse environmental risk ──────────────────────────────────────────────
  let envRiskData: Record<string, any> = {}
  if (envRiskRes.status === 'fulfilled' && envRiskRes.value?.success) {
    const d = envRiskRes.value
    trackBilling(d)
    envRiskData = { environmental_risk_data: d.data ?? null }
  }

  // ── Save to DB ────────────────────────────────────────────────────────────
  const updates = {
    property_id,
    ...(runProperty ? { ...epcData, ...councilTaxData, ...floodData, ...broadbandData, ...planningData } : {}),
    ...(runMarket   ? { ...crimeData, ...soldPricesData, ...areaPricesData } : {}),
    ...(runExtras   ? { ...schoolsData, ...envRiskData } : {}),
    property_insights_last_synced: new Date().toISOString(),
    data_last_synced: new Date().toISOString(),
  }

  const { error: upsertErr } = await supabase
    .from('property_extended_details')
    .upsert(updates, { onConflict: 'property_id' })

  if (upsertErr) {
    console.error('Failed to save insights:', upsertErr)
    return NextResponse.json({ error: 'Failed to save insights', details: upsertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    scan_type,
    data: {
      ...(runProperty ? { epc: epcData, councilTax: councilTaxData, flood: floodData, broadband: broadbandData, planning: planningData } : {}),
      ...(runMarket   ? { crime: crimeData, soldPrices: soldPricesData, areaPrices: areaPricesData } : {}),
      ...(runExtras   ? { schools: schoolsData, envRisk: envRiskData } : {}),
    },
    creditsUsed: totalCreditsUsed,
    creditsRemaining: finalCreditsRemaining,
  })
}

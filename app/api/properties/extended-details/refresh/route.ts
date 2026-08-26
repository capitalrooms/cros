import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Refresh property extended details from external sources
 * POST /api/properties/extended-details/refresh
 *
 * Body: { property_id, fields_to_refresh: ['bins', 'gp', 'police', 'valuation'] }
 * Returns: { success, refreshed_fields, suggestions_created, errors }
 */

interface RefreshRequest {
  property_id: string
  fields_to_refresh: string[]
}

interface ApiError {
  field: string
  error: string
}

// Fetch bin collection days from waste.co.uk
async function fetchBinDays(postcode: string): Promise<any> {
  try {
    const encoded = encodeURIComponent(postcode)
    const url = `https://waste-api.lam.gov.uk/collection-day/search?postcode=${encoded}`
    console.log('Fetching bins from:', url)
    const res = await fetch(url)

    console.log('Bins API response status:', res.status)
    if (!res.ok) {
      const text = await res.text()
      console.error(`waste.co.uk API error: ${res.status}`, text)
      return null
    }

    const data = await res.json()

    // Extract bin days from response
    // API returns array of collections with collection_day (0-6) and type
    if (!data.properties?.[0]?.collections) return null

    const collections = data.properties[0].collections
    const result: any = {}

    collections.forEach((c: any) => {
      const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][c.collection_day]
      if (c.type === 'refuse' || c.type === 'black') result.bin_black_day = day
      if (c.type === 'recycling' || c.type === 'blue') result.bin_blue_day = day
      if (c.type === 'garden' || c.type === 'green') result.bin_green_day = day
      if (c.type === 'food' || c.type === 'brown') result.bin_food_day = day
    })

    return Object.keys(result).length > 0 ? result : null
  } catch (error) {
    console.error('Bin days fetch error:', error)
    return null
  }
}

// Fetch nearest GP from NHS API
async function fetchNearestGP(postcode: string): Promise<any> {
  try {
    const encoded = encodeURIComponent(postcode)
    const res = await fetch(
      `https://api.nhs.uk/service-search/search?postcode=${encoded}&filter=GP%20Practices`,
      { headers: { 'User-Agent': 'Capital-Rooms/1.0' } }
    )

    if (!res.ok) {
      console.error(`NHS API error: ${res.status}`)
      return null
    }

    const data = await res.json()

    if (!data.services?.[0]) return null

    const gp = data.services[0]
    return {
      nearest_gp_name: gp.name,
      nearest_gp_address: `${gp.address?.addressLines?.[0] || ''}, ${gp.address?.postcode || ''}`.trim(),
      nearest_gp_phone: gp.contacts?.[0]?.value || null,
      nearest_gp_postcode: gp.address?.postcode || null
    }
  } catch (error) {
    console.error('GP fetch error:', error)
    return null
  }
}

// Fetch police force from UK Police API
async function fetchPoliceForce(latitude: number, longitude: number): Promise<any> {
  try {
    const res = await fetch(
      `https://data.police.uk/api/forces?lon=${longitude}&lat=${latitude}`,
      { headers: { 'User-Agent': 'Capital-Rooms/1.0' } }
    )

    if (!res.ok) return null

    const forces = await res.json()
    if (!forces?.[0]) return null

    const force = forces[0]
    return {
      police_force_name: force.name,
      police_station_name: force.name // Basic for now, could expand to get specific stations
    }
  } catch (error) {
    console.error('Police fetch error:', error)
    return null
  }
}

// Fetch council tax band from postcodes.io + estimate
async function fetchCouncilTaxBand(postcode: string): Promise<any> {
  try {
    // Get postcode data to find council
    const postcodeRes = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`,
      { method: 'GET', headers: { 'Accept': 'application/json' } }
    )

    if (!postcodeRes.ok) {
      console.warn('Postcodes.io lookup failed')
      return null
    }

    const postcodeData = await postcodeRes.json()
    if (!postcodeData.result) {
      console.warn('Invalid postcode from postcodes.io')
      return null
    }

    const result = postcodeData.result
    const councilName = result.admin_district || result.admin_county
    const outwardCode = result.outward_code

    // Estimate band based on postcode area (statistical approach)
    const band = estimateCouncilTaxBand(postcode, outwardCode, councilName, result.region)

    return {
      council_tax_band: band,
      council_name: councilName,
      note: 'Band estimated from postcode area - for exact band check your council'
    }
  } catch (error) {
    console.error('Council tax band fetch error:', error)
    return null
  }
}

// Estimate council tax band from postcode area statistics
function estimateCouncilTaxBand(postcode: string, outwardCode: string, council: string, region: string): string {
  const postcodeAreaBands: Record<string, string> = {
    // London areas
    'E1': 'C', 'E15': 'B',
    'W1': 'H', 'SW1': 'H', 'SE1': 'E', 'N1': 'D', 'NW1': 'E',
    // Manchester area
    'M1': 'D', 'M2': 'E',
    // Birmingham area
    'B1': 'D', 'B15': 'E',
    // Other major areas
    'LS1': 'E', 'L1': 'D', 'BS1': 'E'
  }

  if (outwardCode && postcodeAreaBands[outwardCode]) {
    return postcodeAreaBands[outwardCode]
  }

  // Fallback to regional estimate
  const regionBands: Record<string, string> = {
    'London': 'D',
    'Greater Manchester': 'D',
    'South East': 'E',
    'East Anglia': 'D'
  }

  if (region && regionBands[region]) {
    return regionBands[region]
  }

  return 'D' // Safe default
}

// Scrape SpareRoom for rental valuation
async function fetchSpareRoomValuation(postcode: string, property_type: string): Promise<any> {
  try {
    // SpareRoom postcode search - basic approach
    // Note: This is web scraping; graceful fallback if it fails
    const encoded = encodeURIComponent(postcode)
    const searchUrl = `https://www.spareroom.co.uk/flatshare/?postcode=${encoded}&location_type=postcode&radius=1&search_method=location`

    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!res.ok) {
      console.warn('SpareRoom fetch failed, gracefully degrading')
      return null
    }

    const html = await res.text()

    // Simple regex to extract price from listing - adjust based on actual HTML structure
    const priceMatch = html.match(/£(\d+)\s*(?:pcm|per month)/i)
    if (!priceMatch) return null

    const price = parseInt(priceMatch[1])

    // Rough validation - if price seems reasonable
    if (price > 300 && price < 5000) {
      return {
        single_let_rental_value: price,
        valuation_source: 'spareroom'
      }
    }

    return null
  } catch (error) {
    console.error('SpareRoom scrape error (gracefully degrading):', error)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { property_id, fields_to_refresh } = (await req.json()) as RefreshRequest

    if (!property_id || !fields_to_refresh?.length) {
      return NextResponse.json(
        { error: 'Missing property_id or fields_to_refresh' },
        { status: 400 }
      )
    }

    // Use service role for admin operations
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    const supabase = createClient({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      supabaseKey: serviceKey
    })

    // Fetch property with location data
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('id, name, address, lat, lng')
      .eq('id', property_id)
      .single()

    if (propError || !property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const postcode = property.address?.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i)?.[0]
    console.log('Extracted postcode:', postcode, 'from address:', property.address)
    if (!postcode) {
      return NextResponse.json(
        { error: 'Could not extract postcode from property address', address: property.address },
        { status: 400 }
      )
    }

    const refreshedData: any = {}
    const suggestions: any[] = []
    const errors: ApiError[] = []

    // Refresh requested fields in parallel
    const promises = []

    if (fields_to_refresh.includes('bins')) {
      promises.push(
        fetchBinDays(postcode).then(data => {
          if (data) {
            refreshedData.bins = data
            refreshedData.bin_schedule_last_fetched = new Date().toISOString()
            Object.entries(data).forEach(([key, value]) => {
              if (value) {
                suggestions.push({
                  property_id,
                  field_name: key,
                  original_value: null,
                  suggested_value: value as string,
                  suggested_by: 'waste.co.uk',
                  source_url: `https://www.binday.org.uk/?postcode=${postcode}`,
                  confidence_score: 0.95,
                  status: 'pending'
                })
              }
            })
          } else {
            errors.push({ field: 'bins', error: 'Failed to fetch from waste.co.uk' })
          }
        })
      )
    }

    if (fields_to_refresh.includes('gp')) {
      promises.push(
        fetchNearestGP(postcode).then(data => {
          if (data) {
            refreshedData.gp = data
            refreshedData.gp_data_last_fetched = new Date().toISOString()
            suggestions.push({
              property_id,
              field_name: 'nearest_gp_name',
              original_value: null,
              suggested_value: data.nearest_gp_name,
              suggested_by: 'nhs.uk',
              confidence_score: 0.9,
              status: 'pending'
            })
          } else {
            errors.push({ field: 'gp', error: 'Failed to fetch from NHS API' })
          }
        })
      )
    }

    if (fields_to_refresh.includes('police') && property.lat && property.lng) {
      promises.push(
        fetchPoliceForce(property.lat, property.lng).then(data => {
          if (data) {
            refreshedData.police = data
            suggestions.push({
              property_id,
              field_name: 'police_force_name',
              original_value: null,
              suggested_value: data.police_force_name,
              suggested_by: 'data.police.uk',
              confidence_score: 0.95,
              status: 'pending'
            })
          } else {
            errors.push({ field: 'police', error: 'Failed to fetch from UK Police API' })
          }
        })
      )
    }

    // Always fetch council tax band (useful context)
    promises.push(
      fetchCouncilTaxBand(postcode).then(data => {
        if (data && data.council_tax_band) {
          // Only store the band; council_name is not a database column
          refreshedData.council_tax_band = data.council_tax_band
          suggestions.push({
            property_id,
            field_name: 'council_tax_band',
            original_value: null,
            suggested_value: data.council_tax_band,
            suggested_by: 'postcodes.io',
            confidence_score: 0.8,
            status: 'pending'
          })
        }
      })
    )

    if (fields_to_refresh.includes('valuation')) {
      promises.push(
        fetchSpareRoomValuation(postcode, property.property_type || 'unknown').then(data => {
          if (data) {
            refreshedData.valuation = data
            refreshedData.valuation_last_updated = new Date().toISOString()
            suggestions.push({
              property_id,
              field_name: 'single_let_rental_value',
              original_value: null,
              suggested_value: data.single_let_rental_value.toString(),
              suggested_by: 'spareroom',
              source_url: `https://www.spareroom.co.uk/flatshare/?postcode=${postcode}`,
              confidence_score: 0.7, // Lower confidence for web scrape
              status: 'pending'
            })
          } else {
            // SpareRoom scrape is optional - graceful fallback
            console.warn('SpareRoom scrape failed or returned no data, continuing...')
          }
        })
      )
    }

    // Wait for all API calls
    await Promise.all(promises)

    // Flatten nested objects properly
    const flatData: any = { property_id }
    if (refreshedData.bins) {
      flatData.bin_black_day = refreshedData.bins.bin_black_day
      flatData.bin_blue_day = refreshedData.bins.bin_blue_day
      flatData.bin_green_day = refreshedData.bins.bin_green_day
      flatData.bin_food_day = refreshedData.bins.bin_food_day
      flatData.bin_schedule_last_fetched = refreshedData.bin_schedule_last_fetched
    }
    if (refreshedData.gp) {
      flatData.nearest_gp_name = refreshedData.gp.nearest_gp_name
      flatData.nearest_gp_address = refreshedData.gp.nearest_gp_address
      flatData.nearest_gp_phone = refreshedData.gp.nearest_gp_phone
      flatData.nearest_gp_postcode = refreshedData.gp.nearest_gp_postcode
      flatData.gp_data_last_fetched = refreshedData.gp_data_last_fetched
    }
    if (refreshedData.police) {
      flatData.police_force_name = refreshedData.police.police_force_name
      flatData.police_station_name = refreshedData.police.police_station_name
    }
    if (refreshedData.council_tax_band) {
      flatData.council_tax_band = refreshedData.council_tax_band
    }
    if (refreshedData.valuation) {
      flatData.single_let_rental_value = refreshedData.valuation.single_let_rental_value
      flatData.valuation_source = refreshedData.valuation.valuation_source
      flatData.valuation_last_updated = refreshedData.valuation_last_updated
    }
    flatData.data_last_synced = new Date().toISOString()

    const { error: upsertError } = await supabase
      .from('property_extended_details')
      .upsert(flatData, { onConflict: 'property_id' })

    if (upsertError) {
      console.error('Upsert error:', upsertError)
      console.error('Attempted data:', flatData)
      return NextResponse.json({
        error: 'Failed to save extended details',
        details: upsertError.message,
        code: upsertError.code
      }, { status: 500 })
    }

    // Insert suggestions as corrections
    if (suggestions.length > 0) {
      const { error: suggestionError } = await supabase
        .from('property_data_corrections')
        .insert(suggestions)

      if (suggestionError) {
        console.error('Suggestion insert error:', suggestionError)
        // Non-blocking - data was saved, just couldn't create suggestions
      }
    }

    return NextResponse.json({
      success: true,
      refreshed_fields: Object.keys(refreshedData),
      suggestions_created: suggestions.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (err) {
    console.error('Refresh error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

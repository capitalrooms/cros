// GET /api/admin/postcode-lookup?postcode=EC2A4NA
//
// Tier 1 (full address list): Property Insights API — free address autocomplete
//   Register at propertyinsights.co.uk and add PROPERTY_INSIGHTS_API_KEY to Vercel env vars.
//   Address autocomplete costs 0 credits; UPRN enrichment costs 35 credits.
//
// Tier 2 (town + county auto-fill only): postcodes.io — free, no key required.
//   Returns { mode: 'partial', town, county, postcode } — user still types street.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalisePostcode(raw: string) {
  return raw.replace(/\s+/g, '').toUpperCase()
}

// ── Property Insights (full address list, 0 credits) ─────────────────────────
async function lookupPropertyInsights(postcode: string): Promise<{ addresses: string[], ids: string[] } | null> {
  const key = process.env.PROPERTY_INSIGHTS_API_KEY
  if (!key) return null

  const url = `https://propertyinsights.co.uk/api/v1/address/autocomplete?query=${encodeURIComponent(postcode)}&api_key=${key}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null

  const json = await res.json()
  if (!json.success || !json.data?.length) return null

  const addresses: string[] = []
  const ids: string[] = []

  for (const item of json.data) {
    if (item.text) {
      // Convert "BUILDING NAME, STREET, TOWN, POSTCODE" from allcaps to Title Case
      const titled = item.text
        .split(',')
        .map((part: string) => part.trim().toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()))
        .join(', ')
      addresses.push(titled)
      ids.push(item.id ?? '')
    }
  }

  // Deduplicate
  const seen = new Set<string>()
  const uniqueAddresses: string[] = []
  const uniqueIds: string[] = []
  for (let i = 0; i < addresses.length; i++) {
    if (!seen.has(addresses[i])) {
      seen.add(addresses[i])
      uniqueAddresses.push(addresses[i])
      uniqueIds.push(ids[i])
    }
  }

  return { addresses: uniqueAddresses, ids: uniqueIds }
}

// ── postcodes.io fallback (town + county only, no individual addresses) ────────
async function lookupPostcodeIO(postcode: string) {
  const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`)
  if (!res.ok) return null
  const json = await res.json()
  if (json.status !== 200) return null
  const r = json.result
  return {
    postcode:   r.postcode as string,
    town:       (r.admin_district ?? r.region ?? '') as string,
    county:     (r.admin_county   ?? '') as string,
    region:     (r.region ?? '') as string,
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('postcode') ?? ''
  if (!raw.trim()) {
    return NextResponse.json({ error: 'postcode is required' }, { status: 400 })
  }

  const postcode = normalisePostcode(raw)

  try {
    // Try full address lookup first
    const result = await lookupPropertyInsights(postcode)
    if (result && result.addresses.length > 0) {
      return NextResponse.json({ mode: 'full', postcode, addresses: result.addresses, ids: result.ids })
    }

    // Fall back to partial (town/county only)
    const partial = await lookupPostcodeIO(postcode)
    if (!partial) {
      return NextResponse.json({ error: 'Postcode not found' }, { status: 404 })
    }
    return NextResponse.json({ mode: 'partial', ...partial, addresses: [], ids: [] })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/admin/postcode-lookup?postcode=EC2A4NA
//
// Returns all addresses at a UK postcode.
//
// Priority order (first configured key wins):
//
//  Tier 1a — OS DataHub Places API (free 500k/month)
//    Register at https://osdatahub.os.uk/ → add OSDATAHUB_API_KEY to Vercel env vars.
//    Returns full Royal Mail PAF + AddressBase dataset.
//
//  Tier 1b — getAddress.io (free 100/day; paid plans available)
//    Register at https://getaddress.io/ → add GETADDRESS_API_KEY to Vercel env vars.
//    Returns full Royal Mail PAF data.
//
//  Tier 2 — postcodes.io fallback (town + county only, no individual addresses)
//    Free, no key required. Returns { mode: 'partial', town, county, postcode }.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalisePostcode(raw: string) {
  return raw.replace(/\s+/g, '').toUpperCase()
}

function formatPostcode(normalised: string): string {
  // Insert the space back: "EC2A4NA" → "EC2A 4NA"
  return normalised.slice(0, -3) + ' ' + normalised.slice(-3)
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// ── Tier 1: Property Insights address autocomplete (uses existing key, free suggestions) ─
// `query` may be a normalised postcode (e.g. "EC2A4NA") or any free-text string (e.g. "12 Cedar")
async function lookupPropertyInsights(query: string): Promise<string[] | null> {
  const key = process.env.PROPERTY_INSIGHTS_API_KEY
  if (!key) return null

  // If query looks like a normalised postcode, format it; otherwise pass as-is
  const q = POSTCODE_RE.test(query.replace(/\s+/g, ''))
    ? formatPostcode(normalisePostcode(query))
    : query
  const url = `https://propertyinsights.co.uk/api/v1/address/autocomplete?query=${encodeURIComponent(q)}&limit=10`

  try {
    const res  = await fetch(url, { headers: { Accept: 'application/json', 'x-api-key': key } })
    if (!res.ok) return null
    const json = await res.json()

    const items: any[] = json.data ?? []
    if (!items.length) return null

    // The `text` field is "BUILDING, STREET, TOWN, CITY, POSTCODE" — pass through as-is
    // AddressInput will parse it into split fields on selection
    const addresses = items
      .map((a: any) => a.text as string)
      .filter(Boolean)
      .map(t => titleCase(t.replace(/,\s*/g, ', ')))

    return addresses.length ? addresses : null
  } catch {
    return null
  }
}

// ── Tier 2a: OS DataHub Places API ───────────────────────────────────────────
async function lookupOSDataHub(postcode: string): Promise<string[] | null> {
  const key = process.env.OSDATAHUB_API_KEY
  if (!key) return null

  const formatted = formatPostcode(postcode)
  const url = `https://api.os.uk/search/places/v1/postcode?postcode=${encodeURIComponent(formatted)}&maxresults=100&key=${key}`

  try {
    const res  = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const json = await res.json()

    const results: any[] = json.results ?? []
    if (!results.length) return null

    const addresses: string[] = []
    const seen = new Set<string>()

    for (const item of results) {
      const dpa = item.DPA ?? item.LPI
      if (!dpa) continue

      // Build a clean address from OS fields
      const parts: string[] = []
      if (dpa.SUB_BUILDING_NAME) parts.push(titleCase(dpa.SUB_BUILDING_NAME))
      if (dpa.BUILDING_NAME)     parts.push(titleCase(dpa.BUILDING_NAME))
      if (dpa.BUILDING_NUMBER)   parts.push(dpa.BUILDING_NUMBER)
      if (dpa.THOROUGHFARE_NAME) parts.push(titleCase(dpa.THOROUGHFARE_NAME))
      if (dpa.POST_TOWN)         parts.push(titleCase(dpa.POST_TOWN))
      if (dpa.POSTCODE)          parts.push(dpa.POSTCODE)

      const full = parts.join(', ')
      if (full && !seen.has(full)) {
        seen.add(full)
        addresses.push(full)
      }
    }

    return addresses.length ? addresses : null
  } catch {
    return null
  }
}

// ── Tier 1b: getAddress.io ────────────────────────────────────────────────────
async function lookupGetAddress(postcode: string): Promise<string[] | null> {
  const key = process.env.GETADDRESS_API_KEY
  if (!key) return null

  const formatted = formatPostcode(postcode)
  const url = `https://api.getaddress.io/find/${encodeURIComponent(formatted)}?api-key=${key}&expand=true`

  try {
    const res  = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const json = await res.json()

    const addresses: any[] = json.addresses ?? []
    if (!addresses.length) return null

    const seen = new Set<string>()
    const results: string[] = []

    for (const a of addresses) {
      // getAddress.io returns objects when expand=true
      const parts: string[] = []
      if (typeof a === 'string') {
        // non-expanded format: "line1, line2, ..., town, county, postcode"
        parts.push(...a.split(',').map((p: string) => p.trim()).filter(Boolean))
      } else {
        if (a.line_1)   parts.push(titleCase(a.line_1))
        if (a.line_2)   parts.push(titleCase(a.line_2))
        if (a.line_3)   parts.push(titleCase(a.line_3))
        if (a.line_4)   parts.push(titleCase(a.line_4))
        if (a.town_or_city) parts.push(titleCase(a.town_or_city))
        if (a.county)   parts.push(titleCase(a.county))
        parts.push(formatted)
      }

      const full = parts.filter(Boolean).join(', ')
      if (full && !seen.has(full)) {
        seen.add(full)
        results.push(full)
      }
    }

    return results.length ? results : null
  } catch {
    return null
  }
}

// ── Tier 2: postcodes.io fallback (town + county only) ───────────────────────
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
// Postcode regex — e.g. "EC2A4NA", "SW1A 1AA"
const POSTCODE_RE = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i

export async function GET(req: NextRequest) {
  // Accepts `?postcode=` (legacy) OR `?q=` (free-text autocomplete)
  const raw = (req.nextUrl.searchParams.get('postcode') ?? req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!raw) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const hasFullLookup = !!(process.env.PROPERTY_INSIGHTS_API_KEY || process.env.OSDATAHUB_API_KEY || process.env.GETADDRESS_API_KEY)
  const looksLikePostcode = POSTCODE_RE.test(raw.replace(/\s+/g, ''))

  try {
    // Tier 1 — Property Insights (free autocomplete, handles both postcodes and partial addresses)
    const piAddresses = await lookupPropertyInsights(looksLikePostcode ? normalisePostcode(raw) : raw)
    if (piAddresses?.length) {
      const pc = looksLikePostcode ? formatPostcode(normalisePostcode(raw)) : ''
      return NextResponse.json({ mode: 'full', postcode: pc, addresses: piAddresses, ids: [] })
    }

    // For free-text queries without a postcode, stop here — OS/getAddress only support postcode lookup
    if (!looksLikePostcode) {
      return NextResponse.json({ mode: 'none', addresses: [], ids: [] })
    }

    const postcode = normalisePostcode(raw)

    // Tier 2a — OS DataHub
    const osAddresses = await lookupOSDataHub(postcode)
    if (osAddresses?.length) {
      return NextResponse.json({ mode: 'full', postcode: formatPostcode(postcode), addresses: osAddresses, ids: [] })
    }

    // Tier 2b — getAddress.io
    const gaAddresses = await lookupGetAddress(postcode)
    if (gaAddresses?.length) {
      return NextResponse.json({ mode: 'full', postcode: formatPostcode(postcode), addresses: gaAddresses, ids: [] })
    }

    // Tier 2 — partial fallback (town + county only)
    const partial = await lookupPostcodeIO(postcode)
    if (!partial) {
      return NextResponse.json({ error: 'Postcode not found' }, { status: 404 })
    }
    return NextResponse.json({ mode: 'partial', hasFullLookup, ...partial, addresses: [], ids: [] })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

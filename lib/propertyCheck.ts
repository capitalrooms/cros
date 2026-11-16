// Property check (16 Nov 2026, Harry: "a property search and get all possible data about a property we might want to
// buy or let but don't have a landlord for"). One address → one report, gathered in parallel:
//   · the area: postcodes.io (borough, ward, lat/lng)
//   · the building: Property Insights — EPC (rating, floor area, habitable rooms, type, age), council tax, flood risk,
//     broadband, planning constraints (Article 4 · conservation area · listed building), crime, schools (1 credit each)
//   · money: Land Registry price paid on the street (free), our Market data (ONS rents, UK HPI, our own room rents)
//   · getting about: TfL stations nearby (free)
//   · then Claude with web search: the council's HMO / selective licensing, and a short verdict with things to check
// Server-only. Every source is optional — a failure leaves that section empty and says so, never stops the report.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { areaPack } from '@/lib/rents/areaPack'
import { AI_MODEL_SMART } from '@/lib/ai-classify'

const PI = 'https://propertyinsights.co.uk/api/v1'
const timeout = (ms: number) => AbortSignal.timeout(ms)
async function json(url: string, ms = 15000) { const r = await fetch(url, { signal: timeout(ms), headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`${r.status}`); return r.json() }
const pi = async (path: string, postcode: string) => {
  const key = process.env.PROPERTY_INSIGHTS_API_KEY
  if (!key) throw new Error('no key')
  const j: any = await json(`${PI}${path}?postcode=${encodeURIComponent(postcode)}&api_key=${key}`, 20000)
  if (!j?.success) throw new Error(j?.error ?? 'failed')
  return j.data
}
const lr = (v: any) => Array.isArray(v) ? v[0]?._value ?? v[0] : v?.prefLabel?.[0]?._value ?? v?.label?.[0]?._value ?? v

export interface PropertyReport {
  address: string; postcode: string; checkedAt: string
  area: { borough: string | null; boroughCode: string | null; ward: string | null; lat: number | null; lng: number | null } | null
  epc: { rating: string | null; potential: string | null; floorArea: number | null; rooms: number | null; type: string | null; built: string | null; date: string | null; matched: string | null } | null
  councilTax: { authority: string | null; bands: any; year: string | null } | null
  flood: { overall: string | null; riverSea: string | null; surface: string | null } | null
  broadband: { down: number | null; up: number | null; ultrafast: boolean | null } | null
  planning: { article4: boolean; conservation: boolean; listed: boolean; constraints: string[] } | null
  crime: { month: string | null; total: number | null; top: { category: string; count: number }[] } | null
  schools: { name: string; phase: string; ofsted: string | null; distanceKm: number | null }[]
  sales: { date: string; price: number; address: string; type: string; tenure: string }[]
  stations: { name: string; modes: string; walkMins: number }[]
  market: { rentAll: number | null; rentByBeds: Record<string, number | null>; avgPrice: number | null; flatPrice: number | null; terracedPrice: number | null; ourRoomMedian: number | null; ourEnsuiteMedian: number | null; yieldWhole: number | null } | null
  estimate: { bedrooms: number | null; wholeRent: number | null; roomsRent: number | null; price: number | null; yieldWhole: number | null; yieldRooms: number | null; note: string } | null
  verdict: string | null; sources: { url: string; title: string }[]
  missing: string[]
  /** every source's full answer, kept as it came (16 Nov 2026, Harry: "do not waste data and lose it because you dont have fields for it") — later reports can use any of it */
  raw: Record<string, unknown>
}

/** The best EPC for this address out of the postcode's list: house number + street, newest first. */
function pickEpc(results: any[], address: string) {
  const want = address.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const num = want.find(w => /^\d+[a-z]?$/.test(w))
  const scored = results.map(r => {
    const a = `${r.address1 ?? ''} ${r.address2 ?? ''} ${r.address ?? ''}`.toLowerCase()
    let score = 0
    if (num && new RegExp(`\\b${num}\\b`).test(a)) score += 5
    for (const w of want) if (w.length > 3 && a.includes(w)) score += 1
    return { r, score, a }
  }).sort((x, y) => y.score - x.score || String(y.r['lodgement-date'] ?? '').localeCompare(String(x.r['lodgement-date'] ?? '')))
  return scored[0] && scored[0].score >= (num ? 5 : 1) ? scored[0] : null
}

export async function checkProperty(s: SupabaseClient, input: { address: string; postcode: string }): Promise<PropertyReport> {
  const postcode = input.postcode.replace(/\s+/g, '').toUpperCase()
  const pretty = postcode.replace(/(\w+)(\w{3})$/, '$1 $2')
  const missing: string[] = []
  const note = (what: string) => (e: unknown) => { missing.push(`${what} (${e instanceof Error ? e.message : 'unavailable'})`); return null }

  const pc: any = await json(`https://api.postcodes.io/postcodes/${postcode}`).then(j => j.result).catch(note('postcode details'))
  const lat = pc?.latitude ?? null, lng = pc?.longitude ?? null
  const street = (() => { const first = input.address.split(',')[0] ?? ''; const m = first.replace(/^(flat|apartment|room|unit)\s+\w+\s*/i, '').replace(/^\d+[a-z]?\s+/i, '').trim(); return m || null })()

  const [epcRaw, ctRaw, floodRaw, bbRaw, planRaw, crimeRaw, schoolsRaw, salesRaw, tflRaw, pack, envRaw, areaSoldRaw, areaPricesRaw, soldRaw] = await Promise.all([
    pi('/epc/search', postcode).catch(note('EPC')),
    pi('/council-tax/lookup', postcode).catch(note('council tax')),
    pi('/property/flood-risk', postcode).catch(note('flood risk')),
    pi('/connectivity/broadband', postcode).catch(note('broadband')),
    pi('/planning/constraints', postcode).catch(note('planning')),
    pi('/crime/by-postcode', postcode).catch(note('crime')),
    pi('/schools/search', postcode).catch(note('schools')),
    street ? json(`https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.street=${encodeURIComponent(street.toUpperCase())}&propertyAddress.district=${encodeURIComponent(String(pc?.admin_district ?? '').toUpperCase())}&_pageSize=25&_sort=-transactionDate`, 20000).catch(note('Land Registry sales')) : Promise.resolve(null),
    lat != null ? json(`https://api.tfl.gov.uk/StopPoint/?lat=${lat}&lon=${lng}&stopTypes=NaptanMetroStation,NaptanRailStation&radius=1500&modes=tube,dlr,overground,elizabeth-line,national-rail`, 15000).catch(note('TfL stations')) : Promise.resolve(null),
    pc?.codes?.admin_district ? areaPack(s, pc.codes.admin_district).catch(note('market figures')) : Promise.resolve(null),
    pi('/property/environmental-risk', postcode).catch(note('environmental risk')),
    pi('/area/sold-prices', postcode).catch(note('area sold prices')),
    pi('/area/prices', postcode).catch(() => null),
    pi('/property/sold-prices', postcode).catch(() => null),
  ])

  const epcHit = epcRaw?.results?.length ? pickEpc(epcRaw.results, input.address) : null
  const e = epcHit?.r
  const epc = e ? {
    rating: e['current-energy-rating'] ?? null, potential: e['potential-energy-rating'] ?? null,
    floorArea: e['total-floor-area'] ? Number(e['total-floor-area']) : null, rooms: e['number-habitable-rooms'] ? Number(e['number-habitable-rooms']) : null,
    type: [e['property-type'], e['built-form']].filter(Boolean).join(', ') || null, built: e['construction-age-band'] ?? null,
    date: e['lodgement-date'] ?? null, matched: [e.address1, e.address2].filter(Boolean).join(', ') || null,
  } : null
  if (epcRaw && !epc) missing.push('EPC (none found for this exact address)')

  const constraints: any[] = planRaw?.constraints ?? []
  const ds = constraints.map(c => String(c.dataset ?? ''))
  const planning = planRaw ? { article4: ds.some(d => d.includes('article-4')), conservation: ds.some(d => d.includes('conservation')), listed: ds.some(d => d.includes('listed-building')), constraints: [...new Set(constraints.map(c => String(c.name ?? c.dataset ?? '').trim()).filter(Boolean))].slice(0, 12) } : null

  const sales = ((salesRaw?.result?.items ?? []) as any[]).map(it => ({
    date: new Date(it.transactionDate).toISOString().slice(0, 10), price: Number(it.pricePaid),
    address: [it.propertyAddress?.saon, it.propertyAddress?.paon, it.propertyAddress?.street].filter(Boolean).join(' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
    type: String(lr(it.propertyType) ?? '').replace(/-/g, ' / '), tenure: String(lr(it.estateType) ?? ''),
  })).filter(x => x.price > 0)

  const stations = ((tflRaw?.stopPoints ?? []) as any[]).map(p => ({ name: String(p.commonName).replace(/ (Underground|DLR|Rail) Station$/, ''), modes: (p.modes ?? []).join(', '), walkMins: Math.round((p.distance ?? 0) / 80) }))
    .filter((x, i, a) => a.findIndex(y => y.name === x.name) === i).slice(0, 5)

  const r = pack?.rents ?? null
  const market = pack ? {
    rentAll: r?.rent_all ?? null, rentByBeds: { '1': r?.rent_1 ?? null, '2': r?.rent_2 ?? null, '3': r?.rent_3 ?? null, '4+': r?.rent_4 ?? null },
    avgPrice: pack.sales?.average ?? null, flatPrice: pack.sales?.flat ?? null, terracedPrice: pack.sales?.terraced ?? null,
    ourRoomMedian: pack.ours?.roomMedian ?? null, ourEnsuiteMedian: pack.ours?.ensuiteMedian ?? null, yieldWhole: pack.yieldAll ?? null,
  } : null

  // a rough estimate: bedrooms from the EPC's habitable rooms (less one for a living room), rent as a whole let
  // (ONS by bedrooms) and as rooms (our own typical room rent), price from this address's last sale or the area average
  const isFlat = /flat|maisonette/i.test(epc?.type ?? '')
  const bedrooms = epc?.rooms ? Math.max(1, epc.rooms - 1) : null
  const wholeRent = bedrooms && market ? ((market.rentByBeds as Record<string, number | null>)[bedrooms >= 4 ? '4+' : String(bedrooms)] ?? market.rentAll) : market?.rentAll ?? null
  const roomsRent = bedrooms && market?.ourRoomMedian ? Math.round(bedrooms * market.ourRoomMedian) : null
  const num = input.address.match(/\b\d+[a-z]?\b/i)?.[0]?.toLowerCase()
  const lastHere = num ? sales.find(x => new RegExp(`\\b${num}\\b`, 'i').test(x.address)) : undefined
  const price = lastHere?.price ?? (isFlat ? market?.flatPrice : market?.terracedPrice) ?? market?.avgPrice ?? null
  const y = (rent: number | null) => rent && price ? Math.round(rent * 12 / price * 1000) / 10 : null
  const estimate = market || epc ? { bedrooms, wholeRent, roomsRent, price, yieldWhole: y(wholeRent), yieldRooms: y(roomsRent),
    note: `${lastHere ? `Price: what this address last sold for (${lastHere.date.slice(0, 4)}), not today’s value.` : 'Price: the area average for this type of home.'} Rooms: ${bedrooms ?? '?'} bedrooms × our typical room rent there — before bills, licensing and works.` } : null

  const report: PropertyReport = {
    address: input.address, postcode: pretty, checkedAt: new Date().toISOString(),
    area: pc ? { borough: pc.admin_district ?? null, boroughCode: pc.codes?.admin_district ?? null, ward: pc.admin_ward ?? null, lat, lng } : null,
    epc, councilTax: ctRaw ? { authority: ctRaw.authority ?? null, bands: ctRaw.councilTaxBands ?? null, year: ctRaw.taxYear ?? null } : null,
    flood: floodRaw ? { overall: floodRaw.riskLevel ?? null, riverSea: floodRaw.risks?.riverAndSea?.riskLevel ?? null, surface: floodRaw.risks?.surfaceWater?.riskLevel ?? null } : null,
    broadband: bbRaw?.broadband ? { down: bbRaw.broadband.maxDownloadMbps ?? null, up: bbRaw.broadband.maxUploadMbps ?? null, ultrafast: bbRaw.broadband.ultrafast?.available ?? null } : null,
    planning,
    crime: crimeRaw ? { month: crimeRaw.referenceMonth ?? null, total: crimeRaw.monthlyTotals?.[crimeRaw.referenceMonth] ?? null, top: ((crimeRaw.crimeCategories ?? []) as any[]).slice(0, 4).map(c => ({ category: String(c.category).replace(/-/g, ' '), count: c.count })) } : null,
    schools: ((schoolsRaw?.schools ?? []) as any[]).slice(0, 4).map(x => ({ name: x.name, phase: x.phase, ofsted: x.ofstedRating ?? null, distanceKm: x.distance ?? null })),
    sales: sales.slice(0, 10), stations, market, estimate, verdict: null, sources: [], missing,
    raw: { postcode: pc, epc: epcRaw, councilTax: ctRaw, flood: floodRaw, broadband: bbRaw, planning: planRaw, crime: crimeRaw, schools: schoolsRaw, landRegistrySales: salesRaw?.result?.items ?? null, tflStations: tflRaw?.stopPoints ?? null, areaPack: pack, environmentalRisk: envRaw, areaSoldPrices: areaSoldRaw, areaPrices: areaPricesRaw, soldPrices: soldRaw },
  }
  const v = await verdict(report).catch(() => null)
  if (v) { report.verdict = v.text; report.sources = v.sources }
  else missing.push('the written verdict')
  return report
}

/** Claude with web search: the council's licensing, and a short verdict for a lettings agent thinking of taking it on. */
async function verdict(rep: PropertyReport): Promise<{ text: string; sources: { url: string; title: string }[] } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const facts = JSON.stringify({ ...rep, raw: undefined, environmentalRisk: rep.raw?.environmentalRisk, verdict: undefined, sources: undefined, schools: rep.schools.map(x => `${x.name} (${x.ofsted ?? 'no rating'})`) })
  const prompt = `You are helping Capital Rooms, an independent London letting agent that manages HMOs (shared houses let by the room), single lets and let-only, decide about a property they don't yet manage or might buy.

The facts gathered (JSON — never invent a figure that isn't here):
${facts}

Use web search for ONE thing the facts don't have: the ${rep.area?.borough ?? 'local'} council's property licensing right now — mandatory HMO (5+ people, 2+ households), any ADDITIONAL HMO licensing (3–4 people), any SELECTIVE licensing for single lets — whether this address's area is covered, and the fee if easy to find. Also confirm whether there's an Article 4 direction removing permitted development for small HMOs (C3→C4) in this area.

Write, in British English, plain and short (under 280 words):
## The short answer
Two or three sentences: is this worth a closer look as an HMO, a single let, or neither — and why.
## Licensing and planning
- bullets: what licence(s) it would need, Article 4, conservation/listed if relevant.
## The numbers
- bullets using ONLY the estimate/market figures given (say they're rough).
## Check before going further
- 3–5 bullets: practical things to check (title and lease, room sizes against HMO minimums, fire safety, EPC E minimum, flood, etc.) — only those that matter for THIS property.
Use "## " headings and "- " bullets. No tables.`
  const client = new Anthropic()
  const run = (tools: boolean) => client.messages.create({
    model: AI_MODEL_SMART, max_tokens: 1600,
    ...(tools ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'GB', city: 'London' } } as any] } : {}),
    messages: [{ role: 'user', content: prompt }],
  })
  let res
  try { res = await run(true) } catch { res = await run(false) }
  const blocks = res.content as any[]
  const text = blocks.filter(x => x.type === 'text').map(x => x.text).join('').trim()
  const sources = [...new Map(blocks.filter(x => x.type === 'text').flatMap(x => (x.citations ?? []) as any[]).filter(c => c.url).map(c => [c.url, { url: c.url, title: c.title ?? c.url }])).values()].slice(0, 6)
  return text ? { text, sources } : null
}

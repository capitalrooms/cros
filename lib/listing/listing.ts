// A room's listing (17 Oct 2026, Harry: "a marketing view of that room — photos and stuff you would want to have as
// someone in lettings … send it out as a link … videos of the room so we don't have to share videos via WhatsApp").
// One shape for the lettings/office view (/lettings/listing/[roomId]) and the public share page (/l/[roomId]/[token]).
// The public page never shows the full address — the display name and the postcode district only.
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ListingMedia { id: string; url: string; kind: 'photo' | 'video'; caption: string | null; ofRoom: boolean }
export interface Listing {
  roomId: string; propertyId: string
  roomName: string; displayName: string; fullAddress: string; area: string
  rent: number | null; available: string | null; billsIncluded: boolean | null
  wholeLet: boolean; letOnly: boolean
  features: string[]; description: string
  media: ListingMedia[]
  // from the listing record (migration 227) when there is one
  headline: string | null; displayAddress: string | null; deposit: number | null; holdingDeposit: number | null
  councilTax: string | null; status: string | null; minTermMonths: number | null; rentFrequency: 'pcm' | 'pw'
  // filled in from the house and room records, so a listing is full before anyone writes a word (17 Oct 2026)
  facts: ListingFacts
  /** the map position rounded to about 100 m — the area, never the door */
  approx: { lat: number; lng: number } | null
}
export interface ListingFacts {
  bedrooms: number | null; bathrooms: number | null; roomsInHouse: number; housemates: number
  roomType: string | null; roomSize: number | null; ensuite: boolean | null; livingRoom: boolean | null; whereInHouse: string | null
  furnished: string | null; epc: string | null; council: string | null; hmoLicensed: boolean
  councilTaxBand: string | null; broadband: string | null; gas: boolean | null; propertyType: string
}

const district = (pc: string | null | undefined) => String(pc ?? '').trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)/)?.[1] ?? ''

/** the token in a share link — stateless, can't be guessed, the same each time for a room */
export const listingToken = (roomId: string) => crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'listing').update(`listing:${roomId}`).digest('hex').slice(0, 20)
export const listingPath = (roomId: string) => `/l/${roomId}/${listingToken(roomId)}`

export async function loadListing(s: SupabaseClient, roomId: string): Promise<Listing | null> {
  const { data: room } = await s.from('rooms').select('id, property_id, name, description, marketing_description, current_asking_rent, available_date, has_ensuite, has_shared_bathroom, has_lounge, room_size, features, furnishings_description, is_let_only')
    .eq('id', roomId).maybeSingle()
  if (!room) return null
  const r: any = room
  const { data: prop } = await s.from('properties').select('id, name, address, postcode, description, bills_included, property_type, letting_type, bedrooms, bathrooms, communal_bathrooms, furnished_status, epc_rating, council_name, license_number, license_expiry, has_gas, lat, lng').eq('id', r.property_id).maybeSingle()
  const p: any = prop ?? {}
  const { data: photos } = await s.from('property_photos').select('id, file_path, file_url, file_type, caption, room_id, is_marketing, display_order, created_at')
    .eq('property_id', r.property_id).order('display_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
  const url = (x: any) => x.file_url || s.storage.from('property-photos').getPublicUrl(String(x.file_path).replace(/^property-photos\//, 'property-photos/')).data.publicUrl
  const mine = ((photos ?? []) as any[]).filter(x => x.room_id === roomId)
  // the rest of the house: photos not of another room (marketing ones first)
  const house = ((photos ?? []) as any[]).filter(x => !x.room_id).sort((a, b) => Number(!!b.is_marketing) - Number(!!a.is_marketing))
  const media: ListingMedia[] = [...mine, ...house].map(x => ({ id: x.id, url: url(x), kind: String(x.file_type ?? '').startsWith('video') || /\.(mp4|mov|webm|m4v)$/i.test(String(x.file_path)) ? 'video' : 'photo', caption: x.caption ?? null, ofRoom: x.room_id === roomId }))

  const features: string[] = []
  if (r.has_ensuite) features.push('En-suite bathroom'); else if (r.has_shared_bathroom) features.push('Shared bathroom')
  if (r.room_size) features.push(`${r.room_size} m²`)
  if (r.has_lounge) features.push('Shared lounge')
  if (p.bills_included) features.push('Bills included')
  if (Array.isArray(r.features)) for (const f of r.features) if (typeof f === 'string' && f.trim()) features.push(f.trim())
  if (r.furnishings_description) features.push(String(r.furnishings_description))

  const wholeLet = !/hmo/i.test(String(p.property_type ?? 'hmo'))

  // the house as it is: its rooms, who lives there now, and what the records say (council tax and broadband from the
  // council / Ofcom look-ups when they've been run)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const [{ data: houseRooms }, { data: lets }, { data: ext }] = await Promise.all([
    s.from('rooms').select('id').eq('property_id', r.property_id),
    s.from('tenancies').select('room_id, start_date, end_date, let_cancelled_at').eq('property_id', r.property_id).lte('start_date', today),
    s.from('property_extended_details').select('council_tax_band, broadband_max_download_mbps').eq('property_id', r.property_id).maybeSingle(),
  ])
  const housemates = new Set(((lets ?? []) as any[]).filter(t => !t.let_cancelled_at && (!t.end_date || t.end_date >= today) && t.room_id !== roomId).map(t => t.room_id)).size
  const furnishedWords: Record<string, string> = { furnished: 'Furnished', part_furnished: 'Part furnished', part: 'Part furnished', unfurnished: 'Unfurnished' }
  const facts: ListingFacts = {
    bedrooms: p.bedrooms ? Number(p.bedrooms) : ((houseRooms ?? []).length || null),
    bathrooms: p.bathrooms ? Number(p.bathrooms) : p.communal_bathrooms ? Number(p.communal_bathrooms) : null,
    roomsInHouse: (houseRooms ?? []).length, housemates,
    roomType: r.room_type ? String(r.room_type).replace(/_/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase()) : null,
    roomSize: r.room_size ? Number(r.room_size) : null, ensuite: r.has_ensuite ?? null, livingRoom: r.has_lounge ?? null,
    whereInHouse: r.location_in_house ?? null,
    furnished: p.furnished_status ? furnishedWords[String(p.furnished_status)] ?? String(p.furnished_status) : null,
    epc: p.epc_rating ? String(p.epc_rating).toUpperCase() : null, council: p.council_name ?? null,
    hmoLicensed: !!p.license_number && (!p.license_expiry || String(p.license_expiry) >= today),
    councilTaxBand: (ext as any)?.council_tax_band ?? null,
    broadband: (ext as any)?.broadband_max_download_mbps ? `Up to ${(ext as any).broadband_max_download_mbps} Mbps` : null,
    gas: p.has_gas ?? null,
    propertyType: wholeLet ? 'Whole home' : `${(houseRooms ?? []).length || p.bedrooms || ''}-bedroom house share`.replace(/^-/, ''),
  }
  const approx = p.lat != null && p.lng != null ? { lat: Math.round(Number(p.lat) * 1000) / 1000, lng: Math.round(Number(p.lng) * 1000) / 1000 } : null
  // the listing record, when one is open for this room — it's what was written for the advert, so it wins
  const { data: rec } = await s.from('listings').select('*').eq('room_id', roomId).in('status', ['draft', 'ready', 'live', 'let_agreed']).order('created_at', { ascending: false }).limit(1)
  const L: any = rec?.[0] ?? null
  if (L) {
    const byId = new Map(media.map(m => [m.id, m]))
    const ordered = ((L.media_order ?? []) as string[]).map(id => byId.get(id)).filter(Boolean) as ListingMedia[]
    if (ordered.length) media.splice(0, media.length, ...ordered)
  }
  return {
    roomId, propertyId: r.property_id, roomName: r.name ?? 'Room',
    displayName: String(p.name || 'Room to rent').split('\n')[0],
    fullAddress: String(p.address ?? '').replace(/\s*\n\s*/g, ', '),
    area: [district(p.postcode), 'London'].filter(Boolean).join(', '),
    rent: L?.rent != null ? Number(L.rent) : r.current_asking_rent != null ? Number(r.current_asking_rent) : null,
    available: L?.available_from ?? r.available_date ?? null, billsIncluded: L?.bills_included ?? p.bills_included ?? null,
    wholeLet, letOnly: !!r.is_let_only || p.letting_type === 'let_only',
    features: L?.features?.length ? L.features : [...new Set(features)],
    description: String(L?.description || r.marketing_description || r.description || p.description || '').trim(),
    media,
    headline: L?.headline ?? null, displayAddress: L?.display_address ?? null,
    deposit: L?.deposit != null ? Number(L.deposit) : null, holdingDeposit: L?.holding_deposit != null ? Number(L.holding_deposit) : null,
    councilTax: L ? (L.council_tax_included ? 'Included in the rent' : L.council_tax_band ? `Band ${L.council_tax_band}` : null) : null,
    status: L?.status ?? null, minTermMonths: L?.min_term_months ?? null, rentFrequency: L?.rent_frequency === 'pw' ? 'pw' : 'pcm',
    facts: { ...facts, councilTaxBand: L?.council_tax_band ?? facts.councilTaxBand, broadband: L?.broadband ?? facts.broadband },
    approx,
  }
}

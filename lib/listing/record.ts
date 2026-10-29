// The listing record (migration 227; 17 Oct 2026). One per room — or per whole unit for a single let — per marketing
// period, in the shape portal feeds use. This file: the record's type, starting a draft from what CROS already knows,
// the checks that gate each step on the marketing board, and the move between steps.
//   draft → ready     Part A of the material information is complete (rent, deposit, council tax) + a headline,
//                     a description and at least one photo
//   ready → live      at least one channel is on (share link, website, a portal)
//   live → let_agreed taken down from every channel
//   → let / withdrawn closes it; the room can then have a new listing
import type { SupabaseClient } from '@supabase/supabase-js'

export type ListingStatus = 'draft' | 'ready' | 'live' | 'let_agreed' | 'let' | 'withdrawn'
export const CHANNELS = ['share', 'website', 'rightmove', 'zoopla', 'onthemarket', 'spareroom'] as const
export type Channel = typeof CHANNELS[number]
export const CHANNEL_LABEL: Record<Channel, string> = { share: 'Share link', website: 'Website', rightmove: 'Rightmove', zoopla: 'Zoopla', onthemarket: 'OnTheMarket', spareroom: 'SpareRoom' }
/** channels CROS can publish to today; the portals need their feed set up first */
export const CHANNEL_READY: Record<Channel, boolean> = { share: true, website: true, rightmove: false, zoopla: false, onthemarket: false, spareroom: false }

export interface ListingRecord {
  id: string; property_id: string; room_id: string | null; status: ListingStatus; agent_ref: string | null
  headline: string | null; summary: string | null; description: string | null; features: string[]
  rent: number | null; rent_frequency: 'pcm' | 'pw'; deposit: number | null; holding_deposit: number | null
  bills_included: boolean | null; council_tax_band: string | null; council_tax_included: boolean | null
  property_type: string | null; bedrooms: number | null; bathrooms: number | null; room_size_sqm: number | null
  ensuite: boolean | null; furnished: string | null; living_room: boolean | null; parking: string | null
  outside_space: string | null; heating: string | null; broadband: string | null; utilities: Record<string, string>
  available_from: string | null; min_term_months: number | null; max_term_months: number | null; let_type: string | null
  sharers_allowed: boolean | null; pets_allowed: boolean | null; smokers_allowed: boolean | null; tenant_type: string | null
  display_address: string | null; latitude: number | null; longitude: number | null; part_c: Record<string, string>
  media_order: string[]; floorplan_url: string | null; video_url: string | null; virtual_tour_url: string | null
  published_at: string | null; let_agreed_at: string | null; withdrawn_at: string | null; created_at: string; updated_at: string
}

/** fields the editor may change (never id, property, room, status, dates) */
export const EDITABLE = ['headline', 'summary', 'description', 'features', 'rent', 'rent_frequency', 'deposit', 'holding_deposit', 'bills_included',
  'council_tax_band', 'council_tax_included', 'property_type', 'bedrooms', 'bathrooms', 'room_size_sqm', 'ensuite', 'furnished', 'living_room',
  'parking', 'outside_space', 'heating', 'broadband', 'utilities', 'available_from', 'min_term_months', 'max_term_months', 'let_type',
  'sharers_allowed', 'pets_allowed', 'smokers_allowed', 'tenant_type', 'display_address', 'part_c', 'media_order', 'floorplan_url', 'video_url', 'virtual_tour_url'] as const

/** what's missing before the listing can be Ready (Part A first) */
export function missingForReady(l: Partial<ListingRecord>, photoCount: number): string[] {
  const m: string[] = []
  if (l.rent == null || Number(l.rent) <= 0) m.push('Rent')
  if (l.deposit == null) m.push('Deposit')
  if (!l.council_tax_band && l.council_tax_included == null) m.push('Council tax band (or "included")')
  if (!l.headline?.trim()) m.push('Headline')
  if (!l.description?.trim()) m.push('Description')
  if (!l.available_from) m.push('Available from')
  if (photoCount < 1) m.push('At least one photo')
  return m
}

/** "Flat 4, 44 Claverton Street, London, SW1V 3AU" → "Claverton Street, SW1V" — what the public may see */
export function displayAddressFrom(address: string | null | undefined, postcode: string | null | undefined): string {
  const parts = String(address ?? '').split(/\s*[,\n]\s*/).map(p => p.replace(/^(flat|apartment|unit|room)\s*\w+$/i, '').replace(/^\d+[a-z]?(\s+|$)/i, '').trim())
    .filter(p => p && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(p) && !/^london$/i.test(p))
  const district = String(postcode ?? '').trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)/)?.[1]
  return [parts[0], district].filter(Boolean).join(', ')
}

/** A new draft, filled from the room, its house and its photos — so most fields start right */
export async function draftFromRoom(s: SupabaseClient, roomId: string | null, propertyId: string, createdBy: string | null) {
  const { data: p } = await s.from('properties').select('id, name, address, postcode, property_type, bills_included, description, lat, lng').eq('id', propertyId).maybeSingle()
  const prop: any = p ?? {}
  const { data: r } = roomId ? await s.from('rooms').select('id, name, current_asking_rent, available_date, has_ensuite, has_lounge, room_size, marketing_description, description, features').eq('id', roomId).maybeSingle() : { data: null }
  const room: any = r ?? {}
  const { data: ext } = await s.from('property_extended_details').select('council_tax_band, broadband_max_download_mbps').eq('property_id', propertyId).maybeSingle()
  const { data: photos } = await s.from('property_photos').select('id, room_id, is_marketing, display_order, created_at').eq('property_id', propertyId)
    .order('display_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
  const ph = ((photos ?? []) as any[])
  const media = [...ph.filter(x => x.room_id === roomId), ...ph.filter(x => !x.room_id).sort((a, b) => Number(!!b.is_marketing) - Number(!!a.is_marketing))].map(x => x.id)
  const isHmo = !prop.property_type || /hmo/i.test(String(prop.property_type))
  const rent = room.current_asking_rent != null ? Number(room.current_asking_rent) : null
  const { count } = await s.from('listings').select('id', { count: 'exact', head: true })
  return {
    property_id: propertyId, room_id: roomId, status: 'draft' as const, agent_ref: `CR-${String((count ?? 0) + 1).padStart(5, '0')}`,
    headline: roomId ? `${room.has_ensuite ? 'En-suite double room' : 'Double room'} on ${displayAddressFrom([prop.name, prop.address].filter(Boolean).join(', '), prop.postcode).split(',')[0] || 'London'}` : null,
    description: String(room.marketing_description || room.description || prop.description || '').trim() || null,
    features: Array.isArray(room.features) ? room.features.filter((f: unknown) => typeof f === 'string').slice(0, 10) : [],
    rent, rent_frequency: 'pcm' as const,
    ...(rent ? depositsFor(rent) : { deposit: null, holding_deposit: null }),   // 5 weeks' / 1 week's rent — the most allowed
    bills_included: prop.bills_included ?? null,
    council_tax_band: (ext as any)?.council_tax_band ?? null, council_tax_included: isHmo && roomId ? true : null,
    property_type: roomId ? (isHmo ? 'house_share' : 'flat_share') : null,
    room_size_sqm: room.room_size ?? null, ensuite: room.has_ensuite ?? null, living_room: room.has_lounge ?? null,
    broadband: (ext as any)?.broadband_max_download_mbps ? `Up to ${(ext as any).broadband_max_download_mbps} Mbps` : null,
    available_from: room.available_date ?? null, let_type: 'long', sharers_allowed: roomId ? true : null, tenant_type: 'Professionals',
    // the house's name first ("12 Saltwell Street"), then its address — some addresses on file leave out the street
    display_address: displayAddressFrom([prop.name, prop.address].filter(Boolean).join(', '), prop.postcode) || null,
    latitude: prop.lat ?? null, longitude: prop.lng ?? null,
    media_order: media, created_by: createdBy,
  }
}

/** deposit and holding deposit from the rent, the most the Tenant Fees Act allows: 5 weeks' and 1 week's rent */
export function depositsFor(rent: number, frequency: 'pcm' | 'pw' = 'pcm') {
  const weekly = frequency === 'pw' ? rent : rent * 12 / 52
  return { deposit: Math.round(weekly * 5 * 100) / 100, holding_deposit: Math.round(weekly * 100) / 100 }
}

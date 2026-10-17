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
  const { data: prop } = await s.from('properties').select('id, name, address, postcode, description, bills_included, property_type, letting_type').eq('id', r.property_id).maybeSingle()
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
  return {
    roomId, propertyId: r.property_id, roomName: r.name ?? 'Room',
    displayName: String(p.name || 'Room to rent').split('\n')[0],
    fullAddress: String(p.address ?? '').replace(/\s*\n\s*/g, ', '),
    area: [district(p.postcode), 'London'].filter(Boolean).join(', '),
    rent: r.current_asking_rent != null ? Number(r.current_asking_rent) : null,
    available: r.available_date ?? null, billsIncluded: p.bills_included ?? null,
    wholeLet, letOnly: !!r.is_let_only || p.letting_type === 'let_only',
    features: [...new Set(features)],
    description: String(r.marketing_description || r.description || p.description || '').trim(),
    media,
  }
}

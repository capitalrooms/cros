// What CROS already knows about a room or property, in listing terms (9 Nov 2026, Harry: "the marketing side for rooms
// links to data already on file for the rooms and pulls things correctly when a unit within a house"). Used when a
// listing is made, and by "Fill the gaps" — which only ever fills blanks. Server only.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isWholeLet } from '@/lib/lettings/letWording'

const FURNISHED: Record<string, string> = { furnished: 'furnished', fully_furnished: 'furnished', part_furnished: 'part', part: 'part', unfurnished: 'unfurnished' }
const num = (v: unknown) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null }

export async function fromRecord(s: SupabaseClient, roomId: string | null, propertyId: string): Promise<Record<string, unknown>> {
  const [{ data: p }, { data: r }, { data: ext }, { data: houseRooms }] = await Promise.all([
    s.from('properties').select('name, property_type, bedrooms, bathrooms, communal_bathrooms, furnished_status, council_tax_band, total_area, bills_included').eq('id', propertyId).maybeSingle(),
    roomId ? s.from('rooms').select('name, room_size, has_ensuite, has_lounge, has_shared_bathroom').eq('id', roomId).maybeSingle() : Promise.resolve({ data: null }),
    s.from('property_extended_details').select('council_tax_band, broadband_max_download_mbps, broadband_ultrafast, broadband_superfast, epc_floor_area_sqm, epc_property_type, flood_risk_level, planning_has_conservation_area, planning_has_listed_building, planning_has_article4').eq('property_id', propertyId).maybeSingle(),
    s.from('rooms').select('id').eq('property_id', propertyId),
  ]) as any[]
  if (!p) return {}
  const whole = isWholeLet(p.property_type, r?.name)
  const out: Record<string, unknown> = {}
  const put = (k: string, v: unknown) => { if (v != null && v !== '') out[k] = v }

  // the home
  if (whole) {
    put('bedrooms', p.bedrooms != null && p.bedrooms !== '' ? Number(p.bedrooms) : null)
    put('bathrooms', num(p.bathrooms))
    put('room_size_sqm', num(p.total_area) ?? num(ext?.epc_floor_area_sqm))
    const epcType = String(ext?.epc_property_type ?? '').toLowerCase()
    put('property_type', Number(p.bedrooms) === 0 ? 'studio' : /maisonette/.test(epcType) ? 'maisonette' : /house|bungalow/.test(epcType) ? 'house' : /flat/.test(epcType) ? 'flat' : null)
  } else {
    // a room in a house: the house's bedrooms and bathrooms, the room's own size and en-suite
    put('bedrooms', (houseRooms ?? []).length || num(p.bedrooms))
    put('bathrooms', num(p.communal_bathrooms) ?? num(p.bathrooms))
    put('room_size_sqm', num(r?.room_size))
    if (r?.has_ensuite != null) put('ensuite', !!r.has_ensuite)
    if (r?.has_lounge != null) put('living_room', !!r.has_lounge)
  }
  put('furnished', FURNISHED[String(p.furnished_status ?? '').toLowerCase()] ?? null)
  put('council_tax_band', ext?.council_tax_band ?? p.council_tax_band ?? null)
  if (p.bills_included != null) put('bills_included', !!p.bills_included)
  const mbps = num(ext?.broadband_max_download_mbps)
  put('broadband', mbps ? `${ext?.broadband_ultrafast ? 'Ultrafast' : ext?.broadband_superfast ? 'Superfast' : 'Broadband'} — up to ${Math.round(mbps)} Mbps` : null)

  // material information part C, only where the look-ups found something
  const partC: Record<string, string> = {}
  if (/high|medium/i.test(String(ext?.flood_risk_level ?? ''))) partC.flood = `${String(ext.flood_risk_level).replace(/^\w/, (c: string) => c.toUpperCase())} flood risk (Environment Agency)`
  const restr = [ext?.planning_has_listed_building ? 'Listed building' : '', ext?.planning_has_conservation_area ? 'Conservation area' : '', ext?.planning_has_article4 ? 'Article 4 direction' : ''].filter(Boolean)
  if (restr.length) partC.restrictions = restr.join(', ')
  if (Object.keys(partC).length) out.part_c = partC
  return out
}

/** only the blanks of a listing, from the record */
export function blanksFrom(listing: Record<string, any>, rec: Record<string, unknown>) {
  const fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'part_c') {
      const cur = listing.part_c ?? {}, add: Record<string, string> = {}
      for (const [ck, cv] of Object.entries(v as Record<string, string>)) if (!String(cur[ck] ?? '').trim()) add[ck] = cv
      if (Object.keys(add).length) fields.part_c = { ...cur, ...add }
    } else if (listing[k] == null || listing[k] === '') fields[k] = v
  }
  return fields
}

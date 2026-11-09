// Homes on the website (9 Nov 2026): rooms ticked "Show on website" in CROS that are free now or coming up — a few
// public facts and one photo each, linking to the room's public listing page. Server only.
import { createServiceClient } from '@/lib/supabase'
import { isWholeLet, oneLine } from '@/lib/lettings/letWording'
import { listingPath } from '@/lib/listing/listing'
import { areaName } from '@/lib/website/londonMap'

export interface Home { id: string; title: string; area: string; rent: number | null; available: string | null; photo: string | null; href: string; whole: boolean
  /** for the map: rounded to the area (~400m), never the house; null when we can't place it */
  lat: number | null; lng: number | null; mapArea: string }

/** a postcode's centre, for houses with no location saved (postcodes.io, public; cached for a month) */
async function postcodePoint(pc: string | null | undefined): Promise<[number, number] | null> {
  const p = String(pc ?? '').trim()
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(p)) return null
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(p)}`, { next: { revalidate: 2592000 }, signal: AbortSignal.timeout(4000) })
    const d = r.ok ? await r.json() : null
    return d?.result?.latitude ? [d.result.latitude, d.result.longitude] : null
  } catch { return null }
}

export async function websiteHomes(): Promise<Home[]> {
  const s = createServiceClient() as any
  // on the website: rooms ticked "Show on website", and any live listing with its Website switch on (9 Nov 2026)
  const { data: liveWeb } = await s.from('listing_channels').select('listing_id, listings!inner(room_id, status)').eq('channel', 'website').eq('enabled', true).eq('listings.status', 'live')
  const webRoomIds = ((liveWeb ?? []) as any[]).map(x => x.listings?.room_id).filter(Boolean)
  const sel = 'id, name, property_id, current_asking_rent, available_date, status, show_on_website, properties(name, address, postcode, property_type, is_demo, lat, lng)'
  const [{ data: ticked }, { data: published }] = await Promise.all([
    s.from('rooms').select(sel).eq('show_on_website', true).in('status', ['available', 'on_notice']),
    webRoomIds.length ? s.from('rooms').select(sel).in('id', webRoomIds) : Promise.resolve({ data: [] }),
  ])
  const rooms = [...new Map([...((ticked ?? []) as any[]), ...((published ?? []) as any[])].map(r => [r.id, r])).values()]
  const list = ((rooms ?? []) as any[]).filter(r => !r.properties?.is_demo)
  if (!list.length) return []
  const ids = list.map(r => r.id)
  const [{ data: listings }, { data: photos }] = await Promise.all([
    s.from('listings').select('room_id, headline, rent, available_from, display_address, media_order, status').in('room_id', ids).in('status', ['draft', 'ready', 'live']),
    s.from('property_photos').select('id, room_id, property_id, file_url, file_path, display_order').in('property_id', [...new Set(list.map(r => r.property_id))]).order('display_order', { ascending: true, nullsFirst: false }),
  ])
  const url = (p: any) => p ? (p.file_url || s.storage.from('property-photos').getPublicUrl(String(p.file_path)).data.publicUrl) : null
  // where each house is (saved location, else its postcode's centre), rounded to the area
  const points = new Map<string, [number, number] | null>()
  await Promise.all([...new Set(list.map(r => r.property_id))].map(async pid => {
    const p = list.find(r => r.property_id === pid)?.properties
    points.set(pid, p?.lat && p?.lng ? [Number(p.lat), Number(p.lng)] : await postcodePoint(p?.postcode))
  }))
  return list.map(r => {
    const pt = points.get(r.property_id) ?? null
    const lat = pt ? Math.round(pt[0] / 0.004) * 0.004 : null, lng = pt ? Math.round(pt[1] / 0.006) * 0.006 : null
    const L = ((listings ?? []) as any[]).find(x => x.room_id === r.id)
    const ph = ((photos ?? []) as any[])
    const first = L?.media_order?.length ? ph.find(p => p.id === L.media_order[0]) : ph.find(p => p.room_id === r.id) ?? ph.find(p => p.property_id === r.property_id && !p.room_id)
    const whole = isWholeLet(r.properties?.property_type, r.name)
    const pc = String(r.properties?.postcode ?? '').split(' ')[0]
    return {
      id: r.id, whole, href: listingPath(r.id), lat, lng, mapArea: pt ? areaName(pt[0], pt[1], r.properties?.postcode ?? null) : '',
      title: L?.headline || (whole ? `${oneLine(r.properties?.name).split(',')[0]}` : `${r.name}, ${oneLine(r.properties?.name).split(',')[0]}`),
      area: L?.display_address || [oneLine(r.properties?.name).split(',').slice(-1)[0], pc].filter(Boolean).join(' '),
      rent: L?.rent ?? r.current_asking_rent ?? null, available: L?.available_from ?? r.available_date ?? null, photo: url(first),
    }
  }).sort((a, b) => String(a.available ?? '9999').localeCompare(String(b.available ?? '9999')))
}

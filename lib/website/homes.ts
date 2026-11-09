// Homes on the website (9 Nov 2026): rooms ticked "Show on website" in CROS that are free now or coming up — a few
// public facts and one photo each, linking to the room's public listing page. Server only.
import { createServiceClient } from '@/lib/supabase'
import { isWholeLet, oneLine } from '@/lib/lettings/letWording'
import { listingPath } from '@/lib/listing/listing'

export interface Home { id: string; title: string; area: string; rent: number | null; available: string | null; photo: string | null; href: string; whole: boolean }

export async function websiteHomes(): Promise<Home[]> {
  const s = createServiceClient() as any
  const { data: rooms } = await s.from('rooms').select('id, name, property_id, current_asking_rent, available_date, status, show_on_website, properties(name, address, postcode, property_type, is_demo)')
    .eq('show_on_website', true).in('status', ['available', 'on_notice'])
  const list = ((rooms ?? []) as any[]).filter(r => !r.properties?.is_demo)
  if (!list.length) return []
  const ids = list.map(r => r.id)
  const [{ data: listings }, { data: photos }] = await Promise.all([
    s.from('listings').select('room_id, headline, rent, available_from, display_address, media_order, status').in('room_id', ids).in('status', ['draft', 'ready', 'live']),
    s.from('property_photos').select('id, room_id, property_id, file_url, file_path, display_order').in('property_id', [...new Set(list.map(r => r.property_id))]).order('display_order', { ascending: true, nullsFirst: false }),
  ])
  const url = (p: any) => p ? (p.file_url || s.storage.from('property-photos').getPublicUrl(String(p.file_path)).data.publicUrl) : null
  return list.map(r => {
    const L = ((listings ?? []) as any[]).find(x => x.room_id === r.id)
    const ph = ((photos ?? []) as any[])
    const first = L?.media_order?.length ? ph.find(p => p.id === L.media_order[0]) : ph.find(p => p.room_id === r.id) ?? ph.find(p => p.property_id === r.property_id && !p.room_id)
    const whole = isWholeLet(r.properties?.property_type, r.name)
    const pc = String(r.properties?.postcode ?? '').split(' ')[0]
    return {
      id: r.id, whole, href: listingPath(r.id),
      title: L?.headline || (whole ? `${oneLine(r.properties?.name).split(',')[0]}` : `${r.name}, ${oneLine(r.properties?.name).split(',')[0]}`),
      area: L?.display_address || [oneLine(r.properties?.name).split(',').slice(-1)[0], pc].filter(Boolean).join(' '),
      rent: L?.rent ?? r.current_asking_rent ?? null, available: L?.available_from ?? r.available_date ?? null, photo: url(first),
    }
  }).sort((a, b) => String(a.available ?? '9999').localeCompare(String(b.available ?? '9999')))
}

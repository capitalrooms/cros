// POST /api/lettings/spareroom — import a SpareRoom advert into a room's listing (17 Oct 2026). Office staff only.
//   { url, roomId? }                        → { ad, checks } — what the advert says (lib/listing/spareroom), nothing saved;
//                                             with roomId, where it differs from what CROS knows about the room and
//                                             house (rooms, flatmates, rent, en-suite, bills, furnished, date, deposit) —
//                                             and a deposit above the legal cap — so nothing is copied over unseen
//   { url, roomId, apply: { description?, rent?, available?, ensuite?, livingRoom?, bills?, photos?: string[] } }
//                                           → saves only what was ticked: the room's marketing description, asking
//                                             rent, available date, en-suite / lounge, the house's "bills included",
//                                             and the chosen photos copied into the room's photos (marked for marketing)
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { readSpareRoom } from '@/lib/listing/spareroom'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export interface ImportCheck { field: string; label: string; spareroom: string; cros: string; note?: string; warn?: boolean }

/** Where the advert and CROS disagree — shown before anything is copied (17 Oct 2026, Harry: "double checks if
 *  there's anything it is unsure of copying e.g. disparity with room numbers"). */
async function compare(roomId: string, ad: Awaited<ReturnType<typeof readSpareRoom>>): Promise<ImportCheck[]> {
  const s = createServiceClient()
  const { data: room } = await s.from('rooms').select('id, property_id, name, current_asking_rent, available_date, has_ensuite, has_lounge').eq('id', roomId).maybeSingle() as { data: any }
  if (!room) return []
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const [{ data: prop }, { data: rooms }, { data: lets }, { data: listing }] = await Promise.all([
    s.from('properties').select('bedrooms, bills_included, furnished_status').eq('id', room.property_id).maybeSingle(),
    s.from('rooms').select('id').eq('property_id', room.property_id),
    s.from('tenancies').select('room_id, end_date, let_cancelled_at').eq('property_id', room.property_id).lte('start_date', today),
    s.from('listings').select('rent, deposit').eq('room_id', roomId).in('status', ['draft', 'ready', 'live']).maybeSingle(),
  ]) as any[]
  const out: ImportCheck[] = []
  const gbp = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
  const yes = (v: boolean | null | undefined) => v == null ? '—' : v ? 'Yes' : 'No'
  const houseRooms = (rooms ?? []).length || Number(prop?.bedrooms) || 0
  if (ad.totalRooms && houseRooms && ad.totalRooms !== houseRooms) out.push({ field: 'rooms', label: 'Bedrooms in the house', spareroom: String(ad.totalRooms), cros: String(houseRooms), note: 'CROS keeps its own count — check the house’s rooms if SpareRoom is right.', warn: true })
  const living = new Set(((lets ?? []) as any[]).filter(t => !t.let_cancelled_at && (!t.end_date || t.end_date >= today) && t.room_id !== roomId).map(t => t.room_id)).size
  if (ad.flatmates != null && ad.flatmates !== living) out.push({ field: 'flatmates', label: 'Flatmates living there now', spareroom: String(ad.flatmates), cros: String(living), note: 'The listing shows CROS’s figure (from the tenancies).', warn: true })
  const monthly = ad.rent ? (ad.period === 'pw' ? Math.round(ad.rent * 52 / 12) : ad.rent) : null
  const ours = listing?.rent != null ? Number(listing.rent) : room.current_asking_rent != null ? Number(room.current_asking_rent) : null
  if (monthly && ours && Math.abs(monthly - ours) >= 1) out.push({ field: 'rent', label: 'Rent (a month)', spareroom: gbp(monthly), cros: gbp(ours) })
  if (ad.ensuite != null && room.has_ensuite != null && ad.ensuite !== room.has_ensuite) out.push({ field: 'ensuite', label: 'En-suite', spareroom: yes(ad.ensuite), cros: yes(room.has_ensuite) })
  if (ad.livingRoom != null && room.has_lounge != null && ad.livingRoom !== room.has_lounge) out.push({ field: 'livingRoom', label: 'Shared living room', spareroom: yes(ad.livingRoom), cros: yes(room.has_lounge) })
  if (ad.billsIncluded != null && prop?.bills_included != null && ad.billsIncluded !== prop.bills_included) out.push({ field: 'bills', label: 'Bills included', spareroom: yes(ad.billsIncluded), cros: yes(prop.bills_included), note: 'This is set for the whole house.' })
  if (ad.furnished != null && prop?.furnished_status && ad.furnished !== (prop.furnished_status !== 'unfurnished')) out.push({ field: 'furnished', label: 'Furnished', spareroom: yes(ad.furnished), cros: yes(prop.furnished_status !== 'unfurnished') })
  if (ad.available && room.available_date && ad.available !== room.available_date) out.push({ field: 'available', label: 'Available from', spareroom: ad.available.split('-').reverse().join('/'), cros: String(room.available_date).split('-').reverse().join('/') })
  // the Tenant Fees Act: a deposit of more than 5 weeks' rent (annual rent under £50,000) isn't allowed
  if (ad.deposit && monthly) {
    const cap = Math.floor(monthly * 12 / 52 * 5 * 100) / 100
    if (ad.deposit > cap) out.push({ field: 'deposit', label: 'Deposit', spareroom: gbp(ad.deposit), cros: `${gbp(cap)} at most`, note: 'More than 5 weeks’ rent — not allowed by the Tenant Fees Act. The listing will use 5 weeks.', warn: true })
    else if (listing?.deposit != null && Math.abs(Number(listing.deposit) - ad.deposit) >= 1) out.push({ field: 'deposit', label: 'Deposit', spareroom: gbp(ad.deposit), cros: gbp(Number(listing.deposit)) })
  }
  return out
}

const PHOTO = /^https:\/\/photos\d*\.spareroom\.co\.uk\/images\/flatshare\/listings\/large\/[0-9/]+\.jpg$/i

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  let ad
  try { ad = await readSpareRoom(String(b.url ?? '').trim()) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the advert' }, { status: 422 }) }
  if (!b.apply) return NextResponse.json({ ad, checks: b.roomId ? await compare(String(b.roomId), ad) : [] })

  const s = createServiceClient()
  const roomId = String(b.roomId ?? '')
  const { data: room } = await s.from('rooms').select('id, property_id').eq('id', roomId).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const a = b.apply, done: string[] = []
  const upd: Record<string, unknown> = {}
  if (a.description && ad.description) { upd.marketing_description = ad.description; done.push('description') }
  if (a.rent && ad.rent) { upd.current_asking_rent = ad.period === 'pw' ? Math.round(ad.rent * 52 / 12) : ad.rent; done.push('rent') }
  if (a.available && ad.available) { upd.available_date = ad.available; done.push('available date') }
  if (a.ensuite && ad.ensuite != null) { upd.has_ensuite = ad.ensuite; done.push('en-suite') }
  if (a.livingRoom && ad.livingRoom != null) { upd.has_lounge = ad.livingRoom; done.push('lounge') }
  if (Object.keys(upd).length) { const { error } = await s.from('rooms').update(upd).eq('id', roomId); if (error) return NextResponse.json({ error: error.message }, { status: 500 }) }
  if (a.bills && ad.billsIncluded != null) { await s.from('properties').update({ bills_included: ad.billsIncluded }).eq('id', (room as any).property_id); done.push('bills included') }

  // photos: copied into our own storage (the room's photos, for marketing) — the ones already copied are skipped
  const want: string[] = (Array.isArray(a.photos) ? a.photos : []).filter((u: unknown) => typeof u === 'string' && PHOTO.test(u) && ad.photos.includes(u)).slice(0, 30)
  let copied = 0
  if (want.length) {
    const { data: have } = await s.from('property_photos').select('file_name, display_order').eq('property_id', (room as any).property_id)
    const names = new Set(((have ?? []) as any[]).map(h => h.file_name))
    let order = Math.max(0, ...((have ?? []) as any[]).map(h => Number(h.display_order) || 0)) + 1
    for (const u of want) {
      const name = `spareroom-${u.split('/').pop()}`
      if (names.has(name)) continue
      const img = await fetch(u).catch(() => null)
      if (!img?.ok) continue
      const path = `${(room as any).property_id}/${roomId}/${name}`
      const { error: upErr } = await s.storage.from('property-photos').upload(path, Buffer.from(await img.arrayBuffer()), { contentType: 'image/jpeg', upsert: false })
      if (upErr && !/exists/i.test(upErr.message)) continue
      const file_url = s.storage.from('property-photos').getPublicUrl(path).data.publicUrl
      const { error: insErr } = await s.from('property_photos').insert({ property_id: (room as any).property_id, room_id: roomId, file_name: name, file_path: path, file_url, file_type: 'image/jpeg', is_marketing: true, display_order: order++, caption: null, created_by: caller.personId })
      if (!insErr) copied++
    }
    if (copied) done.push(`${copied} photo${copied === 1 ? '' : 's'}`)
  }
  return NextResponse.json({ ok: true, done })
}

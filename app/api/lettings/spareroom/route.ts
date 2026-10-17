// POST /api/lettings/spareroom — import a SpareRoom advert into a room's listing (17 Oct 2026). Office staff only.
//   { url }                                 → { ad } — what the advert says (lib/listing/spareroom), nothing saved
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

const PHOTO = /^https:\/\/photos\d*\.spareroom\.co\.uk\/images\/flatshare\/listings\/large\/[0-9/]+\.jpg$/i

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  let ad
  try { ad = await readSpareRoom(String(b.url ?? '').trim()) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the advert' }, { status: 422 }) }
  if (!b.apply) return NextResponse.json({ ad })

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

// The room's adverts (6 Nov 2026 — lib/marketing/advert).
//   GET ?roomId=                         → { facts (room + house, merged), adverts, missing: [fact keys] }
//   POST { roomId, facts, instructions?, history? } → saves the facts where they belong, writes the four versions,
//        keeps them on the room, and the website version becomes the room's marketing description
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { FACTS, FACT_BY_KEY, generateAdverts } from '@/lib/marketing/advert'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function load(s: any, roomId: string) {
  const { data: room } = await s.from('rooms').select('id, name, property_id, current_asking_rent, room_size, has_ensuite, available_date, advert_facts, adverts, properties(name, address, postcode, advert_facts)').eq('id', roomId).maybeSingle()
  return room as any
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const room = await load(createServiceClient(), req.nextUrl.searchParams.get('roomId') ?? '')
  if (!room) return NextResponse.json({ error: 'Room not found — or migration 271 hasn’t been run yet' }, { status: 404 })
  const facts: Record<string, string> = { ...(room.properties?.advert_facts ?? {}), ...(room.advert_facts ?? {}) }
  // what CROS already knows fills gaps (never overwrites an answer)
  if (!facts.room_size && room.room_size) facts.room_size = `${room.room_size} m²`
  if (!facts.bathroom && room.has_ensuite) facts.bathroom = 'En-suite'
  if (!facts.available && room.available_date) facts.available = new Date(`${room.available_date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  return NextResponse.json({ facts, adverts: room.adverts ?? null, missing: FACTS.filter(f => !facts[f.key]?.trim()).map(f => f.key) })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const room = await load(s, String(b.roomId ?? ''))
  if (!room) return NextResponse.json({ error: 'Room not found — or migration 271 hasn’t been run yet' }, { status: 404 })
  // each answer saved where it belongs — the bedroom's on the room, the house's on the house
  const given = (b.facts && typeof b.facts === 'object' ? b.facts : {}) as Record<string, unknown>
  const roomFacts = { ...(room.advert_facts ?? {}) }, houseFacts = { ...(room.properties?.advert_facts ?? {}) }
  for (const [k, v] of Object.entries(given)) {
    const f = FACT_BY_KEY[k]; if (!f) continue
    const val = String(v ?? '').trim().slice(0, 400)
    const target = f.scope === 'room' ? roomFacts : houseFacts
    if (val) target[k] = val; else delete target[k]
  }
  await Promise.all([
    s.from('rooms').update({ advert_facts: roomFacts }).eq('id', room.id),
    s.from('properties').update({ advert_facts: houseFacts }).eq('id', room.property_id),
  ])
  if (b.action === 'save_facts') return NextResponse.json({ ok: true })
  const { data: photos } = await s.from('property_photos').select('file_url, room_id').eq('property_id', room.property_id).not('file_url', 'is', null).or(`room_id.eq.${room.id},room_id.is.null`).order('created_at', { ascending: false }).limit(8)
  const place = `${String(room.name)}, ${String(room.properties?.address || room.properties?.name || '').split('\n').join(', ')}`
  try {
    const out = await generateAdverts({
      place, postcode: room.properties?.postcode ?? null, roomName: room.name, rent: room.current_asking_rent ? Number(room.current_asking_rent) : null,
      facts: { ...houseFacts, ...roomFacts }, instructions: String(b.instructions ?? '').slice(0, 2000), history: !!b.history,
      photos: ((photos ?? []) as any[]).sort((a, c) => Number(!!c.room_id) - Number(!!a.room_id)).map(p => p.file_url),
    })
    const { historyLine, ...adverts } = out
    await s.from('rooms').update({ adverts: { ...adverts, historyLine, instructions: String(b.instructions ?? '') }, marketing_description: `${adverts.website.title}\n\n${adverts.website.text}` }).eq('id', room.id)
    return NextResponse.json({ adverts: { ...adverts, historyLine } })
  } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Couldn’t write the adverts' }, { status: 502 }) }
}

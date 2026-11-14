// /api/admin/room-locations — where each room is in the house (14 Nov 2026, Harry: "if I wrote them all on a list could
// it be imported?"). rooms.location_in_house goes into contractor emails and texts, quotes, emergencies and the
// cleaner and contractor apps ("Room 4 (first floor, back)").
//   GET                              → { rooms: [{ id, property, propertyId, room, location }] } every room, A–Z
//   POST { action: 'match', text }   → { items: [{ roomId, property, room, location, line, sure }], unmatched: [line] }
//                                      reads a pasted list in any shape and matches each line to a room — nothing saved
//   POST { action: 'save', items: [{ roomId, location }] } → saves them (blank clears)
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { AI_MODEL_SMART } from '@/lib/ai-classify'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function allRooms() {
  const s = createServiceClient()
  const { data } = await s.from('rooms').select('id, name, location_in_house, property_id, properties(name, is_demo)')
  return ((data ?? []) as any[]).filter(r => !r.properties?.is_demo)
    .map(r => ({ id: r.id as string, property: (r.properties?.name ?? '') as string, propertyId: r.property_id as string, room: (r.name ?? '') as string, location: (r.location_in_house ?? '') as string }))
    .sort((a, b) => a.property.localeCompare(b.property, undefined, { numeric: true }) || a.room.localeCompare(b.room, undefined, { numeric: true }))
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ rooms: await allRooms() })
}

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const rooms = await allRooms()

  if (b.action === 'save') {
    const known = new Set(rooms.map(r => r.id))
    const items = (Array.isArray(b.items) ? b.items : []).filter((x: any) => known.has(String(x?.roomId))).slice(0, 500)
    const s = createServiceClient()
    let saved = 0
    for (const x of items) {
      const { error } = await s.from('rooms').update({ location_in_house: String(x.location ?? '').trim().slice(0, 120) || null, updated_at: new Date().toISOString() }).eq('id', x.roomId)
      if (!error) saved++
    }
    return NextResponse.json({ ok: true, saved })
  }

  if (b.action === 'match') {
    const text = String(b.text ?? '').trim().slice(0, 20000)
    if (!text) return NextResponse.json({ error: 'Paste the list first.' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI isn’t set up' }, { status: 500 })
    const catalogue = rooms.map((r, i) => `${i}|${r.property}|${r.room}`).join('\n')
    const client = new Anthropic()
    const res = await client.messages.create({
      model: AI_MODEL_SMART, max_tokens: 8000,
      tools: [{ name: 'matches', description: 'The matches', input_schema: { type: 'object', required: ['items', 'unmatched'], properties: {
        items: { type: 'array', items: { type: 'object', required: ['index', 'location', 'line', 'sure'], properties: { index: { type: 'integer', description: 'the room number from the catalogue' }, location: { type: 'string', description: 'where the room is in the house, tidied: lower case except names, e.g. "first floor, back" or "ground floor, next to the kitchen"' }, line: { type: 'string', description: 'the line it came from' }, sure: { type: 'boolean', description: 'false if the property or room was a guess' } } } },
        unmatched: { type: 'array', items: { type: 'string' }, description: 'lines that could not be matched to a room' } } } }],
      tool_choice: { type: 'tool', name: 'matches' },
      messages: [{ role: 'user', content: `Match each line of this list to a room in the catalogue and pull out where the room is in the house. Properties may be written loosely ("Claverton" = "Flat 4, 44 Claverton Street"; "rm 2" = "Room 2"). A heading line naming a property applies to the lines under it. Use only rooms in the catalogue; never invent one. Ignore lines that aren't about a room.

CATALOGUE (index|property|room):
${catalogue}

LIST:
${text}` }],
    })
    const out = (res.content.find(c => c.type === 'tool_use') as any)?.input ?? { items: [], unmatched: [] }
    const items = ((out.items ?? []) as any[]).filter(x => rooms[x.index] && String(x.location ?? '').trim()).map(x => ({ roomId: rooms[x.index].id, property: rooms[x.index].property, room: rooms[x.index].room, current: rooms[x.index].location, location: String(x.location).trim().slice(0, 120), line: String(x.line ?? '').slice(0, 200), sure: x.sure !== false }))
    return NextResponse.json({ items, unmatched: (out.unmatched ?? []).slice(0, 100) })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

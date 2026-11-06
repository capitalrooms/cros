// The walk round (6 Nov 2026 — lib/house/walkthrough). Photos are read, never kept.
//   POST { action: 'read', image, mime }            → what's in the room, and what could be better
//   POST { action: 'matches', propertyId, item }    → expenses/statement lines it could have been bought with
//   POST { action: 'save', propertyId, items, notes }→ inventory saved (undated items wait for the office), improvement
//                                                     notes saved to their room or the house; new appliances get care guides
import { NextRequest, NextResponse, after } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { readRoomPhoto, itemMatches, saveInventory, type ApprovedItem } from '@/lib/house/walkthrough'
import { researchAndSave } from '@/lib/house/careGuide'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: NextRequest) {
  const who = await requireStaff(req)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  try {
    if (b.action === 'read') {
      const bytes = Buffer.from(String(b.image ?? ''), 'base64')
      if (bytes.length < 200 || bytes.length > 4 * 1024 * 1024) return NextResponse.json({ error: 'That photo didn’t come through' }, { status: 400 })
      return NextResponse.json(await readRoomPhoto(bytes, String(b.mime ?? 'image/jpeg')))
    }
    if (b.action === 'matches') {
      if (!UUID.test(String(b.propertyId)) || !b.item) return NextResponse.json({ matches: [] })
      return NextResponse.json({ matches: await itemMatches(s as any, b.propertyId, b.item) })
    }
    if (b.action === 'save') {
      if (!UUID.test(String(b.propertyId))) return NextResponse.json({ error: 'Choose the house' }, { status: 400 })
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200) as ApprovedItem[]
      const notes = (Array.isArray(b.notes) ? b.notes : []).slice(0, 100).filter((n: any) => String(n?.note ?? '').trim())
      // every note belongs somewhere — a room or a shared area (Harry: "must be assigned to either property parent or individual room")
      if (notes.some((n: any) => !n.roomId && !n.area)) return NextResponse.json({ error: 'Each note needs its room or area' }, { status: 400 })
      const inv = items.length ? await saveInventory(s as any, b.propertyId, items, who.email) : { saved: 0, toDate: 0, applianceIds: [] }
      if (notes.length) {
        const { error } = await s.from('property_improvements').insert(notes.map((n: any) => ({ property_id: b.propertyId, room_id: n.roomId && UUID.test(n.roomId) ? n.roomId : null, area: n.roomId ? null : String(n.area).slice(0, 40), note: String(n.note).trim().slice(0, 600), added_by: who.email })))
        if (error) throw new Error(/property_improvements/.test(error.message) ? 'Improvement notes need migration 272 running in Supabase first' : error.message)
      }
      if (inv.applianceIds.length) after(async () => { for (const id of inv.applianceIds) await researchAndSave(s as any, id) })
      return NextResponse.json({ ok: true, ...inv, notes: notes.length })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Something went wrong' }, { status: 500 }) }
}

// A walk round the house with a camera (6 Nov 2026, Harry: "take a full kitchen photo and find 4 or 5 appliances …
// white IKEA Malm, likely relates to x expense … it slowly builds a full inventory"). AI reads a whole room photo for
// what's in it — furniture, appliances, lights (and the bulb they take), the TV — and the office ties each to its place
// and, where it can, to the expense it was bought with. What can't be dated waits for the office to confirm the rough
// year (room_inventory.needs_date — migration 270). Server-only. Photos aren't kept by this.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { purchaseMatches, APPLIANCE_KINDS, type PurchaseMatch } from '@/lib/house/snap'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface SeenItem { item: string; description: string; kind: string | null; brand: string | null; model: string | null; bulb: string | null; sure: boolean; question: string | null }
export interface RoomRead { area: string; items: SeenItem[]; improvements: string[] }

export async function readRoomPhoto(bytes: Buffer, mime: string): Promise<RoomRead> {
  const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 4000, output_config: { effort: 'medium' }, messages: [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: (/png/.test(mime) ? 'image/png' : 'image/jpeg') as any, data: bytes.toString('base64') } },
    { type: 'text', text: `This is a photo of a room in a London rented house. List what's in it, for the house's inventory.
Return ONLY JSON: {"area": "bedroom"|"kitchen"|"lounge"|"bathroom"|"hallway"|"garden"|"other",
 "items": [{"item": short name e.g. "Chest of drawers", "description": what it looks like, with the make/range if you can tell (e.g. "White IKEA Malm, 6 drawers"),
   "kind": one of ${Object.keys(APPLIANCE_KINDS).join('|')} for appliances, else null,
   "brand": if visible or very recognisable, else null, "model": only if readable, else null,
   "bulb": for light fittings, the bulb it most likely takes (e.g. "E27 standard", "GU10 spotlight"), else null,
   "sure": true if you're confident what it is, "question": if not sure, one short question for the office (e.g. "Is this a washer-dryer or a washing machine?"), else null}],
 "improvements": [up to 3 short, honest notes a letting agent would make — worn carpet, clutter, missing furniture, tired paint — or []]}
Include: furniture, appliances, light fittings, TVs, mirrors, blinds/curtains, smoke alarms. Not: personal belongings, food, clothes, toiletries.` },
  ] }] } as any)
  const text = (r.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  const s = (v: any, n = 160) => (v == null || v === '' ? null : String(v).trim().slice(0, n))
  return {
    area: String(j.area ?? 'other'),
    items: (Array.isArray(j.items) ? j.items : []).slice(0, 25).map((x: any) => ({ item: s(x.item, 60) ?? 'Item', description: s(x.description) ?? '', kind: APPLIANCE_KINDS[x.kind] ? x.kind : null, brand: s(x.brand, 60), model: s(x.model, 60), bulb: s(x.bulb, 60), sure: x.sure !== false, question: s(x.question, 200) })),
    improvements: (Array.isArray(j.improvements) ? j.improvements : []).slice(0, 3).map((t: any) => String(t).slice(0, 200)),
  }
}

export async function itemMatches(s: SupabaseClient, propertyId: string, it: SeenItem): Promise<PurchaseMatch[]> {
  return purchaseMatches(s, propertyId, { kind: it.kind ?? 'other', brand: it.brand, model: it.model, words: `${it.item} ${it.description}` })
}

export interface ApprovedItem { item: SeenItem; roomId: string | null; area: string | null; bought?: { source: 'expense' | 'statement'; id: string; date: string; note: string } | null; boughtYear?: string | null }

/** Save the approved items: appliances also go on the appliance list (with their care guide researched later). */
export async function saveInventory(s: SupabaseClient, propertyId: string, items: ApprovedItem[], byEmail: string | null): Promise<{ saved: number; toDate: number; applianceIds: string[] }> {
  let saved = 0, toDate = 0
  const applianceIds: string[] = []
  for (const a of items) {
    const it = a.item
    const year = a.boughtYear && /^(19|20)\d{2}$/.test(a.boughtYear) ? a.boughtYear : null
    const dated = !!a.bought || !!year
    const { error } = await s.from('room_inventory').insert({
      property_id: propertyId, room_id: a.roomId, area: a.roomId ? null : a.area, item: it.item, description: [it.brand, it.description, it.model].filter(Boolean).join(' · ') || null, bulb: it.bulb,
      bought_on: a.bought ? a.bought.date : year ? `${year}-06-30` : null, bought_note: a.bought ? a.bought.note.slice(0, 200) : year ? `About ${year} (remembered)` : null, bought_approx: !a.bought && !!year,
      ...(a.bought ? (a.bought.source === 'expense' ? { expense_id: a.bought.id } : { statement_line_id: a.bought.id }) : {}),
      needs_date: !dated, added_by: byEmail,
    })
    if (error) throw new Error(/room_inventory/.test(error.message) ? 'The inventory needs migration 270 running in Supabase first' : error.message)
    saved++; if (!dated) toDate++
    if (it.kind && (it.brand || it.model)) {
      const { data } = await s.from('property_appliances').insert({ property_id: propertyId, room_id: a.roomId, kind: it.kind, brand: it.brand, model: it.model, location: a.area, added_by: byEmail,
        ...(a.bought ? { bought_on: a.bought.date, bought_note: a.bought.note.slice(0, 200) } : {}) }).select('id').single()
      if ((data as any)?.id) applianceIds.push((data as any).id)
    }
  }
  return { saved, toDate, applianceIds }
}

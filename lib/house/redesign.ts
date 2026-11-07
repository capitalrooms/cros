// "Reimagine this space" (6 Nov 2026, Harry: "2 or 3 reimagined decors of that same room but modernised with no
// structural changes"). Claude looks at the photo and writes three decor briefs that keep every wall, window, door and
// the layout exactly as they are, each with a rough shopping list and cost; OpenAI's image editing redraws the same photo
// for each (Claude can't make images). Kept against the improvement note (property_improvements.designs) in the private
// property-documents folder. Needs OPENAI_API_KEY. Server-only.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const BUCKET = 'property-documents'
export const redesignReady = () => !!process.env.OPENAI_API_KEY

export interface Design { style: string; brief: string; items: string[]; cost: string; path: string; mode?: Mode }
// redesign = new decor to propose to the landlord; dress = the same room styled for marketing photos (7 Nov 2026,
// Harry: "dress bedrooms for just general marketing photo improvement") — nothing fixed or permanent changes, so a
// dressed photo is honest about the room (it's labelled as dressed when saved to the room's photos)
export type Mode = 'redesign' | 'dress'

const DRESS = (note: string) => `This is a bedroom or room in a London rented shared house, photographed for a lettings advert. The letting agent's note: "${note}".
Write THREE ways to DRESS it for marketing photos — like a property stylist on shoot day. Change ONLY loose, movable items: bedding made up neatly (crisp duvet, pillows, throw, cushions), a rug, a bedside lamp switched on, a plant, one or two framed prints, a tidy desk with a few books — and remove clutter, personal belongings, cables and laundry. Keep EVERYTHING else exactly as it is: walls and their colour, flooring, windows, doors, radiator, built-in and existing furniture (bed, wardrobe, desk, drawers) in the same place and size, the room's true size and the camera angle. Do not make it look bigger, change the view or add furniture that isn't there. Bright, natural daylight.
1. "Crisp hotel" (white bedding, minimal), 2. "Warm and cosy" (textured throws, warm lamp light), 3. "Fresh and bright" (light colours, greenery).
Reply with ONLY JSON: [{"style": "...", "prompt": "instruction for the image editor, starting 'Keep the exact room, furniture, walls, floor, windows and camera angle. Only style the loose items:'", "brief": "one sentence on the styling", "items": ["white waffle duvet set", "grey throw", …], "cost": "rough UK cost of the styling kit, e.g. £80–£150"}]`

async function briefs(photo: Buffer, note: string, mode: Mode = 'redesign'): Promise<{ style: string; prompt: string; brief: string; items: string[]; cost: string }[]> {
  const r = await claude.messages.create({ model: 'claude-opus-5-5', max_tokens: 4000, output_config: { effort: 'medium' }, messages: [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo.toString('base64') } },
    { type: 'text', text: mode === 'dress' ? DRESS(note) : `This is a room in a London rented shared house. The letting agent's note: "${note}".
Write THREE redecoration ideas that modernise it with NO structural changes — every wall, window, door, radiator, floor plan and fixed kitchen/bathroom unit stays exactly where it is; only paint, flooring finish, furniture, soft furnishings, lighting and accessories change. Make them realistic for a rental landlord:
1. "Budget refresh" (paint, lights, textiles — a few hundred pounds), 2. "Warm modern", 3. "Light and bright".
For each, an image-editing instruction that keeps the exact camera angle and room structure.
Reply with ONLY JSON: [{"style": "...", "prompt": "instruction for the image editor, starting 'Keep the exact room structure, camera angle, walls, windows and doors. Redecorate as…'", "brief": "two sentences for the landlord", "items": ["paint walls sage green", "oak-effect vinyl", …], "cost": "rough UK cost range, e.g. £300–£500"}]` },
  ] }] } as any)
  const text = (r.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  return JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)).slice(0, 3)
}

async function redraw(photo: Buffer, prompt: string): Promise<Buffer> {
  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('image', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'room.jpg')
  form.append('prompt', prompt)
  form.append('size', 'auto')
  form.append('quality', 'medium')
  const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(170000) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`OpenAI said ${r.status}: ${j?.error?.message ?? r.statusText}`)
  const b64 = j?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI didn’t send an image back')
  return Buffer.from(b64, 'base64')
}

/** Three redesigns of the photo for one improvement note; saved on the note. */
export async function redesign(s: SupabaseClient, improvementId: string, photo: Buffer, mode: Mode = 'redesign'): Promise<Design[]> {
  if (!redesignReady()) throw new Error('Redesigns need the OpenAI key (OPENAI_API_KEY) adding in Vercel')
  const { data: imp } = await s.from('property_improvements').select('id, property_id, note, designs').eq('id', improvementId).maybeSingle() as { data: any }
  if (!imp) throw new Error('Improvement not found')
  const plans = await briefs(photo, imp.note, mode)
  const made = await Promise.all(plans.map(async (p, i) => {
    const img = await redraw(photo, p.prompt)
    const path = `improvements/${imp.property_id}/${imp.id}-${Date.now()}-${i}.png`
    const { error } = await s.storage.from(BUCKET).upload(path, img, { contentType: 'image/png' })
    if (error) throw new Error(error.message)
    return { style: String(p.style).slice(0, 40), brief: String(p.brief).slice(0, 400), items: (p.items ?? []).slice(0, 10).map(String), cost: String(p.cost).slice(0, 40), path, mode }
  }))
  await s.from('property_improvements').update({ designs: [...(imp.designs ?? []), ...made], updated_at: new Date().toISOString() }).eq('id', imp.id)
  return made
}

/** Signed links for showing the designs (an hour). */
export async function designLinks(s: SupabaseClient, designs: Design[]): Promise<(Design & { url: string | null })[]> {
  return Promise.all((designs ?? []).map(async d => ({ ...d, url: (await s.storage.from(BUCKET).createSignedUrl(d.path, 3600)).data?.signedUrl ?? null })))
}

/** A redesign or dressed image copied into the room's photos (marketing), captioned so nobody mistakes it for the room as it is. */
export async function saveToPhotos(s: SupabaseClient, improvementId: string, index: number, by: string | null): Promise<{ id: string; file_url: string; file_path: string }> {
  const { data: imp } = await s.from('property_improvements').select('id, property_id, room_id, designs').eq('id', improvementId).maybeSingle() as { data: any }
  const d: Design | undefined = imp?.designs?.[index]
  if (!d) throw new Error('That picture isn’t there any more')
  const { data: file, error: dl } = await s.storage.from(BUCKET).download(d.path)
  if (dl || !file) throw new Error('Couldn’t read the picture')
  const path = `${imp.property_id}/${imp.room_id ?? 'house'}/${Date.now()}-ai-${index}.png`
  const { error: up } = await s.storage.from('property-photos').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: 'image/png' })
  if (up) throw new Error(up.message)
  const file_url = s.storage.from('property-photos').getPublicUrl(path).data.publicUrl
  const { count } = await s.from('property_photos').select('id', { count: 'exact', head: true }).eq('property_id', imp.property_id).eq('room_id', imp.room_id)
  const { data: row, error } = await s.from('property_photos').insert({ property_id: imp.property_id, room_id: imp.room_id, file_name: `${d.style}.png`, file_path: path, file_url,
    caption: d.mode === 'dress' ? `Styled for photos (${d.style})` : `Illustration — ${d.style} redesign`, display_order: count ?? 0, created_by: null }).select('id, file_url, file_path').single()
  if (error) throw new Error(error.message)
  void by
  return row as any
}

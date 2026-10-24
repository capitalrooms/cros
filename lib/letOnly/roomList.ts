// A let-only landlord's "who's in each room" list (Harry, 12 Oct 2026 — Nigel sends a table by email: move-in date,
// house code like "9rc" / "4qdc" / "95rs", room, people in the house, bathroom, shared space, rent, tenant + phone).
//   readRoomList   — AI reads pasted text or a screenshot into rows
//   resolveRows    — house codes → CROS let-only houses (8rc = 8 Royal Court: number + initials of the street);
//                    an unknown code gets a suggested address from a known house on the same street
//   applyRoomList  — rooms (made if missing), rent, bathroom/lounge, and who lives there (let_only_occupants —
//                    never a tenancy, so nothing reaches rent charges or statements)
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL_SMART } from '@/lib/ai-classify'

export interface ListRow {
  house_code: string; room: string; move_in: string | null; persons_in_house: number | null
  bathroom: string | null; shared_space: string | null; rent: number | null
  tenant_name: string | null; tenant_phone: string | null; note: string | null
}

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['rows'],
  properties: { rows: { type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['house_code', 'room', 'move_in', 'persons_in_house', 'bathroom', 'shared_space', 'rent', 'tenant_name', 'tenant_phone', 'note'],
    properties: {
      house_code: { type: 'string', description: 'the short house code exactly as written, e.g. "9rc", "4qdc", "95rs"' },
      room: { type: 'string', description: 'room number as written, e.g. "4"' },
      move_in: { type: ['string', 'null'], description: 'move-in date as YYYY-MM-DD (dates are UK day/month/year; "by 30/09/2026" → 2026-09-30)' },
      persons_in_house: { type: ['integer', 'null'] },
      bathroom: { type: ['string', 'null'], description: 'e.g. "ensuite", "own bathroom", "share bathroom with R2"' },
      shared_space: { type: ['string', 'null'], description: 'e.g. "kitchen with dining table etc", "living room"' },
      rent: { type: ['number', 'null'], description: 'monthly rent in pounds' },
      tenant_name: { type: ['string', 'null'], description: 'the person living there, without the phone number; null if none' },
      tenant_phone: { type: ['string', 'null'], description: 'their phone number as written' },
      note: { type: ['string', 'null'], description: 'anything else written in place of a tenant, e.g. "currently living room but will be made into a bedroom"' },
    } } } },
}

const PROMPT = `This is a landlord's list of the rooms in their shared houses and who lives in each. Read every row into the
schema. Keep house codes exactly as written (lower case). Ignore empty numbered rows. Don't invent anything that isn't there.`

export async function readRoomList(input: { text?: string; image?: { mime: string; base64: string } }): Promise<ListRow[]> {
  const content: any[] = []
  if (input.image) content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mime, data: input.image.base64 } })
  if (input.text?.trim()) content.push({ type: 'text', text: `The list:\n${input.text.trim().slice(0, 20000)}` })
  content.push({ type: 'text', text: PROMPT })
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({ model: AI_MODEL_SMART, max_tokens: 4000, output_config: { format: { type: 'json_schema', schema: SCHEMA } } as any, messages: [{ role: 'user', content }] })
  const text = (res.content as any[]).find(c => c.type === 'text')?.text ?? '{}'
  return (JSON.parse(text).rows ?? []) as ListRow[]
}

// "8 Royal Court, Finland Street" → { num: '8', letters: 'rc' }; "Flat 4, Queen of Denmark Court" → num 4, 'qdc'
const SKIP = new Set(['of', 'the', 'and', 'flat', 'room'])
export function houseKey(name: string): { num: string; letters: string; street: string } | null {
  const first = String(name || '').split(/\n/)[0]
  const m = first.match(/(\d+)\s*[,]?\s*([A-Za-z][A-Za-z' -]*)/)
  if (!m) return null
  const street = m[2].split(',')[0].trim()
  const letters = street.split(/\s+/).filter(w => w && !SKIP.has(w.toLowerCase())).map(w => w[0].toLowerCase()).join('')
  return { num: String(parseInt(m[1])), letters, street }
}
const codeKey = (code: string) => { const m = String(code).toLowerCase().replace(/\s/g, '').match(/^0*(\d+)([a-z]+)$/); return m ? { num: m[1], letters: m[2] } : null }

export interface ResolvedGroup {
  code: string
  property: { id: string; name: string } | null
  suggestion: { address: string; postcode: string | null } | null
  rows: (ListRow & { roomId: string | null; roomName: string })[]
}

export async function resolveRows(s: SupabaseClient, rows: ListRow[]): Promise<ResolvedGroup[]> {
  const { data: props } = await s.from('properties').select('id, name, address, postcode, property_code, letting_type')
  const all = (props ?? []) as any[]
  const letOnly = all.filter(p => p.letting_type === 'let_only')
  const { data: rooms } = letOnly.length ? await s.from('rooms').select('id, name, property_id').in('property_id', letOnly.map(p => p.id)) : { data: [] as any[] }
  const keyOf = (p: any) => {
    const c = p.property_code ? codeKey(p.property_code) : null
    const h = houseKey(p.name) ?? houseKey(p.address)
    return { c, h }
  }
  const groups = new Map<string, ResolvedGroup>()
  for (const r of rows) {
    const code = String(r.house_code || '').toLowerCase().trim()
    if (!code) continue
    if (!groups.has(code)) {
      const k = codeKey(code)
      const match = k ? letOnly.find(p => { const { c, h } = keyOf(p); return (c && c.num === k.num && c.letters === k.letters) || (h && h.num === k.num && h.letters === k.letters) }) : null
      // a house we don't have yet: borrow the street and postcode from another let-only house with the same street
      // initials (9rc → 9 Royal Court, from 8 Royal Court). Only let-only houses — "rc" is also Redstart Close, managed.
      let suggestion: ResolvedGroup['suggestion'] = null
      if (!match && k) {
        const same = letOnly.map(p => ({ p, h: houseKey(p.name) ?? houseKey(p.address) })).find(x => x.h && x.h.letters === k.letters)
        if (same?.h) {
          const rest = String(same.p.name || '').split(/\n/)[0].replace(/^.*?\d+\s*,?\s*/, '')
          suggestion = { address: `${k.num} ${rest}`, postcode: same.p.postcode ?? null }
        }
      }
      groups.set(code, { code, property: match ? { id: match.id, name: String(match.name).split('\n')[0] } : null, suggestion, rows: [] })
    }
    const g = groups.get(code)!
    const n = String(r.room || '').match(/\d+/)?.[0]
    const roomName = n ? `Room ${parseInt(n)}` : String(r.room || 'Room').trim()
    const room = g.property ? ((rooms ?? []) as any[]).find(x => x.property_id === g.property!.id && String(x.name).toLowerCase().replace(/\s/g, '') === roomName.toLowerCase().replace(/\s/g, '')) : null
    g.rows.push({ ...r, roomId: room?.id ?? null, roomName })
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
}

/** Save one house's rows. Rooms are made when missing; nothing is deleted. Returns what changed, in words. */
export async function applyRoomList(s: SupabaseClient, propertyId: string, rows: ListRow[], by: string): Promise<string[]> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const source = `Landlord’s list, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })}`
  const { data: prop } = await s.from('properties').select('id, letting_type, property_code').eq('id', propertyId).maybeSingle()
  if (!prop || prop.letting_type !== 'let_only') throw new Error('That house isn’t a let-only property')
  const { data: existing } = await s.from('rooms').select('id, name').eq('property_id', propertyId)
  const said: string[] = []
  for (const r of rows) {
    const n = String(r.room || '').match(/\d+/)?.[0]
    const roomName = n ? `Room ${parseInt(n)}` : String(r.room || 'Room').trim()
    const bath = (r.bathroom ?? '').toLowerCase(), shared = (r.shared_space ?? '').toLowerCase()
    const fields: Record<string, unknown> = { is_let_only: true }
    if (r.rent) fields.current_asking_rent = r.rent
    if (/ensuite|en-suite|en suite/.test(bath)) { fields.has_ensuite = true; fields.has_shared_bathroom = false }
    else if (/own bathroom|private/.test(bath)) { fields.has_ensuite = false; fields.has_shared_bathroom = false }
    else if (/share/.test(bath)) { fields.has_ensuite = false; fields.has_shared_bathroom = true }
    if (/living room|lounge/.test(shared)) fields.has_lounge = true
    if (r.tenant_name) fields.status = 'occupied'
    let room = ((existing ?? []) as any[]).find(x => String(x.name).toLowerCase().replace(/\s/g, '') === roomName.toLowerCase().replace(/\s/g, ''))
    if (room) {
      const { error } = await s.from('rooms').update(fields).eq('id', room.id)
      if (error) throw new Error(`${roomName}: ${error.message}`)
    } else {
      const { data: made, error } = await s.from('rooms').insert({ ...fields, status: fields.status ?? 'available', property_id: propertyId, name: roomName,
        unit_code: prop.property_code && n ? `${prop.property_code}${String(parseInt(n)).padStart(2, '0')}` : null }).select('id, name').single()
      if (error || !made) throw new Error(`${roomName}: ${error?.message ?? 'could not add the room'}`)
      room = made; said.push(`${roomName} added`)
    }
    if (!r.tenant_name) { if (r.note) said.push(`${roomName}: ${r.note}`); continue }
    const { data: cur } = await s.from('let_only_occupants').select('id, name').eq('room_id', room.id).is('ended_at', null)
    const same = ((cur ?? []) as any[]).find(o => o.name.trim().toLowerCase() === r.tenant_name!.trim().toLowerCase())
    const occ = { name: r.tenant_name.trim(), phone: r.tenant_phone?.trim() || null, move_in: r.move_in || null, rent: r.rent ?? null, note: r.note || null, source, updated_at: new Date().toISOString() }
    if (same) { await s.from('let_only_occupants').update(occ).eq('id', same.id); said.push(`${roomName}: ${occ.name} updated`); continue }
    if ((cur ?? []).length) await s.from('let_only_occupants').update({ ended_at: r.move_in && r.move_in < today ? r.move_in : today }).in('id', (cur as any[]).map(o => o.id))
    const { error } = await s.from('let_only_occupants').insert({ ...occ, property_id: propertyId, room_id: room.id, created_by: by })
    if (error) throw new Error(`${roomName}: ${error.message}`)
    said.push(`${roomName}: ${occ.name}${occ.move_in ? ` from ${occ.move_in.split('-').reverse().join('/')}` : ''}`)
  }
  return said
}

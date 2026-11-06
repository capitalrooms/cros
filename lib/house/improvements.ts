// Improvement notes → a proper email (6 Nov 2026, Harry: "it uses what was mentioned, elaborates and formalises and goes
// from there"). The notes as written, plus what CROS knows (room sizes, the landlord, let only or managed), become either
// a note to the landlord ("we visited and noted…") or a request for a quote ("please quote for a new carpet, 8.4 m²").
// Nothing is retyped. Server-only.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dearName } from '@/lib/people'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function draftImprovements(s: SupabaseClient, ids: string[], to: 'landlord' | 'contractor'): Promise<{ subject: string; message: string; landlordEmail: string | null }> {
  const { data: rows } = await s.from('property_improvements').select('id, note, area, room_id, property_id, rooms(name, room_size), properties(name, address, letting_type, landlord_id)').in('id', ids) as { data: any[] | null }
  if (!rows?.length) throw new Error('Nothing chosen')
  const prop = rows[0].properties
  const { data: ll } = prop?.landlord_id ? await s.from('people').select('salutation, first_name, last_name, full_name, email').eq('id', prop.landlord_id).maybeSingle() as { data: any } : { data: null }
  const lines = rows.map(r => `- ${r.room_id ? `${r.rooms?.name}${r.rooms?.room_size ? ` (${r.rooms.room_size} m²)` : ''}` : r.area}: ${r.note}`).join('\n')
  const house = String(prop?.address || prop?.name || '').split('\n').join(', ')
  const brief = to === 'landlord'
    ? `Write a short, warm, professional email from Capital Rooms (a London letting agent${prop?.letting_type === 'let_only' ? ' that found the tenants — the landlord manages the house' : ' that manages the house'}) to the landlord, ${ll ? dearName(ll) : 'the landlord'}, about ${house}. We've been to the house and noted a few things that could be improved. Group them by room/area, say briefly why each would help (tenant appeal, wear, fewer voids), and ${prop?.letting_type === 'let_only' ? 'say we thought they would like to know — no pressure' : 'ask whether they would like us to arrange quotes'}. Don't invent costs.`
    : `Write a short, clear email from Capital Rooms (a London letting agent) to a contractor asking for a quote at ${house}. List each job by room/area with the measurements we have (room sizes in m²), say what we'd like done, and ask for a price, earliest date and how they'd like access arranged. Don't invent measurements we don't have — ask them to measure on site instead.`
  const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 3000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: `${brief}\n\nThe notes, as written on the visit:\n${lines}\n\nBritish English, no emoji. Reply with ONLY JSON: {"subject": "...", "message": "the email body, starting with the greeting and ending with Kind regards,"}` }] } as any)
  const text = (r.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  return { subject: String(j.subject ?? '').slice(0, 160), message: String(j.message ?? '').slice(0, 6000), landlordEmail: ll?.email ?? null }
}

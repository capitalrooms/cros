// Room adverts (6 Nov 2026, Harry: "study everything you need to mention on adverts for best response and ensure follow
// up questions get all these details"). What the best room adverts carry — SpareRoom's own advice (a specific title;
// what's in the room; the whole house, not just the bedroom; rent, deposit and bills up front; who lives there and who'd
// fit in) and Rightmove's (the first two lines sell it, because that's all search shows; concrete local detail like
// "8 minutes' walk to Surrey Quays"; short and honest). Each fact is asked once and kept where it belongs: the bedroom's
// on the room, the house's and area's on the house (migration 271). Then four versions are written at once.
// Renters' Rights Act: never a fixed term or minimum stay. Server-only for generate(); FACTS is shared.
import Anthropic from '@anthropic-ai/sdk'

import { FACTS, type Fact } from '@/lib/marketing/facts'
export { FACTS, FACT_BY_KEY, type Fact, type FactScope } from '@/lib/marketing/facts'

export interface Adverts { summary: string; website: { title: string; text: string }; spareroom: { title: string; text: string }; facebook: string; generatedAt: string }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateAdverts(o: {
  place: string; postcode: string | null; roomName: string; rent: number | null
  facts: Record<string, string>; instructions: string; history: boolean; photos: string[]
}): Promise<Adverts & { historyLine: string | null }> {
  const known = FACTS.filter(f => o.facts[f.key]?.trim()).map(f => `${f.label}: ${o.facts[f.key].trim()}`).join('\n')
  const content: any[] = o.photos.slice(0, 6).map(url => ({ type: 'image', source: { type: 'url', url } }))
  content.push({ type: 'text', text: `You write room adverts for Capital Rooms, a London letting agent for shared houses. Write four versions for one room.

The room: ${o.roomName}, ${o.place}${o.postcode ? `, ${o.postcode}` : ''}${o.rent ? ` — £${o.rent.toLocaleString('en-GB')} per month` : ''}.
Facts (use only these and what you can see in the photos — never invent amenities, distances or rules):
${known || '(none yet)'}
${o.history ? `\nAlso search the web for one short, true line of local history about this street or area (e.g. "built on the old Surrey Commercial Docks"), and use it once in the website version only. Return it as "historyLine". If you can't verify one, use null.` : ''}
${o.instructions.trim() ? `\nTHE OFFICE'S NOTES — follow these exactly, they override the defaults below:\n${o.instructions.trim()}` : ''}

What the best-performing room adverts do (SpareRoom's and Rightmove's own guidance):
- The first two lines sell it — they're all that shows in search results: the strongest feature, the area, the price point.
- A specific title, never just "Double room". E.g. "Bright double with en-suite, 8 min to Surrey Quays".
- Describe what's in the bedroom (bed, storage, desk) AND the whole house (shared spaces, laundry, garden), together in one section — never scatter the room's details.
- Rent, deposit, what's included and the move-in date stated plainly, early.
- Who lives there and who it would suit — people picture themselves living there.
- Concrete local detail with walking minutes to a named station; parks and shops by name.
- Short, honest, easy to skim. Capitalise two or three key features in the website version (e.g. EN-SUITE, ALL BILLS INCLUDED) — Rightmove's keyword sort picks them up.
- Never a fixed term, minimum stay or contract length (Renters' Rights Act). Never discriminatory wording.
- No emoji except in the Facebook post (a few, naturally). British English.

The four versions:
1. "summary" — two sentences for the top of a listing / search result.
2. "website" — the professional Capital Rooms listing (Rightmove style): title + 120–220 words in short paragraphs and a short "Key features" list, then "The details" (rent, deposit, included, available).
3. "spareroom" — SpareRoom ad: title (max 60 characters) + 150–250 words, warmer, written about the household and the room, ending with how to book a viewing.
4. "facebook" — an informal post as if from a housemate in a London rooms group: 5–9 short lines, friendly, a few emoji, rent and date, "message me to come and see it".

Reply with ONLY JSON: {"summary": "...", "website": {"title": "...", "text": "..."}, "spareroom": {"title": "...", "text": "..."}, "facebook": "...", "historyLine": "..." | null}` })
  const tools = o.history ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'GB', city: 'London' } }] : undefined
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content }]
  let r: any = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 16000, output_config: { effort: 'medium' }, messages, ...(tools ? { tools } : {}) } as any)
  for (let i = 0; i < 3 && r.stop_reason === 'pause_turn'; i++) { messages.push({ role: 'assistant', content: r.content }); r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 16000, output_config: { effort: 'medium' }, messages, tools } as any); messages.pop() }
  if (r.stop_reason === 'refusal') throw new Error('The advert couldn’t be written — try changing the notes')
  const text = (r.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  const s = (v: any, n: number) => String(v ?? '').trim().slice(0, n)
  return {
    summary: s(j.summary, 500), website: { title: s(j.website?.title, 120), text: s(j.website?.text, 4000) },
    spareroom: { title: s(j.spareroom?.title, 60), text: s(j.spareroom?.text, 4000) }, facebook: s(j.facebook, 1500),
    historyLine: j.historyLine ? s(j.historyLine, 300) : null, generatedAt: new Date().toISOString(),
  }
}

// A Facebook group post for a room (12 Nov 2026, Harry: "the sort of message people send into groups on Facebook —
// hey guys, we have a room coming available in our house where we are a bunch of people like this … factual, but in
// person, more personable … as if we're sending it to people and speaking to them rather than it just being an advert").
// Written from everything the listing knows — the room, the house, who lives there, getting around, the money — in a
// warm first-person voice. Facts only; never a minimum term (Renters' Rights Act) or who may or may not apply. Server-only.
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL } from '@/lib/ai-classify'

export interface PostFacts {
  wholeLet: boolean; place: string; roomName: string | null; headline: string | null; summary: string | null; description: string | null
  features: string[]; rent: number | null; rentFrequency: string; billsIncluded: boolean | null; deposit: number | null; available: string | null
  bedrooms: number | null; housemates: number | null; furnished: string | null; ensuite: boolean | null
  stations: string[]; housemateLines: string[]; link: string | null; tone: string
}

export async function writeGroupPost(f: PostFacts): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('The AI key isn’t set up')
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  const facts = {
    let: f.wholeLet ? 'a whole home for one household' : 'a room in a shared house', where: f.place, room: f.roomName, headline: f.headline, summary: f.summary,
    rent: f.rent ? `£${f.rent.toLocaleString('en-GB')} ${f.rentFrequency}` : null, bills: f.billsIncluded == null ? null : f.billsIncluded ? 'included' : 'not included',
    deposit: f.deposit ? `£${f.deposit.toLocaleString('en-GB')}` : null, available: f.available, bedrooms_in_house: f.bedrooms, people_living_there_now: f.housemates,
    furnished: f.furnished, ensuite: f.ensuite, key_features: f.features, nearest_stations: f.stations,
    who_lives_there_now: f.housemateLines.length ? f.housemateLines : null,
  }
  const client = new Anthropic()
  const res = await client.messages.create({
    model: AI_MODEL, max_tokens: 1200,
    messages: [{ role: 'user', content: `Write a post for local Facebook groups (house-share and flatshare groups in London) about ${f.wholeLet ? 'a home' : 'a room'} coming up. Today is ${today}.

It should read like a real person in the house posting to the group, talking TO people — upbeat and a bit exciting to read, with plenty of emoji. Factual: use only what's below, never invent anything.

Follow this shape (Harry's example of a post that works):
"Hey everyone! 👋 We're two working professionals, both 21, working in tech and finance, and we've got a room available in our house! 🏡 The house is on the river in SE16, a 15 min walk to the Jubilee line — a really tranquil, watery area 🌊
We're looking for a friendly, tidy and considerate person to join the house ✨
A bit about the place:
🛏️ …
🧹 Cleaner every two weeks
🛋️ Comfortable, sociable house with a relaxed atmosphere
💷 £… a month, bills included
If you're interested, check out the full advert and photos here 👉 [link]
Feel free to message me if you'd like to arrange a viewing! 😊"

Rules:
- Open with who lives there${f.wholeLet ? ' (for a whole home, open with the home itself instead)' : ''}: how many, then what they do and their ages where given — e.g. "We're four professionals, including a 29-year-old nurse and a 32-year-old teacher". If everyone is described, name each; if only some, say "including". Never imply a partial list is everyone. Use people_living_there_now when given. Never give names.
- Then where it is and getting around (nearest stations, walking times) and what the area's like, if known.
- One friendly line about the kind of housemate who'd fit in — behaviour only (friendly, tidy, considerate).
- "A bit about the place:" then 5–8 short lines, each starting with a fitting emoji (not "*" or "-"): the room, the house, cleaner/bills/broadband if known, the rent and whether bills are included, the deposit, when it's free.
- Close with the link${f.link ? ` — exactly this, never changed: ${f.link}` : ''} and "Feel free to message me…" for a viewing.
- 100–200 words. Lots of energy but not shouty — no capitals for emphasis, no "!!!". British English. No hashtags.
- Never mention a minimum stay, fixed term or contract length. Never say who can't apply (no "no DSS", genders, couples rules).
${f.tone.trim() ? `\nThe office's notes — follow these: ${f.tone.trim()}\n` : ''}
What we know (JSON): ${JSON.stringify(facts)}
${f.description ? `\nThe advert's description, for detail:\n"""\n${f.description.slice(0, 5000)}\n"""` : ''}

Reply with ONLY the post.` }],
  })
  const out = (res.content.find((b: any) => b.type === 'text') as any)?.text?.trim()
  if (!out) throw new Error('The AI returned nothing')
  return out.replace(/^"|"$/g, '').trim()
}

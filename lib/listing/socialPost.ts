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

It should read like a real person posting to people in the group — "Hey everyone 👋 we've got a lovely double room coming up in our house in Canada Water…" — talking TO them, warm and chatty, not like an advert. Factual: use only what's below, never invent anything.

Shape:
- A friendly opening line that says what's coming up, where and when.
- The room, then the house and what it's like to live there${f.wholeLet ? '' : ', and who lives there now (described, never named — e.g. "there are three of us: a software developer, a nurse and a student")'}.
- If fewer people are described in who_lives_there_now than people_living_there_now, say "including" (e.g. "there are four of us, including a software developer and a nurse") — never imply the list is everyone.
- Getting around (nearest stations), in passing.
- The money plainly: rent, whether bills are included, the deposit.
- A friendly close inviting people to message or comment for a viewing${f.link ? `, with this link to the photos and details: ${f.link}` : ''}.
- 120–220 words. Short paragraphs with line breaks. 2–4 emoji at most. British English. No hashtags.
- Never mention a minimum stay, fixed term or contract length. Never say who can't apply (no "no DSS", ages, genders, couples rules) — describing who lives there now is fine.
${f.tone.trim() ? `\nThe office's notes — follow these: ${f.tone.trim()}\n` : ''}
What we know (JSON): ${JSON.stringify(facts)}
${f.description ? `\nThe advert's description, for detail:\n"""\n${f.description.slice(0, 5000)}\n"""` : ''}

Reply with ONLY the post.` }],
  })
  const out = (res.content.find((b: any) => b.type === 'text') as any)?.text?.trim()
  if (!out) throw new Error('The AI returned nothing')
  return out.replace(/^"|"$/g, '').trim()
}

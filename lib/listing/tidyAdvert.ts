// Tidy an advert's description into one clear layout (12 Nov 2026, Harry: "marketing text when imported from SpareRoom
// could be tidied up and made sure the layout is suitable and follows a clear structure"). The words come from the
// advert itself — nothing is invented — rearranged under the same headings every time:
//   an opening paragraph, then ## The room · ## The house · ## Who you'd live with · ## The area · ## Bills and costs
//   · ## Good to know   (a heading is left out when the advert says nothing for it)
// Takes out what an advert mustn't or needn't say: phone numbers, emails and links (enquiries come to us), minimum or
// fixed terms (Renters' Rights Act), "No DSS" / benefits / nationality-type rules (unlawful), SHOUTING, emoji clutter.
// Plain text: "## " starts a heading, "- " a bullet (components/listing/AdvertText). Server-only.
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL } from '@/lib/ai-classify'

export async function tidyAdvert(text: string, o: { wholeLet: boolean; place: string }): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('The AI key isn’t set up')
  const src = String(text ?? '').trim()
  if (!src) return ''
  const client = new Anthropic()
  const res = await client.messages.create({
    model: AI_MODEL, max_tokens: 2500,
    messages: [{ role: 'user', content: `You tidy property adverts for Capital Rooms, a London letting agent. Rewrite this advert's description into a clear, consistent layout. It's ${o.wholeLet ? 'a whole home let to one household' : 'a room in a shared house'} in ${o.place}.

Rules:
- Use ONLY facts in the original. Never invent amenities, distances, rules or people. Keep every real fact (sizes, stations and walking times, what's included, furniture, appliances, who lives there).
- Layout, in plain text:
  1. An opening paragraph of 2–3 sentences that sells it (no heading).
  2. Then these headings, each on its own line starting with "## ", in this order, leaving out any the original says nothing about:
     ## The room${o.wholeLet ? ' (call it "## The home" for a whole let)' : ''}
     ## The house${o.wholeLet ? ' (leave out for a whole let)' : ''}
     ## Who you’d live with${o.wholeLet ? ' (leave out for a whole let)' : ''}
     ## The area
     ## Bills and costs
     ## Good to know
  3. Under a heading: one short paragraph, or "- " bullets for lists of things (furniture, what's included, stations).
- British English, warm and plain, sentence case. No shouting in capitals, no emoji, no exclamation marks in a row, no "!!!".
- Take out: phone numbers, email addresses, website links, "text/call/WhatsApp me", agent or landlord names; any minimum stay, fixed term or contract length (not allowed under the Renters' Rights Act — say nothing about length); "No DSS", benefits, nationality, religion, age, gender or couples rules (say nothing instead); deposit amounts above 5 weeks' rent.
- Keep it about the same length as the original or shorter. Don't add a sign-off.

Reply with ONLY the tidied description.

The original:
"""
${src.slice(0, 8000)}
"""` }],
  })
  const out = (res.content.find((b: any) => b.type === 'text') as any)?.text?.trim()
  if (!out) throw new Error('The AI returned nothing')
  return out.replace(/^"""|"""$/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

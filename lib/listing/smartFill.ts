// Fill a listing's gaps from its own advert (9 Nov 2026, Harry: a SpareRoom import left the summary, key features, type,
// bedrooms and more empty though the description said it all — "it could all be a lot smarter"). Reads the headline,
// description and what's known of the house; only EMPTY fields are filled, and anything that disagrees is flagged —
// never changed. Server only.
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL } from '@/lib/ai-classify'
import { isWholeLet } from '@/lib/lettings/letWording'

export interface SmartFill {
  fields: Record<string, unknown>
  checks: string[]
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    features: { type: 'array', items: { type: 'string' } },
    property_type: { type: 'string', enum: ['', 'house_share', 'flat_share', 'flat', 'house', 'studio', 'maisonette'] },
    bedrooms: { type: 'integer' },
    bathrooms: { type: 'integer' },
    furnished: { type: 'string', enum: ['', 'furnished', 'part', 'unfurnished'] },
    outside_space: { type: 'string' },
    broadband: { type: 'string' },
    parking: { type: 'string' },
    heating: { type: 'string' },
    display_address: { type: 'string' },
    checks: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'features', 'property_type', 'bedrooms', 'bathrooms', 'furnished', 'outside_space', 'broadband', 'parking', 'heating', 'display_address', 'checks'],
} as const

const blank = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length)

export async function smartFill(l: Record<string, any>, house: { name?: string | null; address?: string | null; postcode?: string | null; property_type?: string | null } | null, roomName: string | null): Promise<SmartFill> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('The AI key isn’t set up')
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  const known = {
    headline: l.headline, rent: l.rent, rent_frequency: l.rent_frequency, available_from: l.available_from, bills_included: l.bills_included,
    deposit: l.deposit, council_tax_band: l.council_tax_band, property_type: l.property_type, bedrooms: l.bedrooms, furnished: l.furnished,
  }
  const client = new Anthropic()
  const res = await client.messages.create({
    model: AI_MODEL, max_tokens: 1500, output_config: { format: { type: 'json_schema', schema: SCHEMA } } as any,
    messages: [{ role: 'user', content: `You help a London lettings agent (Capital Rooms) tidy a property advert. Today is ${today}.

The let: ${isWholeLet(house?.property_type, roomName) ? 'a whole property let to one household (a single let), not a room in a shared house' : 'a room or property'}.
House on file: ${String(house?.address || house?.name || '').replace(/\n/g, ', ')}${house?.postcode ? ` (${house.postcode})` : ''}.
What the listing already says (JSON): ${JSON.stringify(known)}

The advert headline: ${l.headline ?? ''}
The advert description:
"""
${String(l.description ?? '').slice(0, 6000)}
"""

Fill these from the advert ONLY — never invent. Use "" (or 0 for numbers) when the advert doesn't say.
- summary: one or two plain sentences for portal search results (max 220 characters), no emoji, no capitals for shouting.
- features: up to 10 short key features (max 60 characters each), no emoji, sentence case — e.g. "40th-floor city views", "Private balcony", "Pool, gym and 24-hour concierge".
- property_type: studio / flat / house / maisonette for a whole let; house_share or flat_share for a room.
- bedrooms (a studio is 0), bathrooms, furnished.
- outside_space (e.g. "Private balcony"), broadband (e.g. "Superfast fibre"), parking, heating.
- display_address: street or building and area for the public, e.g. "Bagshaw Building, Canary Wharf E14" — never a flat number.
- checks: plain-English problems an agent must fix before publishing: where the advert disagrees with the listing (e.g. the description says available January 2027 but the date is ${today}), shouting in capitals, wrong place names, a different property type, rent or deposit mentioned differently. Empty list if none.` }],
  })
  const text = (res.content.find((b: any) => b.type === 'text') as any)?.text
  if (!text) throw new Error('The AI returned nothing')
  const out = JSON.parse(text)
  const fields: Record<string, unknown> = {}
  const take = (k: string, v: unknown) => { if (blank(l[k]) && !blank(v) && v !== 0) fields[k] = v }
  take('summary', String(out.summary ?? '').slice(0, 300))
  take('features', (out.features ?? []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 10))
  take('property_type', out.property_type)
  if (blank(l.bedrooms) && (out.bedrooms > 0 || out.property_type === 'studio')) fields.bedrooms = out.property_type === 'studio' ? 0 : out.bedrooms
  if (blank(l.bathrooms) && out.bathrooms > 0) fields.bathrooms = out.bathrooms
  for (const k of ['furnished', 'outside_space', 'broadband', 'parking', 'heating', 'display_address']) take(k, out[k])
  return { fields, checks: (out.checks ?? []).map((x: unknown) => String(x)).filter(Boolean).slice(0, 8) }
}

// The writer for Publish (13 Nov 2026, Harry: "use market analysis within it or produce text based on text like we do
// with generate letter"). Rough notes in → every version out at once: headline, opening line, the message, the text,
// the app notification and the social caption — all from the same facts. Market figures can be woven in (official ONS
// and Land Registry numbers for the areas chosen, used exactly). Like the letter drafter (lib/letters/draftLetter) it
// never invents a fact: anything the notes didn't give becomes a [placeholder] and is listed back.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod/v4'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL_SMART } from '@/lib/ai-classify'
import { reportPacks } from '@/lib/rents/report'
import { packText } from '@/lib/rents/areaPack'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const WriteSchema = z.object({
  title: z.string().describe('The headline — also the email subject. Under 60 characters, specific, no clickbait, no emoji.'),
  intro: z.string().describe('One opening sentence (under 25 words) that says what this is about.'),
  preheader: z.string().describe('The inbox preview text shown after the subject line: under 90 characters, adds to the subject rather than repeating it.'),
  body: z.string().describe('The message in plain paragraphs separated by a blank line. No greeting (it is added), no sign-off, no headings, no bullet symbols.'),
  sms_text: z.string().describe('A text message version under 140 characters, starting "Capital Rooms:". A link and opt-out are added after it.'),
  push_title: z.string().describe('App notification title, under 40 characters.'),
  push_body: z.string().describe('App notification line, under 90 characters.'),
  social_caption: z.string().describe('An Instagram/Facebook caption: 2–4 short lines, warm, then 3–5 relevant hashtags (#LondonLandlords etc.). No made-up facts.'),
  missing: z.array(z.string()).describe('Facts the notes did not give that the text needs — each one matches a [placeholder] used in the text. Empty if none.'),
})
export type Written = z.infer<typeof WriteSchema>

export const TONES = { friendly: 'warm and friendly, like a trusted local agent', professional: 'clear and professional', celebratory: 'upbeat and celebratory (a milestone, the season, good news)', important: 'calm, clear and serious — something they need to know or do' } as const
export const REWRITES = { shorter: 'Make it noticeably shorter — keep only what matters.', friendlier: 'Make it warmer and friendlier.', formal: 'Make it more formal and businesslike.', cta: 'End with one clear thing for the reader to do (reply, call 0207 112 9163, or read more on the website) and make the headline lead to it.' } as const

export async function writePublication(s: SupabaseClient, o: {
  brief: string; tone?: keyof typeof TONES; length?: 'short' | 'standard'; audience?: string
  areas?: string[]; withMarket?: boolean; current?: Partial<Written>; rewrite?: keyof typeof REWRITES
}): Promise<Written> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI isn’t set up (ANTHROPIC_API_KEY)')
  const packs = o.withMarket ? await reportPacks(s, o.areas?.length ? o.areas : ['E12000007']) : []
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  const system = `You write announcements and news for Capital Rooms, a London lettings and property management agency, sent to ${o.audience || 'its landlords'} by email, text, app notification, its website and social media.
Today is ${today}. Write in British English, ${TONES[o.tone ?? 'friendly']}.
Rules:
- Use only facts in the notes (and the official figures, if given). Never invent dates, prices, names, offers or numbers — if the text needs one the notes didn't give, write a [placeholder in square brackets] and list it in "missing".
- Say "property" or "room", never "home". Under the Renters' Rights rules there are no fixed terms or minimum terms — never mention them.
- Plain, human sentences. No jargon, no "we are delighted to announce", no exclamation marks except one at most in a celebratory note.
- ${o.length === 'short' ? 'Keep the message to 60–110 words.' : 'Keep the message to 120–200 words.'}
- The greeting ("Dear …") and the sign-off and unsubscribe are added automatically — don't write them.`
  const facts = packs.length ? `\n\nOFFICIAL FIGURES (use exactly, name the source as "the latest ONS and Land Registry figures"):\n${packs.map(packText).join('\n\n')}` : ''
  const prompt = o.rewrite && o.current
    ? `Here is the current version:\n${JSON.stringify(o.current, null, 1)}\n\n${REWRITES[o.rewrite]} Keep every fact the same and rewrite all the versions to match.${facts}`
    : `What we want to say (rough notes from the office):\n${o.brief.trim()}${facts}`
  // the same way the letter drafter writes (lib/letters/draftLetter): structured, with a fallback on a decline
  const res = await client.beta.messages.parse({
    model: AI_MODEL_SMART, max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(WriteSchema) },
    system, messages: [{ role: 'user', content: prompt }],
  } as any)
  const out = (res as any).parsed_output as Written | null
  if (!out) throw new Error('The writing didn’t come back — try again')
  return out
}

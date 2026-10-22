// Reads every feedback form from one house and says what the tenants think would improve it most (22 Oct 2026).
// Names are never sent to the model — only scores and comments.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod/v4'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { FEEDBACK_AREAS, averages, type FeedbackRow } from '@/lib/feedback/areas'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const SummarySchema = z.object({
  headline: z.string().describe('One sentence on how the tenants feel about the house overall'),
  improvements: z.array(z.object({
    action: z.string().describe('A concrete thing we could do, e.g. "Replace the kitchen extractor fan"'),
    why: z.string().describe('What the tenants said that points to it, in a sentence — no names'),
    area: z.string().describe('Which area of the form it comes from'),
  })).describe('The best ways to improve the house, most worthwhile first. 3–6 items; fewer if there is little feedback'),
  going_well: z.array(z.string()).describe('Up to 3 short things tenants are happy with'),
})
export type FeedbackSummary = z.infer<typeof SummarySchema>

const SYSTEM = `You help a London HMO lettings and management agency (Capital Rooms) act on tenant feedback.
You get the anonymous feedback forms from one shared house: each area scored 1 (poor) to 5 (great), with optional comments.
Say what the tenants, taken together, think would most improve the house. Weigh how many people raise something and how low the scores are. Prefer practical actions the agency or landlord can take. Use UK English. Don't invent problems nobody mentioned; if the feedback is thin, say so in the headline.`

export async function summariseFeedback(house: string, rows: FeedbackRow[]): Promise<{ summary: FeedbackSummary } | { failed: 'refusal' | 'max_tokens' | 'unparsed' }> {
  const label = (k: string) => FEEDBACK_AREAS.find(a => a.key === k)?.label ?? k
  const forms = rows.map((r, i) => [
    `<form n="${i + 1}" date="${r.created_at.slice(0, 10)}">`,
    ...Object.entries(r.ratings ?? {}).map(([k, v]) => `${label(k)}: ${v}/5${r.comments?.[k] ? ` — "${r.comments[k]}"` : ''}`),
    ...Object.entries(r.comments ?? {}).filter(([k]) => !(k in (r.ratings ?? {}))).map(([k, v]) => `${label(k)} (not scored): "${v}"`),
    r.anything_else ? `Anything else: "${r.anything_else}"` : '',
    '</form>',
  ].filter(Boolean).join('\n')).join('\n\n')
  const avg = averages(rows).filter(a => a.average !== null).map(a => `${a.label}: ${a.average!.toFixed(1)} from ${a.count}`).join('\n')

  const res = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(SummarySchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `House: ${house}\n\n<averages>\n${avg}\n</averages>\n\n${forms}` }],
  })
  if (res.stop_reason === 'refusal') return { failed: 'refusal' }
  if (res.stop_reason === 'max_tokens') return { failed: 'max_tokens' }
  return res.parsed_output ? { summary: res.parsed_output } : { failed: 'unparsed' }
}

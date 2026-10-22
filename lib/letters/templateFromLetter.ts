// Turns a letter that's been written for one person into a reusable template (22 Oct 2026): a short name, who it's
// for, and the same wording with the one-off details (names, addresses, dates, amounts, references) swapped for
// [placeholders]. Used by Letters & Invoices → "Save as a template".
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod/v4'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const TemplateSchema = z.object({
  name: z.string().describe('A short name for the list, 2–6 words, e.g. "Late rent – second reminder"'),
  audience: z.enum(['tenant', 'landlord', 'contractor', 'anyone']).describe('Who this kind of letter is written to'),
  subject: z.string().describe('The subject line, with one-off details replaced by [placeholders]'),
  body: z.string().describe('The letter body word for word, keeping its formatting ("- " bullets, **bold**, "## " headings), with only the one-off details replaced by [placeholders]'),
})
export type LetterTemplateDraft = z.infer<typeof TemplateSchema>

const SYSTEM = `You turn a letter a UK lettings and property management agency (Capital Rooms) has written into a reusable template.
Keep the wording exactly as it is — don't improve or rewrite it. Replace only the details that will differ next time: people's names, addresses, house and room names, dates, money amounts, reference numbers and similar one-off facts. Use short descriptive placeholders in square brackets, e.g. [tenant name], [house], [amount owed], [date]. Use the same placeholder for the same fact throughout. Give it a short, plain name someone would recognise in a list.`

export async function templateFromLetter(letter: { subject: string; body: string }): Promise<{ template: LetterTemplateDraft } | { failed: 'refusal' | 'max_tokens' | 'unparsed' }> {
  const res = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(TemplateSchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `<subject>${letter.subject}</subject>\n<body>\n${letter.body}\n</body>` }],
  })
  if (res.stop_reason === 'refusal') return { failed: 'refusal' }
  if (res.stop_reason === 'max_tokens') return { failed: 'max_tokens' }
  return res.parsed_output ? { template: res.parsed_output } : { failed: 'unparsed' }
}

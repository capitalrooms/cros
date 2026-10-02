// Turns a typed instruction ("invoice Wings Properties £450 for October rent collection across 3 properties")
// into invoice lines for the standard Capital Rooms invoice (lib/invoices/landlordInvoice.ts). Used by the
// Letters & Invoices page. Never invents prices: anything not given comes back as a gap to fill in.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod/v4'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const InvoiceDraftSchema = z.object({
  title: z.string().describe('Short line under "Invoice", e.g. "Rent collection services — October 2026" or "Lettings fee"'),
  property_address: z.string().describe('The property the work relates to, if the instruction names one; otherwise ""'),
  items: z.array(z.object({
    description: z.string().describe('What is being charged, e.g. "Tenant find fee"'),
    detail: z.string().describe('Optional extra detail, e.g. "Room 3 — Jane Smith"; "" if none'),
    qty: z.number().describe('Quantity, usually 1; e.g. 2 for "£75 per tenant for 2 tenants"'),
    unit_price: z.number().nullable().describe('Price per unit in pounds, exactly as given. null if the instruction does not give it'),
  })).describe('One line per distinct charge'),
  missing: z.array(z.string()).describe('Anything the invoice needs that the instruction did not give, e.g. "Price for the inventory". Empty if none.'),
  cover_email: z.string().describe('A short covering email (2–3 sentences, plain text, starting "Dear …" and ending "Kind regards,") to send with the invoice attached'),
})
export type InvoiceDraft = z.infer<typeof InvoiceDraftSchema>

const SYSTEM = (company: string, today: string) => `You prepare invoices for ${company}, a UK lettings and property management agency in London.
Staff type a short instruction saying who to invoice and what for; you turn it into invoice lines. The invoice layout, numbering, dates, bank details and totals are added automatically.

Rules
- Use only the amounts in the instruction. Never invent or estimate a price, quantity, date or name. If a price is not given, set unit_price to null and add it to "missing".
- "£75 per tenant for 2 tenants" → qty 2, unit_price 75. "£450" for one thing → qty 1, unit_price 450.
- Amounts are in pounds. Capital Rooms is not VAT registered: never add VAT. If the instruction says "+ VAT", keep the amount as given and add "Confirm whether VAT applies" to "missing".
- Write descriptions in plain British English, in sentence case, e.g. "Rent collection and client account administration".
- Today is ${today}.`

export async function draftInvoice(input: {
  instructions: string
  recipient: { name?: string; role?: string }
  company: string
  current?: { title: string; items: { description: string; detail?: string; qty: number; unitPrice: number | null }[] } | null
  changes?: string
}): Promise<{ draft: InvoiceDraft } | { failed: 'refusal' | 'max_tokens' | 'unparsed' }> {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  const request = [
    `<recipient>${input.recipient.name || 'not given'}${input.recipient.role ? ` (our ${input.recipient.role})` : ''}</recipient>`,
    `<instruction>\n${input.instructions}\n</instruction>`,
    ...(input.current ? [
      `<current_invoice>\nTitle: ${input.current.title}\n${input.current.items.map(i => `- ${i.description}${i.detail ? ` (${i.detail})` : ''}: ${i.qty} × ${i.unitPrice ?? '?'}`).join('\n')}\n</current_invoice>`,
      input.changes ? `Revise the current invoice as follows, keeping everything else: ${input.changes}` : 'Tidy the current invoice, keeping its content.',
    ] : []),
  ].join('\n\n')

  const res = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(InvoiceDraftSchema) },
    system: SYSTEM(input.company, today),
    messages: [{ role: 'user', content: request }],
  })
  if (res.stop_reason === 'refusal') return { failed: 'refusal' }
  if (res.stop_reason === 'max_tokens') return { failed: 'max_tokens' }
  return res.parsed_output ? { draft: res.parsed_output } : { failed: 'unparsed' }
}

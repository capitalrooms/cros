// Drafts a formal letter from rough notes with Claude — used by the Document Generator
// (app/api/admin/document-generator/draft). Returns the letter text; the letterhead, address block and
// signature are added when the PDF is rendered (lib/letters/formalLetter.ts).

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod/v4'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { CLOSINGS, type FormalLetter } from '@/lib/letters/formalLetter'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const DraftSchema = z.object({
  subject: z.string().describe('Short subject for the "Re:" line, e.g. "Revised management fees from 1 January 2027"'),
  salutation: z.string().describe('e.g. "Dear Mr Smith" or "Dear Nigel" — no trailing comma'),
  body: z.string().describe('The letter body in the plain-text format described in the instructions — no salutation, closing or signature'),
  closing: z.enum(CLOSINGS),
  coverEmail: z.string().describe('A short covering email (2–4 sentences, plain text, starting "Dear …" and ending "Kind regards,") to send with the letter attached'),
  missing: z.array(z.string()).describe('Facts the letter needs that the notes did not give, each matching a [placeholder] used in the body. Empty if none.'),
})

const KIND_HINTS: Record<string, string> = {
  letter: 'a formal business letter',
  notice: 'a formal notice. State clearly what is being notified, the date it takes effect and what, if anything, the recipient must do',
  fees: 'a letter setting out our fees or charges. Put the fees in a table (service | fee | notes, as fits the information given) and state when they apply from and how they will be charged',
  other: 'a formal document',
}

const SYSTEM = (company: string, today: string) => `You write formal correspondence for ${company}, a UK lettings and property management agency in London.
Staff give you rough notes on what they want to say; you turn them into a finished letter that is ready to print on the company letterhead. The letterhead, date, recipient address, "Re:" line, salutation, closing and signature are added automatically — you write the salutation, subject, closing and body text only.

Writing style
- British English, plain and courteous; professional but not stiff. Short paragraphs. Write as "we" for the company.
- Say everything the notes ask for, in a sensible order: why we are writing, the details, what happens next or what we need from them, and a line inviting questions.
- Use only the facts in the notes, the recipient details and our contact details. Never invent figures, dates, names, addresses, legal clauses or policies. Where the letter needs a fact the notes did not give, write a short placeholder in square brackets, e.g. [effective date], and list it in "missing".
- Our own phone number, email and office address are given in <our_contact_details>. Use them exactly whenever the letter tells the reader how to reach us — never a placeholder for them. The recipient's own address is already printed above the letter; don't repeat it or leave a placeholder for it in the body (refer to "your room" or "the property" instead, or name it from the recipient details).
- Keep placeholders to facts only the sender can know (a date, an amount, a name). If a sentence would only exist to hold a placeholder and the notes don't need it, leave the sentence out.
- Legal or regulatory points (notices, deposits, fees under the Tenant Fees Act, etc.): state what the notes say accurately; do not add legal claims of your own.
- Closing: "Yours sincerely" when the recipient is addressed by name, "Yours faithfully" for "Dear Sir or Madam". Use "Kind regards" only if the notes ask for a friendlier letter.
- Salutation: use the title and surname for a formal letter ("Dear Mr Smith"); a first name only if the notes use one or ask for a friendlier tone.
- Today is ${today}. Write dates in full, e.g. 1 January 2027.

Body format (plain text — it is rendered to PDF exactly by these rules)
- Separate paragraphs with a blank line.
- "## " at the start of a line makes a short sub-heading — use sparingly, only in longer letters.
- "- " at the start of a line makes a bullet point.
- Tables use pipe rows, first row the header: "| Service | Fee |" then "| Tenant find | 8% of the annual rent + VAT |". Use a table for any list of fees, charges or amounts.
- **double asterisks** make words bold — use for key amounts and dates only.
- No salutation, sign-off, signature, date or address in the body.`

export type LetterDraft = z.infer<typeof DraftSchema>

export interface DraftInput {
  instructions: string
  kind?: string
  recipient: { name?: string; address?: string; role?: string }
  signer: { name: string; jobTitle?: string | null; directPhone?: string | null }
  company: string
  /** Our own contact details, so a "get in touch" line never needs a placeholder */
  contact?: { phone?: string | null; email?: string | null; address?: string | null }
  current?: FormalLetter | null
  changes?: string
}

/** Throws Anthropic API errors for the caller to report; a refusal, overlong or unreadable reply comes back as { failed }. */
export async function draftLetter(input: DraftInput): Promise<{ draft: LetterDraft } | { failed: 'refusal' | 'max_tokens' | 'unparsed' }> {
  const { recipient: r, signer, current, changes } = input
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  const recipient = [
    r.name ? `Name: ${r.name}` : 'Name: not given',
    r.role ? `They are our ${r.role}` : '',
    r.address ? `Address: ${String(r.address).replace(/\n/g, ', ')}` : '',
  ].filter(Boolean).join('\n')

  const request = [
    `Write ${KIND_HINTS[input.kind ?? ''] ?? KIND_HINTS.letter}.`,
    `<recipient>\n${recipient}\n</recipient>`,
    `<signed_by>${signer.name || 'a member of staff'}${signer.jobTitle ? `, ${signer.jobTitle}` : ''}, ${input.company}</signed_by>`,
    `<our_contact_details>\n${[
      input.contact?.phone ? `Phone: ${input.contact.phone}` : '',
      signer.directPhone ? `${signer.name || 'The signer'}'s direct line: ${signer.directPhone}` : '',
      input.contact?.email ? `Email: ${input.contact.email}` : '',
      input.contact?.address ? `Office: ${input.contact.address}` : '',
    ].filter(Boolean).join('\n') || 'Not given — say "please get in touch with us" without a number or address'}\n</our_contact_details>`,
    `<notes>\n${input.instructions}\n</notes>`,
    ...(current ? [
      `<current_draft>\nSubject: ${current.subject}\nSalutation: ${current.salutation}\n\n${current.body}\n\nClosing: ${current.closing}\n</current_draft>`,
      changes
        ? `Revise the current draft as follows, keeping everything else (including any edits the user made): ${changes}`
        : 'Improve the current draft, keeping its content.',
    ] : []),
  ].join('\n\n')

  const res = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // on a safety decline the API re-runs the request on a suitable fallback model
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(DraftSchema) },
    system: SYSTEM(input.company, today),
    messages: [{ role: 'user', content: request }],
  })
  if (res.stop_reason === 'refusal') return { failed: 'refusal' }
  if (res.stop_reason === 'max_tokens') return { failed: 'max_tokens' }
  return res.parsed_output ? { draft: res.parsed_output } : { failed: 'unparsed' }
}

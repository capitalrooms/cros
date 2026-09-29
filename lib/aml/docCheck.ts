// AI reading of AML documents (ID, proof of address, proof of ownership) so a reviewer can see at a
// glance whether each document supports what the landlord typed. Findings are advisory — a person
// confirms every check before the review is signed off.
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL_SMART } from '@/lib/ai-classify'
import { svc, DOCS_BUCKET } from '@/lib/landlordOnboarding/store'

export type DocKind = 'id' | 'address' | 'ownership'

export interface DocReading {
  path: string
  kind: DocKind
  ok: boolean
  error?: string
  fields: {
    full_name?: string
    names_on_document?: string[]
    date_of_birth?: string
    document_type?: string
    document_number_last4?: string
    expiry_date?: string
    issue_date?: string
    address?: string
    postcode?: string
    issuer?: string
    property_address?: string
    title_number?: string
    concerns?: string[]
    legible?: boolean
  }
}

const PROMPTS: Record<DocKind, string> = {
  id: `This image is a document uploaded as photo identification for an anti-money-laundering check by a UK letting agent.
Return ONLY JSON:
{"document_type": "Passport | Driving licence | National ID card | Not an identity document",
 "full_name": "full name as printed", "date_of_birth": "YYYY-MM-DD", "expiry_date": "YYYY-MM-DD",
 "document_number_last4": "last 4 characters only", "legible": true/false,
 "concerns": ["short notes on anything a compliance officer should question: signs of editing, photo of a screen, photocopy, cropped details, mismatched fonts, expired, not an ID document"]}
Omit fields you cannot read. Use [] for concerns if none.`,
  address: `This document was uploaded as proof of residential address for a UK anti-money-laundering check (acceptable: utility bill, bank statement, council tax bill, HMRC letter, dated within 3 months).
Return ONLY JSON:
{"document_type": "e.g. Utility bill / Bank statement / Council tax bill / Other", "issuer": "organisation",
 "names_on_document": ["each person named"], "address": "full address", "postcode": "UK postcode", "issue_date": "YYYY-MM-DD",
 "legible": true/false, "concerns": ["anything to question: not an acceptable document type, signs of editing, missing date, cropped"]}
Omit fields you cannot read. Use [] for concerns if none.`,
  ownership: `This document was uploaded as proof of property ownership or right to let (e.g. Land Registry title, mortgage statement, council tax bill for the property, completion statement).
Return ONLY JSON:
{"document_type": "short description", "names_on_document": ["registered owners or account holders"], "property_address": "address of the property",
 "postcode": "postcode", "title_number": "if shown", "issue_date": "YYYY-MM-DD",
 "legible": true/false, "concerns": ["anything to question: names differ, document type does not show ownership, signs of editing"]}
Omit fields you cannot read. Use [] for concerns if none.`,
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_PDF_BYTES = 25 * 1024 * 1024

export async function readDocument(path: string, kind: DocKind): Promise<DocReading> {
  try {
    const { data, error } = await svc().storage.from(DOCS_BUCKET).download(path)
    if (error || !data) return { path, kind, ok: false, error: 'File could not be opened', fields: {} }
    const buf = Buffer.from(await data.arrayBuffer())
    const isPdf = path.endsWith('.pdf')
    const mime = isPdf ? 'application/pdf' : path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    if (buf.length > (isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) {
      return { path, kind, ok: false, error: 'Too large for automatic reading — check by eye', fields: {} }
    }
    const b64 = buf.toString('base64')
    const block = isPdf
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } } as unknown as Anthropic.ImageBlockParam)
      : ({ type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: b64 } } as Anthropic.ImageBlockParam)
    const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }).messages.create({
      model: AI_MODEL_SMART,
      max_tokens: 800,
      messages: [{ role: 'user', content: [block, { type: 'text', text: `Today's date is ${new Date().toISOString().slice(0, 10)}.\n${PROMPTS[kind]}` }] }],
    })
    const raw = msg.content.map(c => (c.type === 'text' ? c.text : '')).join('')
    const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}'
    return { path, kind, ok: true, fields: JSON.parse(json) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    const friendly = /pdf/i.test(msg) ? 'The PDF could not be opened (it may be damaged or password-protected)'
      : /image/i.test(msg) ? 'The image could not be opened'
      : 'Automatic reading was unavailable'
    return { path, kind, ok: false, error: friendly, fields: {} }
  }
}

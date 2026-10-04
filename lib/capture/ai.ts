// The capture inbox's reading (migration 204). Server only.
//   quickLook   cheap first look (small image, Haiku): what is it and which property — before anything costly
//   readSheet   a photographed smoke-alarm / fire-door check sheet → one row per check
//   readBill    a bill or invoice → supplier, amount, period, account number, what it's for
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL, AI_MODEL_SMART } from '@/lib/ai-classify'

export const CAPTURE_KINDS = {
  room_photo: 'Room photo',
  property_photo: 'Property photo (outside, communal)',
  letter: 'Letter or post about a property',
  bill: 'Bill or invoice',
  certificate: 'Certificate or safety report',
  safety_sheet: 'Handwritten safety checks (smoke alarms / fire doors)',
  receipt: 'Receipt',
  company_post: 'Company post (not about one property)',
  other: 'Something else',
} as const
export type CaptureKind = keyof typeof CAPTURE_KINDS

function media(bytes: Buffer, mime: string): any {
  if (mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } }
  const mt = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime) ? mime : 'image/jpeg'
  return { type: 'image', source: { type: 'base64', media_type: mt, data: bytes.toString('base64') } }
}
async function ask<T>(model: string, content: any[], schema: object, maxTokens = 1024): Promise<T> {
  const client = new Anthropic()
  const res = await client.messages.create({ model, max_tokens: maxTokens, output_config: { format: { type: 'json_schema', schema } } as any, messages: [{ role: 'user', content }] })
  const text = (res.content.find((b: any) => b.type === 'text') as any)?.text
  if (!text) throw new Error('The AI returned nothing')
  return JSON.parse(text) as T
}

const LOOK_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: Object.keys(CAPTURE_KINDS) },
    confidence: { type: 'number' },
    title: { type: 'string' },
    property_number: { type: 'string' },
    room: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['kind', 'confidence', 'title', 'property_number', 'room', 'reason'],
} as const

export interface Look { kind: CaptureKind; confidence: number; title: string; propertyId: string | null; room: string; reason: string }

/** A first look at a small copy of the photo or the first page of a PDF. */
export async function quickLook(bytes: Buffer, mime: string, properties: { id: string; label: string }[]): Promise<Look> {
  const list = properties.map((p, i) => `${i + 1}. ${p.label}`).join('\n')
  const out = await ask<any>(AI_MODEL, [media(bytes, mime), { type: 'text', text:
`A UK lettings agent photographed or shared this from their phone. Say what it is, so it can be filed.

kind — one of:
- room_photo: inside a bedroom or a specific room
- property_photo: outside of a house, or a shared area (kitchen, hallway, garden, bathroom)
- letter: a letter or post about one property (council, utility, landlord, tenant)
- bill: a bill or supplier invoice (energy, water, broadband, council tax, a trade invoice)
- certificate: a gas, electrical, fire, EPC, PAT or other safety certificate or inspection report
- safety_sheet: a handwritten or ticked sheet of smoke alarm / fire door checks
- receipt: a till receipt
- company_post: post for the company itself (HMRC, bank, insurance for the business, Companies House)
- other

title: a short name for it, e.g. "Thames Water bill — 12 Saltwell St", "Bedroom — Room 3", "Smoke alarm checks Jul–Dec".
property_number: if an address on it matches one of these properties, its number from the list; otherwise "".
room: a room it names, e.g. "Room 3", "Kitchen"; otherwise "".
reason: a few words on why.
confidence: 0 to 1.

Properties:
${list}` }], LOOK_SCHEMA, 400)
  const n = Number(out.property_number)
  return { kind: out.kind in CAPTURE_KINDS ? out.kind : 'other', confidence: Number(out.confidence) || 0, title: String(out.title ?? '').slice(0, 120), propertyId: n >= 1 && n <= properties.length ? properties[n - 1].id : null, room: String(out.room ?? ''), reason: String(out.reason ?? '') }
}

const SHEET_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    rows: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      date: { type: 'string' }, check: { type: 'string', enum: ['smoke_alarm', 'fire_door'] }, location: { type: 'string' },
      result: { type: 'string', enum: ['ok', 'fault', 'unclear'] }, checked_by: { type: 'string' }, notes: { type: 'string' },
    }, required: ['date', 'check', 'location', 'result', 'checked_by', 'notes'] } },
    unreadable: { type: 'string' },
  },
  required: ['rows', 'unreadable'],
} as const
export interface SheetRow { date: string; check: 'smoke_alarm' | 'fire_door'; location: string; result: 'ok' | 'fault' | 'unclear'; checked_by: string; notes: string }

/** Every check on a photographed sheet, one row each. Dates as yyyy-mm-dd. */
export async function readSheet(bytes: Buffer, mime: string, year: number): Promise<{ rows: SheetRow[]; unreadable: string }> {
  return ask(AI_MODEL_SMART, [media(bytes, mime), { type: 'text', text:
`This is a photographed sheet where tenants or staff record smoke alarm tests and/or fire door checks in a UK house share. Read every entry.

One row per check: if a line covers both a smoke alarm test and a fire door check, give two rows.
- date: yyyy-mm-dd. If the year isn't written, assume ${year} (or ${year - 1} for months after the current one).
- check: smoke_alarm or fire_door
- location: where, if written (e.g. "Landing", "Room 2 door"), else ""
- result: ok if ticked / "working" / "fine"; fault if a problem is noted; unclear if you can't tell
- checked_by: the name or initials written, else ""
- notes: anything else written on that line, else ""
Don't invent entries. Put anything you couldn't read in "unreadable".` }], SHEET_SCHEMA, 4000)
}

const BILL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    supplier: { type: 'string' }, what_for: { type: 'string' }, amount: { type: 'number' }, due_date: { type: 'string' },
    period_from: { type: 'string' }, period_to: { type: 'string' }, account_number: { type: 'string' }, invoice_number: { type: 'string' },
    direct_debit: { type: 'boolean' }, address: { type: 'string' },
  },
  required: ['supplier', 'what_for', 'amount', 'due_date', 'period_from', 'period_to', 'account_number', 'invoice_number', 'direct_debit', 'address'],
} as const
export interface Bill { supplier: string; what_for: string; amount: number; due_date: string; period_from: string; period_to: string; account_number: string; invoice_number: string; direct_debit: boolean; address: string }

/** The facts on a bill or invoice. Dates yyyy-mm-dd; "" / 0 when not shown. */
export async function readBill(bytes: Buffer, mime: string): Promise<Bill> {
  return ask(AI_MODEL, [media(bytes, mime), { type: 'text', text:
`Read this UK bill or invoice. supplier: the company billing. what_for: e.g. "Electricity", "Water", "Boiler repair". amount: the total to pay this time in pounds (0 if none). due_date / period_from / period_to: yyyy-mm-dd or "". account_number, invoice_number: as printed or "". direct_debit: true if it says it's paid by direct debit. address: the supply or property address on it, else "". Don't guess.` }], BILL_SCHEMA, 600)
}

// ── invoices by email (migration 208): is this a cost at all, what are the facts, and where does it belong ──
export const COMPANY_CATEGORIES = ['Software & subscriptions', 'Phone & internet', 'Office & stationery', 'Advertising & listings', 'Professional fees', 'Insurance', 'Bank & card charges', 'Travel', 'Training & memberships', 'Equipment', 'Other'] as const
const INVOICE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    is_cost: { type: 'boolean' }, doc_type: { type: 'string', enum: ['invoice', 'receipt', 'bill', 'credit_note', 'statement', 'order_confirmation', 'not_a_cost'] },
    supplier: { type: 'string' }, what_for: { type: 'string' }, amount: { type: 'number' }, date: { type: 'string' }, due_date: { type: 'string' },
    invoice_number: { type: 'string' }, already_paid: { type: 'boolean' }, address: { type: 'string' }, property_number: { type: 'string' }, room: { type: 'string' },
    belongs_to: { type: 'string', enum: ['landlord', 'company', 'unsure'] }, company_category: { type: 'string', enum: [...COMPANY_CATEGORIES] },
    reason: { type: 'string' }, confidence: { type: 'number' },
  },
  required: ['is_cost', 'doc_type', 'supplier', 'what_for', 'amount', 'date', 'due_date', 'invoice_number', 'already_paid', 'address', 'property_number', 'room', 'belongs_to', 'company_category', 'reason', 'confidence'],
} as const
export interface InvoiceRead {
  is_cost: boolean; doc_type: string; supplier: string; what_for: string; amount: number; date: string; due_date: string; invoice_number: string
  already_paid: boolean; address: string; propertyId: string | null; room: string; belongs_to: 'landlord' | 'company' | 'unsure'; company_category: string; reason: string; confidence: number
}

/** Read an emailed invoice/receipt (or the email itself): the facts, and whether it's a property cost or the company's. */
export async function readInvoice(bytes: Buffer | null, mime: string, email: { from: string; subject: string; text: string }, properties: { id: string; label: string }[]): Promise<InvoiceRead> {
  const list = properties.map((p, i) => `${i + 1}. ${p.label}`).join('\n')
  const content: any[] = bytes ? [media(bytes, mime)] : []
  content.push({ type: 'text', text:
`A UK lettings and property-management company forwards ALL its email here. Decide if this is a cost the company has to account for, and read it exactly. Never guess a figure.

Email from: ${email.from}
Subject: ${email.subject}
${bytes ? 'The attached document is above. ' : ''}Email text (may be cut short):
${email.text.slice(0, 6000)}

is_cost: true only for an invoice, bill, receipt or paid order for goods or services; false for newsletters, marketing, quotes, delivery updates, statements of account, personal email, anything else.
doc_type: what it is.
supplier: who is charging. what_for: a few words, e.g. "Boiler repair", "Zoom subscription", "Rightmove listing".
amount: the total charged in pounds, VAT included (0 if not shown). credit notes: the amount as a positive number with doc_type credit_note.
date: the invoice or payment date, yyyy-mm-dd. due_date: yyyy-mm-dd or "". invoice_number: as printed or "".
already_paid: true if it says paid / payment received / receipt.
address: a property address on it (supply or works address), else "".
property_number: if that address matches one of the company's managed properties below, its number; else "".
room: a room it names, e.g. "Room 3", else "".
belongs_to: "landlord" if it's for work, supplies or utilities at one of those properties (charged to that property's landlord); "company" if it's the business's own cost (software, phone, advertising, accountant, office, travel, insurance for the business); "unsure" otherwise.
company_category: the best fit if it's a company cost (else "Other").
reason: a few words on how you decided. confidence: 0 to 1 that the amount and belongs_to are right.

Managed properties:
${list}` })
  const out = await ask<any>(AI_MODEL_SMART, content, INVOICE_SCHEMA, 700)
  const n = Number(out.property_number)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : ''
  return {
    ...out, amount: Math.round(Math.abs(Number(out.amount) || 0) * 100) / 100, date,
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(out.due_date) ? out.due_date : '',
    propertyId: n >= 1 && n <= properties.length ? properties[n - 1].id : null,
    confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)),
  }
}

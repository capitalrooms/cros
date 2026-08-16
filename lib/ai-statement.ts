import Anthropic from '@anthropic-ai/sdk'

// Reuse the same model config as the document classifier.
export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5'

// Structured shape the statement uploader gets back. All money fields are
// returned as plain numbers (GBP), dates as ISO yyyy-mm-dd, and any field the
// AI can't find is returned empty ("" or 0) — never guessed.
export interface ExtractedRoom {
  room_number: number
  tenant_name: string
  rent_income: number
  management_fee: number
}
export interface ExtractedExpense {
  description: string
  amount: number
}
export interface ExtractedStatement {
  statement_reference: string
  property_address: string
  landlord_name: string
  statement_date: string
  period_start: string
  period_end: string
  management_fee_pct: number
  rooms: ExtractedRoom[]
  expenses: ExtractedExpense[]
  gross_rent: number
  management_fees: number
  property_charges: number
  net_to_landlord: number
  amount_paid: number
  paid_date: string
  summary: string
  confidence: number
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    statement_reference: { type: 'string' },
    property_address: { type: 'string' },
    landlord_name: { type: 'string' },
    statement_date: { type: 'string' },
    period_start: { type: 'string' },
    period_end: { type: 'string' },
    management_fee_pct: { type: 'number' },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          room_number: { type: 'number' },
          tenant_name: { type: 'string' },
          rent_income: { type: 'number' },
          management_fee: { type: 'number' },
        },
        required: ['room_number', 'tenant_name', 'rent_income', 'management_fee'],
      },
    },
    expenses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['description', 'amount'],
      },
    },
    gross_rent: { type: 'number' },
    management_fees: { type: 'number' },
    property_charges: { type: 'number' },
    net_to_landlord: { type: 'number' },
    amount_paid: { type: 'number' },
    paid_date: { type: 'string' },
    summary: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'statement_reference', 'property_address', 'landlord_name', 'statement_date',
    'period_start', 'period_end', 'management_fee_pct', 'rooms', 'expenses',
    'gross_rent', 'management_fees', 'property_charges',
    'net_to_landlord', 'amount_paid', 'paid_date', 'summary', 'confidence',
  ],
} as const

const PROMPT = `You are a UK property-management accountant's assistant. You are given a single landlord rental statement (a PDF or scan) produced by a lettings agency for one property (usually a shared house / HMO with several rooms), covering one period (usually a month, sometimes a partial period).

Extract the figures exactly as printed — do not recompute or "correct" them. Rules:
1. Money fields are plain GBP numbers with no symbols or commas (e.g. 6780.00). Use 0 only if genuinely absent.
2. Dates are ISO yyyy-mm-dd. Leave a date "" if not present. Never guess.
3. rooms: one entry per occupied room's rent line, in room-number order. For each: room_number (1,2,3…; infer sequentially if the statement lists rooms without explicit numbers), tenant_name (the tenant in that room), rent_income (rent received for that room this period), management_fee (the agency fee charged on that room; 0 if the fee is only shown as a single total).
4. expenses: one entry per itemised property cost/deduction that is NOT the management fee (e.g. broadband, cleaning, a repair, a subscription). Each with description and amount. Empty array if none.
5. management_fee_pct: the management fee percentage applied (e.g. 12). 0 if not stated.
6. Totals as printed: gross_rent (total rent across rooms), management_fees (total agency fee), property_charges (total of the expenses), net_to_landlord (final amount due), amount_paid, paid_date.
7. statement_reference, property_address, landlord_name, statement_date, period_start, period_end as labelled.
8. confidence: 0–1. summary: one short sentence, e.g. "Statement LS1001 for 71 Alloa Road — Jul 2026, 7 rooms, £7,200 gross, £5,690.23 net".`

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY
}

/** Extract structured statement data from a single uploaded file. Throws on API/config errors. */
export async function extractStatement(bytes: Buffer, mime: string): Promise<ExtractedStatement> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  const b64 = bytes.toString('base64')
  const isPdf = mime === 'application/pdf'
  const media: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)
            ? mime
            : 'image/jpeg') as any,
          data: b64,
        },
      }

  const client = new Anthropic()
  const res = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } } as any,
    messages: [{ role: 'user', content: [media, { type: 'text', text: PROMPT }] }],
  })
  const textBlock = res.content.find((b: any) => b.type === 'text') as any
  if (!textBlock?.text) throw new Error('The AI returned no result')
  return JSON.parse(textBlock.text) as ExtractedStatement
}

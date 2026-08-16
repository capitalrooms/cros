import Anthropic from '@anthropic-ai/sdk'

// One capable model handles classify + extract in a single call.
// Swap to claude-sonnet-5 / claude-haiku-4-5 via AI_MODEL for a cheaper run.
export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5'

export const DOC_TYPES = [
  'gas_safety_certificate',
  'electrical_eicr',
  'epc',
  'insurance',
  'tenancy_agreement',
  'tenant_reference',
  'other',
] as const

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    doc_type: { type: 'string', enum: DOC_TYPES },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    issue_date: { type: 'string' },
    expiry_date: { type: 'string' },
    provider: { type: 'string' },
    policy_number: { type: 'string' },
    property_address: { type: 'string' },
    person_name: { type: 'string' },
    person_phone: { type: 'string' },
    person_email: { type: 'string' },
    occupation: { type: 'string' },
    annual_income: { type: 'string' },
    previous_address: { type: 'string' },
    tenancy_start: { type: 'string' },
    tenancy_end: { type: 'string' },
    monthly_rent: { type: 'string' },
  },
  required: [
    'doc_type', 'confidence', 'summary', 'issue_date', 'expiry_date', 'provider',
    'policy_number', 'property_address', 'person_name', 'person_phone', 'person_email',
    'occupation', 'annual_income', 'previous_address', 'tenancy_start', 'tenancy_end', 'monthly_rent',
  ],
} as const

const PROMPT = `You are a UK lettings/property administrator's assistant. You are given a single uploaded document (a scan, photo, or PDF).

1. Classify it as exactly one of: gas_safety_certificate, electrical_eicr (an EICR / electrical installation condition report), epc (energy performance certificate), insurance (buildings/landlord insurance), tenancy_agreement (an AST / assured shorthold tenancy), tenant_reference (a referencing report about a prospective tenant), or other.
2. Extract the fields defined by the schema. Use ISO dates (yyyy-mm-dd). Leave a field as an empty string "" if it isn't present — never guess.
3. Set confidence between 0 and 1 for the classification.
4. Write "summary" as one short human sentence an admin can confirm, e.g. "Gas safety certificate for 12 Saltwell Street, expires 14 Aug 2027" or "Tenant reference for Jordan Michaels — nurse, £34,000/yr".

Field guidance: provider = the issuing engineer/company/insurer; policy_number = insurance policy or certificate number; property_address = the property the document concerns; person_* = the tenant/applicant on a reference or tenancy; occupation/annual_income/previous_address come from tenant references; tenancy_start/tenancy_end/monthly_rent come from tenancy agreements.`

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY
}

/** Classify + extract a single document. Throws on API/config errors. */
export async function classifyDocument(bytes: Buffer, mime: string) {
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
  return JSON.parse(textBlock.text)
}

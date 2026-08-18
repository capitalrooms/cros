import Anthropic from '@anthropic-ai/sdk'

// One capable model handles classify + extract in a single call.
// Swap to claude-sonnet-5 / claude-haiku-4-5 via AI_MODEL for a cheaper run.
export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5'

export const DOC_TYPES = [
  // ── Compliance certificates (→ properties table fields)
  'gas_safety_certificate',
  'electrical_eicr',
  'emergency_lighting_certificate',
  'fire_alarm_certificate',
  'pat_test',
  'hmo_licence',
  'epc',
  'insurance',
  // ── Tenancy documents (→ tenancies table)
  'tenancy_agreement',
  'deposit_certificate',
  // ── Tenant / applicant documents (→ people table)
  'tenant_reference',
  'right_to_rent',
  // ── Property information documents (→ property_documents table, shown to tenants)
  'evacuation_plan',
  'emergency_contacts',
  'house_rules',
  'policy_document',
  'council_correspondence',
  'utility_bill',
  'landlord_statement_tenant',
  'safety_info',
  'inventory',
  'wifi_details',
  'waste_schedule',
  // ── Expense / purchasing documents (→ property_documents, admin only)
  'supplier_invoice',
  'purchase_receipt',
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

1. Classify it as exactly one of:
   - gas_safety_certificate — annual gas safety record (CP12)
   - electrical_eicr — electrical installation condition report
   - emergency_lighting_certificate — emergency lighting test/inspection certificate
   - fire_alarm_certificate — fire alarm / smoke detection service or inspection certificate
   - pat_test — portable appliance testing (PAT) certificate
   - hmo_licence — HMO (house in multiple occupation) licence
   - epc — energy performance certificate
   - insurance — buildings or landlord insurance schedule
   - tenancy_agreement — APT (assured private tenancy) or any tenancy/licence agreement
   - deposit_certificate — tenancy deposit protection certificate (TDS, DPS, mydeposits)
   - tenant_reference — referencing report about a prospective or current tenant
   - right_to_rent — right to rent check document or share code confirmation
   - evacuation_plan — emergency/fire evacuation route, assembly point plan
   - emergency_contacts — list of important contacts (landlord, emergency services, utilities, building manager)
   - house_rules — house rules, tenancy conditions, communal guidelines
   - policy_document — any formal policy document (pets, smoking, parking, noise)
   - council_correspondence — letters, notices, or decisions from the local council or authority
   - utility_bill — gas, electricity, water, broadband or service charge bill or account letter
   - landlord_statement_tenant — a financial or rental statement addressed to or about a tenant
   - safety_info — general safety notices, COSHH data sheets, hazard information
   - inventory — property inventory, check-in or check-out report
   - wifi_details — broadband, Wi-Fi or internet access details
   - waste_schedule — bin collection days, recycling guide, waste disposal rules
   - supplier_invoice — invoice from a supplier, contractor, or tradesperson for work or goods at a property
   - purchase_receipt — till receipt, order confirmation, or proof of purchase for items bought for a property (e.g. furniture, appliances, fixtures)
   - other — anything that doesn't fit the above

2. Extract the fields defined by the schema. Use ISO dates (yyyy-mm-dd). Leave a field as an empty string "" if it isn't present — never guess.
3. Set confidence between 0 and 1 for the classification.
4. Write "summary" as one short human sentence an admin can confirm at a glance, e.g. "Gas safety certificate for 12 Saltwell Street, expires 14 Aug 2027" or "APT for Jordan Michaels at Room 3, 22 Church Lane — £950/month".

Field guidance:
- provider = issuing engineer / company / insurer / licensing authority / referencing company
- policy_number = insurance policy number, certificate reference, licence number, or deposit certificate number
- property_address = the full address the document concerns
- issue_date = date issued, inspected, or signed
- expiry_date = expiry, renewal due, or next-inspection date
- person_name / person_email / person_phone = tenant, applicant, or named person on the document
- occupation / annual_income / previous_address = from tenant references
- tenancy_start / tenancy_end / monthly_rent = from tenancy agreements or deposit certificates`

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

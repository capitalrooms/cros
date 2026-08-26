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
    // ── Purchase / invoice extraction (for the Purchases + Works Carried Out features)
    purchase_category: { type: 'string' },
    item_name: { type: 'string' },
    item_make_model: { type: 'string' },
    amount: { type: 'string' },
    work_description: { type: 'string' },
  },
  required: [
    'doc_type', 'confidence', 'summary', 'issue_date', 'expiry_date', 'provider',
    'policy_number', 'property_address', 'person_name', 'person_phone', 'person_email',
    'occupation', 'annual_income', 'previous_address', 'tenancy_start', 'tenancy_end', 'monthly_rent',
    'purchase_category', 'item_name', 'item_make_model', 'amount', 'work_description',
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
- provider = issuing engineer / company / insurer / licensing authority / referencing company. For supplier_invoice / purchase_receipt this is the contractor, supplier, or shop.
- policy_number = insurance policy number, certificate reference, licence number, or deposit certificate number
- property_address = the full address the document concerns
- issue_date = date issued, inspected, or signed. For a purchase_receipt this is the purchase date; for a supplier_invoice the invoice date.
- expiry_date = expiry, renewal due, or next-inspection date
- person_name / person_email / person_phone = tenant, applicant, or named person on the document
- occupation / annual_income / previous_address = from tenant references
- tenancy_start / tenancy_end / monthly_rent = from tenancy agreements or deposit certificates

Purchase & invoice fields (leave "" unless the document is a purchase_receipt or supplier_invoice):
- amount = the total amount, digits only with no currency symbol (e.g. "349.99"). For a supplier_invoice, the invoiced total. For a purchase_receipt, the price paid.
- work_description = for a supplier_invoice, a short description of the work or service done (e.g. "Replaced kitchen tap washer and re-sealed sink"). Leave "" for receipts.
- item_name = for a purchase_receipt, the main item bought (e.g. "Dishwasher", "Wardrobe", "Laminate flooring"). Leave "" for invoices.
- item_make_model = for a purchase_receipt, the make/model if shown (e.g. "Bosch Series 4"). Leave "" otherwise.
- purchase_category = for a purchase_receipt, classify the item as exactly one of: appliance, furniture, furnishings, building_material, other.
    · appliance = white goods / electricals usually shared by the whole house (dishwasher, washing machine, TV, fridge, oven, microwave). These usually belong to the whole property.
    · furniture = beds, wardrobes, desks, sofas, tables — usually for a specific room.
    · furnishings = curtains, blinds, rugs, lamps, cushions — usually for a specific room.
    · building_material = flooring, paint, timber, tiles, plaster — could be a room or the whole property.
    · other = anything that doesn't fit.
  Leave "" for anything that is not a purchase_receipt.`

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY
}

// ── Floor-plan room-size extraction ─────────────────────────────────────────
const FLOORPLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    detected_rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },       // room label exactly as printed
          area_sqm: { type: 'number' },     // floor area in m² (0 if not derivable)
          dimensions: { type: 'string' },   // raw dimension text if shown, else ""
        },
        required: ['label', 'area_sqm', 'dimensions'],
      },
    },
    bathrooms_count: { type: 'number' },        // total bath/shower rooms (incl. ensuites), 0 if unclear
    ensuite_room_labels: { type: 'array', items: { type: 'string' } }, // labels of rooms with their own ensuite
    layout_notes: { type: 'string' },           // short marketing-style layout summary
    notes: { type: 'string' },
  },
  required: ['detected_rooms', 'bathrooms_count', 'ensuite_room_labels', 'layout_notes', 'notes'],
} as const

const FLOORPLAN_PROMPT = `You are given a property floor plan (image or PDF).

List each labelled room or living space with its floor area in square metres:
- If an area is printed (e.g. "14.2 m²" or "153 sq ft" → convert sq ft to m² by ×0.0929), use it.
- If only dimensions are shown (e.g. "3.2m x 4.1m" or "10'6\\" x 13'"), compute area = width × length (convert feet/inches to metres first) and also put the raw text in "dimensions".
- If neither an area nor dimensions can be read for a room, set area_sqm to 0 and dimensions to "".
- Prefer bedrooms and main living spaces; you may include kitchen/bathroom/living room. Skip tiny halls, landings and cupboards unless they are clearly labelled rooms.
- "label" must be exactly the text printed on the plan (e.g. "Bedroom 1", "Master", "Kitchen/Diner").
Round area_sqm to one decimal place. Put anything uncertain in "notes".

Also capture, for a property fact sheet:
- bathrooms_count: total number of bathrooms/shower rooms/WCs shown (include ensuites). 0 if you can't tell.
- ensuite_room_labels: labels of any bedrooms that have their own ensuite bathroom (a bathroom accessed only from that room). Empty array if none/unclear.
- layout_notes: one or two short, factual, marketing-style sentences about the layout (e.g. "Open-plan kitchen/diner with a separate utility; three double bedrooms, two with ensuites."). No hype.`

/** Scan a floor plan and return detected rooms with areas. Throws on API/config errors. */
export async function scanFloorplan(bytes: Buffer, mime: string) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  const b64 = bytes.toString('base64')
  const isPdf = mime === 'application/pdf'
  const media: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime) ? mime : 'image/jpeg') as any,
          data: b64,
        },
      }
  const client = new Anthropic()
  const res = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    output_config: { format: { type: 'json_schema', schema: FLOORPLAN_SCHEMA } } as any,
    messages: [{ role: 'user', content: [media, { type: 'text', text: FLOORPLAN_PROMPT }] }],
  })
  const textBlock = res.content.find((b: any) => b.type === 'text') as any
  if (!textBlock?.text) throw new Error('The AI returned no result')
  return JSON.parse(textBlock.text) as {
    detected_rooms: Array<{ label: string; area_sqm: number; dimensions: string }>
    bathrooms_count: number
    ensuite_room_labels: string[]
    layout_notes: string
    notes: string
  }
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

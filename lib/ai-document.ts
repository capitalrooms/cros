import Anthropic from '@anthropic-ai/sdk'

export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5'

// Unified document type classification
export type DocumentType =
  | 'statement'           // Landlord financial statement
  | 'hmo_licence'         // HMO licence
  | 'gas_safety_cert'     // Gas Safety Certificate
  | 'eicr_cert'           // Electrical Installation Condition Report
  | 'epc'                 // Energy Performance Certificate
  | 'fire_risk_assessment' // Fire Risk Assessment
  | 'appliance_cover'     // Insurance/cover for appliance (boiler, washing machine, etc.)
  | 'buildings_insurance' // Buildings/contents insurance
  | 'correspondence'      // General property correspondence (doesn't fit others)

// Extracted document payload — common fields + type-specific data
export interface ExtractedDocument {
  // Classification & confidence
  document_type: DocumentType
  confidence: number // 0–1; <0.5 = low confidence
  summary: string

  // Common fields (present in most docs)
  property_address: string
  document_date: string
  extracted_at: string

  // Type-specific extracted data (doc_type determines which fields are populated)
  // Certificates & assessments
  gas_safety_cert?: {
    cert_number: string
    test_date: string
    expiry_date: string
    engineer_name: string
  }
  eicr_cert?: {
    test_date: string
    expiry_date: string
    inspection_date: string
  }
  epc?: {
    rating: string // A, B, C, D, E, F, G
    expiry_date: string
  }
  fire_risk_assessment?: {
    assessment_date: string
    next_review_date: string
  }

  // Licences
  hmo_licence?: {
    licence_number: string
    issue_date: string
    expiry_date: string
    local_authority: string
  }

  // Insurance & covers
  insurance?: {
    provider: string
    policy_number: string
    cover_type: string // 'buildings', 'contents', 'landlord', etc.
    start_date: string
    expiry_date: string
    monthly_cost: number
    annual_cost: number
  }
  appliance_cover?: {
    provider: string
    policy_number: string
    appliance_type: string // 'boiler', 'washing_machine', 'fridge', etc.
    appliance_brand: string
    appliance_model: string
    start_date: string
    expiry_date: string
    renewal_date: string
    monthly_cost: number
    coverage_details: string
  }

  // Statements
  statement?: {
    statement_reference: string
    period_start: string
    period_end: string
    landlord_name: string
    management_fee_pct: number
    gross_rent: number
    management_fees: number
    property_charges: number
    net_to_landlord: number
    rooms: Array<{ room_number: number; tenant_name: string; rent_income: number; management_fee: number }>
    expenses: Array<{ description: string; amount: number }>
  }

  // General correspondence (fallback)
  correspondence?: {
    sender: string
    subject: string
    key_points: string[]
  }
}

// JSON Schema for Claude's structured output
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_type: { type: 'string', enum: ['statement', 'hmo_licence', 'gas_safety_cert', 'eicr_cert', 'epc', 'fire_risk_assessment', 'appliance_cover', 'buildings_insurance', 'correspondence'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    summary: { type: 'string' },
    property_address: { type: 'string' },
    document_date: { type: 'string' },
    extracted_at: { type: 'string' },
    gas_safety_cert: {
      type: 'object',
      properties: {
        cert_number: { type: 'string' },
        test_date: { type: 'string' },
        expiry_date: { type: 'string' },
        engineer_name: { type: 'string' },
      },
    },
    eicr_cert: {
      type: 'object',
      properties: {
        test_date: { type: 'string' },
        expiry_date: { type: 'string' },
        inspection_date: { type: 'string' },
      },
    },
    epc: {
      type: 'object',
      properties: {
        rating: { type: 'string' },
        expiry_date: { type: 'string' },
      },
    },
    fire_risk_assessment: {
      type: 'object',
      properties: {
        assessment_date: { type: 'string' },
        next_review_date: { type: 'string' },
      },
    },
    hmo_licence: {
      type: 'object',
      properties: {
        licence_number: { type: 'string' },
        issue_date: { type: 'string' },
        expiry_date: { type: 'string' },
        local_authority: { type: 'string' },
      },
    },
    insurance: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        policy_number: { type: 'string' },
        cover_type: { type: 'string' },
        start_date: { type: 'string' },
        expiry_date: { type: 'string' },
        monthly_cost: { type: 'number' },
        annual_cost: { type: 'number' },
      },
    },
    appliance_cover: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        policy_number: { type: 'string' },
        appliance_type: { type: 'string' },
        appliance_brand: { type: 'string' },
        appliance_model: { type: 'string' },
        start_date: { type: 'string' },
        expiry_date: { type: 'string' },
        renewal_date: { type: 'string' },
        monthly_cost: { type: 'number' },
        coverage_details: { type: 'string' },
      },
    },
    statement: {
      type: 'object',
      properties: {
        statement_reference: { type: 'string' },
        period_start: { type: 'string' },
        period_end: { type: 'string' },
        landlord_name: { type: 'string' },
        management_fee_pct: { type: 'number' },
        gross_rent: { type: 'number' },
        management_fees: { type: 'number' },
        property_charges: { type: 'number' },
        net_to_landlord: { type: 'number' },
        rooms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              room_number: { type: 'number' },
              tenant_name: { type: 'string' },
              rent_income: { type: 'number' },
              management_fee: { type: 'number' },
            },
          },
        },
        expenses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              amount: { type: 'number' },
            },
          },
        },
      },
    },
    correspondence: {
      type: 'object',
      properties: {
        sender: { type: 'string' },
        subject: { type: 'string' },
        key_points: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  },
  required: ['document_type', 'confidence', 'summary', 'property_address', 'document_date', 'extracted_at'],
}

/**
 * Extract document content using Claude's vision + structured output.
 * Classifies the doc type automatically and pulls all relevant fields.
 * Returns data even if property can't be matched — admin approves after review.
 */
export async function extractDocument(bytes: Buffer, mimeType: string): Promise<ExtractedDocument> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const client = new Anthropic()
  const base64 = bytes.toString('base64')

  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `You are a document classification and data extraction expert. Analyze this document and extract the following:

1. **Classify the document type** from: statement, hmo_licence, gas_safety_cert, eicr_cert, epc, fire_risk_assessment, appliance_cover, buildings_insurance, correspondence.

2. **Extract the property address** — this is critical for matching to a property later.

3. **Extract all relevant fields** for the document type:
   - Certificates: dates, numbers, engineer/inspector names
   - Licences: licence number, authority, expiry
   - Insurance/covers: provider, policy number, premium (monthly or annual), appliance details (brand, model, type), coverage end date, renewal date
   - Statements: reference, period, landlord, rooms with rent & tenant names, expenses, fee %
   - Correspondence: sender, subject, key points

4. **Date formats**: Return all dates as ISO YYYY-MM-DD. If only month/year given, use the 1st of that month.

5. **Money fields**: Return as numbers (GBP), no currency symbols. If you can't find a field, return empty string or 0.

6. **Confidence**: Return 0–1. 0.5+ means you're reasonably sure; <0.5 means uncertain (e.g., correspondence with no clear category).

7. **Never guess**: If a field is not in the document, leave it empty/blank.

Return the extracted data in the exact JSON structure provided.`,
          },
        ],
      },
    ],
  })

  // Parse the response
  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  try {
    const extracted = JSON.parse(content.text) as ExtractedDocument
    extracted.extracted_at = new Date().toISOString().split('T')[0]
    return extracted
  } catch (e) {
    throw new Error(`Failed to parse Claude response: ${content.text}`)
  }
}

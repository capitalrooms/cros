import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// POST /api/reference-import/extract
// Body: multipart/form-data with one or more files (PDF or image)
// Returns: structured JSON of extracted reference data

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  // Build content blocks for Claude: one block per file
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = []

  for (const file of files) {
    const bytes = await file.arrayBuffer()
    const b64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type as 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    if (file.type === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: b64,
        },
        title: file.name,
      } as any)
    } else if (file.type.startsWith('image/')) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: b64,
        },
      } as any)
    }
  }

  contentBlocks.push({
    type: 'text',
    text: `You are extracting structured tenant reference data from one or more documents.
These may include: reference reports (e.g. Homeppl), credit reports, right to rent certificates,
passports, driving licences, tenancy agreements, or other identity/financial documents.

Extract ALL available fields from across all documents and return a single JSON object.
Use null for any field that cannot be found. Do not guess — only report what is explicitly stated.

Return ONLY a JSON object with these fields (no markdown, no explanation):

{
  "legal_name": "Full legal name as it appears on official ID",
  "preferred_name": "Name used in application if different",
  "date_of_birth": "YYYY-MM-DD or null",
  "nationality": "Country name or null",
  "current_address": "Full current address or null",

  "overall_decision": "Approved | Declined | Referred | null",
  "reference_source": "Company/platform name e.g. Homeppl or null",
  "report_date": "YYYY-MM-DD or null",

  "id_type_1": "Document type e.g. Passport, Driving Licence, Share Code",
  "id_ref_1": "Reference/ID number for document 1 or null",
  "id_verified_1": true or false,
  "id_type_2": "Document type or null",
  "id_ref_2": "Reference/ID number for document 2 or null",
  "id_verified_2": true or false,

  "right_to_rent_status": "Yes (time-limited) | Yes (indefinite) | No | null",
  "right_to_rent_from": "YYYY-MM-DD or null",
  "right_to_rent_until": "YYYY-MM-DD or null",
  "right_to_rent_check_date": "YYYY-MM-DD or null",
  "right_to_rent_ref": "Reference code e.g. RL-XXXXX or null",
  "right_to_rent_checker": "Company/person who ran the check or null",

  "verified_income_annual": numeric or null,
  "verified_income_monthly": numeric or null,
  "max_affordable_rent_monthly": numeric or null,
  "affordability_ratio": numeric percentage e.g. 40 or null,

  "credit_result": "Clean | Issues Found | null",
  "credit_notes": "Brief summary of any credit issues or null",
  "active_judgments": integer or null,
  "satisfied_judgments": integer or null,
  "active_bais": true or false or null,

  "prev_landlord_ref_result": "Pass | Fail | N/A | null",
  "prev_landlord_ref_name": "Name of landlord/agent or null",
  "prev_landlord_ref_notes": "Summary of reference notes or null",

  "aml_result": "Clear | Issues | null",
  "aml_notes": "Any AML notes or null",

  "previous_addresses": [
    { "address": "full address", "from": "YYYY-MM or null", "to": "YYYY-MM or null", "confirmed": true }
  ],

  "driving_licence_number": "Licence number if present or null",
  "driving_licence_expiry": "YYYY-MM-DD or null",
  "passport_number": "Passport number if present or null",
  "passport_expiry": "YYYY-MM-DD or null",

  "notes": "Any other significant information worth noting or null"
}`,
  })

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: contentBlocks }],
  })

  const rawText = response.content.find(b => b.type === 'text')?.text ?? '{}'

  // Strip any accidental markdown code fences
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let extracted: Record<string, any> = {}
  try {
    extracted = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'AI extraction failed to return valid JSON', raw: rawText }, { status: 500 })
  }

  return NextResponse.json({ extracted })
}

/**
 * POST /api/landlord-onboarding/scan/[token]
 *
 * AI-powered document scanner. Downloads a previously-uploaded document from
 * Supabase Storage and sends it to Claude to extract structured fields.
 *
 * Body: { path: string, docType: string }
 * Returns: { fields: Record<string, string> }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import Anthropic                     from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Prompt per document type — what fields to extract and how
const PROMPTS: Record<string, string> = {
  id_document: `
You are extracting identity information from a government-issued ID document (passport, driving licence, or national ID card).
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "title": "Mr/Mrs/Ms/Dr/Prof etc",
  "first_name": "given name(s)",
  "last_name": "surname/family name",
  "date_of_birth": "DD/MM/YYYY",
  "nationality": "as shown on document",
  "document_type": "Passport / Driving Licence / National ID",
  "document_number": "document reference number",
  "expiry_date": "DD/MM/YYYY"
}
Return ONLY valid JSON, nothing else.`,

  proof_of_address: `
You are extracting address information from a proof of address document (bank statement, utility bill, council tax bill, or similar official letter).
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "address_line_1": "house number and street",
  "address_line_2": "flat/apartment if applicable",
  "town_city": "town or city",
  "county": "county if shown",
  "postcode": "UK postcode",
  "document_date": "DD/MM/YYYY — the date of the document",
  "issuer": "name of the bank, utility, or organisation that issued it"
}
Return ONLY valid JSON, nothing else.`,

  proof_of_ownership: `
You are extracting property ownership information from a Land Registry title document, mortgage statement, or similar ownership proof.
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "property_address": "full address of the property",
  "title_number": "Land Registry title number if shown",
  "owner_name": "name of registered owner(s)",
  "document_date": "DD/MM/YYYY"
}
Return ONLY valid JSON, nothing else.`,

  gas_safety_certificate: `
You are extracting key dates from a Gas Safety Certificate (CP12).
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY",
  "expiry_date": "DD/MM/YYYY — gas safety certs expire after 12 months"
}
Return ONLY valid JSON, nothing else.`,

  eicr: `
You are extracting key dates from an Electrical Installation Condition Report (EICR).
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY",
  "expiry_date": "DD/MM/YYYY — next inspection due date"
}
Return ONLY valid JSON, nothing else.`,

  epc: `
You are extracting key data from an Energy Performance Certificate (EPC).
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY",
  "expiry_date": "DD/MM/YYYY — EPCs are valid for 10 years",
  "current_rating": "e.g. D"
}
Return ONLY valid JSON, nothing else.`,

  fire_risk_assessment: `
You are extracting key dates from a Fire Risk Assessment report.
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY — date of the assessment",
  "expiry_date": "DD/MM/YYYY — next review date if stated"
}
Return ONLY valid JSON, nothing else.`,

  fire_detection_certificate: `
You are extracting key dates from a Fire Detection and Alarm System Certificate.
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY",
  "expiry_date": "DD/MM/YYYY — next inspection due if stated"
}
Return ONLY valid JSON, nothing else.`,

  emergency_lighting_certificate: `
You are extracting key dates from an Emergency Lighting Certificate.
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY",
  "expiry_date": "DD/MM/YYYY — next inspection due if stated"
}
Return ONLY valid JSON, nothing else.`,

  pat_test_record: `
You are extracting key dates from a Portable Appliance Testing (PAT) record.
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY — date of the PAT test",
  "expiry_date": "DD/MM/YYYY — next test due date if stated"
}
Return ONLY valid JSON, nothing else.`,

  legionella_risk_assessment: `
You are extracting key dates from a Legionella Risk Assessment.
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY — date of the assessment",
  "expiry_date": "DD/MM/YYYY — next review date if stated"
}
Return ONLY valid JSON, nothing else.`,

  hmo_licence: `
You are extracting key data from an HMO Licence.
Return a JSON object with these fields (omit any you cannot confidently read):
{
  "issue_date": "DD/MM/YYYY",
  "expiry_date": "DD/MM/YYYY — expiry / renewal date",
  "licence_number": "licence reference number"
}
Return ONLY valid JSON, nothing else.`,
}

// Fallback generic prompt for unknown/other doc types
const GENERIC_PROMPT = `
You are extracting information from a document uploaded as part of a landlord registration.
Return a JSON object with any useful fields you can read from the document, such as:
dates, reference numbers, addresses, names, or key values.
Return ONLY valid JSON, nothing else.`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Verify the token is valid
  const { data: row, error: rowErr } = await svc()
    .from('landlord_onboarding')
    .select('id')
    .eq('token', token)
    .single()

  if (rowErr || !row) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const { path, docType } = await req.json()
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 })

  // Download the file from Supabase Storage
  const { data: fileData, error: dlErr } = await svc()
    .storage
    .from('landlord-docs')
    .download(path)

  if (dlErr || !fileData) {
    return NextResponse.json({ error: `Could not download file: ${dlErr?.message ?? 'unknown'}` }, { status: 500 })
  }

  // Convert to base64
  const arrayBuffer = await fileData.arrayBuffer()
  const base64      = Buffer.from(arrayBuffer).toString('base64')
  const mimeType    = fileData.type || guessMime(path)

  // Only images and PDFs can be sent to Claude vision
  const isImage = mimeType.startsWith('image/')
  const isPdf   = mimeType === 'application/pdf'

  if (!isImage && !isPdf) {
    return NextResponse.json({ error: 'File type cannot be scanned (must be image or PDF)' }, { status: 400 })
  }

  const prompt = PROMPTS[docType] ?? GENERIC_PROMPT

  try {
    let content: Anthropic.MessageParam['content']

    if (isPdf) {
      // Claude supports PDF as a document block
      content = [
        {
          type: 'document',
          source: {
            type:       'base64',
            media_type: 'application/pdf',
            data:       base64,
          },
        } as any,
        { type: 'text', text: prompt },
      ]
    } else {
      // Image block
      content = [
        {
          type: 'image',
          source: {
            type:       'base64',
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data:       base64,
          },
        },
        { type: 'text', text: prompt },
      ]
    }

    const msg = await anthropic.messages.create({
      model:      'claude-opus-5',
      max_tokens: 1024,
      messages:   [{ role: 'user', content }],
    })

    const raw = (msg.content[0] as any)?.text ?? '{}'

    // Extract JSON — Claude sometimes wraps in ```json fences
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ??
                      raw.match(/```\s*([\s\S]*?)```/)
    const jsonStr   = jsonMatch ? jsonMatch[1].trim() : raw.trim()

    let fields: Record<string, string> = {}
    try {
      fields = JSON.parse(jsonStr)
    } catch {
      // Couldn't parse — return empty rather than error
    }

    return NextResponse.json({ fields })
  } catch (e) {
    return NextResponse.json(
      { error: `AI scan failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}

function guessMime(path: string): string {
  if (path.endsWith('.pdf'))  return 'application/pdf'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.png'))  return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

/**
 * Unified document scan engine.
 *
 * Cert-only path (compliance uploads):
 *   1. pdf-parse text → Haiku json_schema (fast, cheap, works for machine-generated PDFs)
 *   2. Haiku vision   → full PDF if ≤32 MB, else first-page JPEG  (scanned PDFs)
 *
 * Full classify path (inbox / AI Doc Scanner):
 *   1. pdf-parse text → Haiku tool_use (reliable structured output, no schema-size limit)
 *   2. Haiku vision   → tool_use
 *   3. Sonnet vision  → escalate only when Haiku confidence < 0.5
 *
 * PDFs are NEVER byte-truncated. A sliced PDF is an invalid PDF.
 * Anthropic accepts PDFs up to 32 MB. Files larger than that get first-page image fallback.
 */

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL, AI_MODEL_SMART, type DOC_TYPES } from './ai-classify'

const client = new Anthropic()

const ANTHROPIC_PDF_MAX = 32 * 1024 * 1024  // 32 MB
const ANTHROPIC_IMG_MAX = 5 * 1024 * 1024   // ~5 MB for base64 images

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocType = (typeof DOC_TYPES)[number]

export interface ScanResult {
  doc_type: DocType
  confidence: number
  summary: string
  issue_date: string
  expiry_date: string
  certified_date: string
  provider: string
  policy_number: string
  property_address: string
  person_name: string
  person_phone: string
  person_email: string
  occupation: string
  annual_income: string
  previous_address: string
  tenancy_start: string
  tenancy_end: string
  monthly_rent: string
  rent_due_day: number
  purchase_category: string
  item_name: string
  item_make_model: string
  amount: string
  work_description: string
  epc_rating: string
  license_number: string
}

export interface ScanOptions {
  knownDocType?: DocType
  fileHash?: string
  requiredFields?: (keyof ScanResult)[]
}

function emptyResult(): ScanResult {
  return {
    doc_type: 'other', confidence: 0, summary: '', issue_date: '', expiry_date: '',
    certified_date: '', provider: '', policy_number: '', property_address: '',
    person_name: '', person_phone: '', person_email: '', occupation: '',
    annual_income: '', previous_address: '', tenancy_start: '', tenancy_end: '',
    monthly_rent: '', rent_due_day: 0, purchase_category: '', item_name: '',
    item_make_model: '', amount: '', work_description: '', epc_rating: '', license_number: '',
  }
}

// ── PDF text extraction ────────────────────────────────────────────────────────

async function extractPdfText(bytes: Buffer): Promise<string> {
  try {
    // unpdf = pdf.js built for serverless (pdf-parse was never installed, so this tier always came back empty)
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    return String(text || '').trim()
  } catch {
    return ''
  }
}

// ── Media block builder ────────────────────────────────────────────────────────

async function buildMediaBlock(bytes: Buffer, mime: string): Promise<any | null> {
  const isPdf = mime === 'application/pdf'

  if (isPdf) {
    if (bytes.length <= ANTHROPIC_PDF_MAX) {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } }
    }
    // PDF too large — render first page to JPEG
    const img = await renderFirstPage(bytes)
    if (img && img.length <= ANTHROPIC_IMG_MAX) {
      return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.toString('base64') } }
    }
    return null
  }

  if (bytes.length <= ANTHROPIC_IMG_MAX) {
    return { type: 'image', source: { type: 'base64', media_type: mime as any, data: bytes.toString('base64') } }
  }
  return null
}

async function renderFirstPage(bytes: Buffer): Promise<Buffer | null> {
  try {
    const { execSync } = require('child_process') // eslint-disable-line @typescript-eslint/no-var-requires
    const fs = require('fs') // eslint-disable-line @typescript-eslint/no-var-requires
    const os = require('os') // eslint-disable-line @typescript-eslint/no-var-requires
    const path = require('path') // eslint-disable-line @typescript-eslint/no-var-requires
    const tmp = path.join(os.tmpdir(), `scan-${Date.now()}`)
    fs.writeFileSync(`${tmp}.pdf`, bytes)
    execSync(`pdftocairo -jpeg -r 150 -f 1 -l 1 "${tmp}.pdf" "${tmp}"`, { timeout: 15000 })
    const img = fs.readFileSync(`${tmp}-1.jpg`)
    try { fs.unlinkSync(`${tmp}.pdf`); fs.unlinkSync(`${tmp}-1.jpg`) } catch {}
    return img
  } catch {
    return null
  }
}

// ── Cert-only path: output_config + json_schema (6 fields — proven to work fast) ──

const CERT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    issue_date:       { type: 'string' },
    expiry_date:      { type: 'string' },
    certified_date:   { type: 'string' },
    property_address: { type: 'string' },
    epc_rating:       { type: 'string' },
    license_number:   { type: 'string' },
  },
  required: ['issue_date', 'expiry_date', 'certified_date', 'property_address', 'epc_rating', 'license_number'],
} as const

const CERT_PROMPT = `Extract key dates and identifiers from this UK property compliance certificate. Use ISO dates (yyyy-mm-dd). Leave fields as "" if not present. epc_rating is A–G. license_number is an HMO licence reference.
issue_date = the date the inspection/test was carried out (or the certificate issued).
expiry_date = when the next one is due: the "next inspection" / "retest" / "valid until" / "expiry" date shown on the certificate. If the certificate only states an interval (e.g. an EICR recommending re-inspection "within 5 years", or "5 years"), add that interval to the inspection date. Look through every page — on an EICR this is usually in the summary or "next inspection" section.`

// The usual interval for each certificate — used when the certificate itself doesn't give a next-due date
const CERT_INTERVAL_MONTHS: Record<string, number> = {
  gas_safety_certificate: 12, electrical_eicr: 60, eicr: 60, electrical_certificate: 60,
  fire_alarm_certificate: 12, fire_detection_certificate: 12, emergency_lighting_certificate: 12,
  pat_test: 12, epc: 120, hmo_licence: 60, fire_risk_assessment: 12,
}
function addMonths(iso: string, months: number): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

async function certFromText(text: string): Promise<Partial<ScanResult>> {
  const res = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 512,
    output_config: { format: { type: 'json_schema', schema: CERT_SCHEMA } } as any,
    messages: [{ role: 'user', content: `${CERT_PROMPT}\n\n${text.slice(0, 8000)}` }],
  })
  const block = res.content.find((b: any) => b.type === 'text') as any
  try { return block?.text ? JSON.parse(block.text) : {} } catch { return {} }
}

async function certFromVision(bytes: Buffer, mime: string): Promise<Partial<ScanResult>> {
  const media = await buildMediaBlock(bytes, mime)
  if (!media) return {}
  const res = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 512,
    output_config: { format: { type: 'json_schema', schema: CERT_SCHEMA } } as any,
    messages: [{ role: 'user', content: [media, { type: 'text', text: CERT_PROMPT }] }],
  })
  const block = res.content.find((b: any) => b.type === 'text') as any
  try { return block?.text ? JSON.parse(block.text) : {} } catch { return {} }
}

// ── Full classify path: tool_use (reliable with large schemas, all models) ────

const CLASSIFY_PROMPT = `You are a UK lettings administrator's assistant. Classify this document and extract all available fields. Use ISO dates (yyyy-mm-dd). Leave missing fields as "". confidence is 0-1. doc_type must be one of: gas_safety_certificate, electrical_eicr, emergency_lighting_certificate, fire_alarm_certificate, pat_test, hmo_licence, epc, insurance, tenancy_agreement, deposit_certificate, tenant_reference, right_to_rent, evacuation_plan, emergency_contacts, house_rules, policy_document, council_correspondence, utility_bill, landlord_statement_tenant, safety_info, inventory, wifi_details, waste_schedule, supplier_invoice, purchase_receipt, other.`

const CLASSIFY_TOOL = {
  name: 'extract_document',
  description: 'Extract structured data from a UK property management document',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      doc_type:          { type: 'string', description: 'Document type from the allowed list' },
      confidence:        { type: 'number', description: '0-1 confidence in doc_type classification' },
      summary:           { type: 'string' },
      issue_date:        { type: 'string', description: 'ISO date yyyy-mm-dd' },
      expiry_date:       { type: 'string', description: 'ISO date yyyy-mm-dd' },
      certified_date:    { type: 'string', description: 'ISO date yyyy-mm-dd' },
      provider:          { type: 'string' },
      policy_number:     { type: 'string' },
      property_address:  { type: 'string' },
      epc_rating:        { type: 'string', description: 'Letter A-G' },
      license_number:    { type: 'string' },
      person_name:       { type: 'string' },
      person_phone:      { type: 'string' },
      person_email:      { type: 'string' },
      occupation:        { type: 'string' },
      annual_income:     { type: 'string' },
      previous_address:  { type: 'string' },
      tenancy_start:     { type: 'string', description: 'ISO date yyyy-mm-dd' },
      tenancy_end:       { type: 'string', description: 'ISO date yyyy-mm-dd' },
      monthly_rent:      { type: 'string' },
      rent_due_day:      { type: 'number' },
      purchase_category: { type: 'string' },
      item_name:         { type: 'string' },
      item_make_model:   { type: 'string' },
      amount:            { type: 'string' },
      work_description:  { type: 'string' },
    },
    required: ['doc_type', 'confidence'],
  },
} as const

async function classifyViaToolUse(userContent: any, model: string, maxTokens: number): Promise<ScanResult | null> {
  try {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      tools: [CLASSIFY_TOOL as any],
      tool_choice: { type: 'tool', name: 'extract_document' },
      messages: [{ role: 'user', content: userContent }],
    })
    const block = res.content.find((b: any) => b.type === 'tool_use') as any
    return block?.input ? { ...emptyResult(), ...block.input } : null
  } catch (err: any) {
    console.error('scan-engine classify error:', err?.message)
    return null
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function scanDocument(
  bytes: Buffer,
  mime: string,
  options: ScanOptions & { existingResult?: ScanResult | null } = {},
): Promise<ScanResult> {
  if (options.existingResult) return options.existingResult

  const isPdf = mime === 'application/pdf'
  const isCertOnly = !!options.knownDocType

  // ── CERT-ONLY PATH ─────────────────────────────────────────────────────────
  if (isCertOnly) {
    let certResult: Partial<ScanResult> = {}

    // Tier 1: text extraction (free for machine-generated PDFs)
    if (isPdf) {
      const text = await extractPdfText(bytes)
      if (text.length > 80) {
        certResult = await certFromText(text)
      }
    }

    // Tier 2: vision (scanned PDFs / images)
    if (!certResult.expiry_date && !certResult.issue_date) {
      try {
        certResult = await certFromVision(bytes, mime)
      } catch (err: any) {
        console.error('scan-engine cert vision error:', err?.message)
      }
    }

    // Text found a date but no expiry (e.g. a scanned EICR with a readable header only) — look at the pages too
    if (!certResult.expiry_date && isPdf && certResult.issue_date) {
      try { const v = await certFromVision(bytes, mime); if (v.expiry_date) certResult = { ...certResult, ...v, issue_date: v.issue_date || certResult.issue_date } } catch { /* keep what we have */ }
    }
    // Still no expiry: the test date plus the usual interval for this certificate (the admin can edit it)
    const months = CERT_INTERVAL_MONTHS[String(options.knownDocType)]
    if (!certResult.expiry_date && certResult.issue_date && months) {
      certResult = { ...certResult, expiry_date: addMonths(certResult.issue_date, months), summary: `Next due worked out as ${months >= 12 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`} after the test date — check it against the certificate.` }
    }

    return { ...emptyResult(), doc_type: options.knownDocType!, confidence: 1, summary: '', ...certResult }
  }

  // ── FULL CLASSIFY PATH (tool_use — reliable with large schemas) ────────────

  // Tier 1: text extraction
  if (isPdf) {
    const text = await extractPdfText(bytes)
    if (text.length > 200) {
      const result = await classifyViaToolUse(
        `${CLASSIFY_PROMPT}\n\nDOCUMENT TEXT:\n${text.slice(0, 12000)}`,
        AI_MODEL, 600,
      )
      if (result && result.confidence >= 0.4) return result
    }
  }

  // Tier 2: Haiku vision
  const media = await buildMediaBlock(bytes, mime)
  if (!media) return emptyResult()

  const haikuResult = await classifyViaToolUse(
    [media, { type: 'text', text: CLASSIFY_PROMPT }],
    AI_MODEL, 600,
  )
  if (!haikuResult) return emptyResult()
  if (haikuResult.confidence >= 0.5) return haikuResult

  // Tier 3: Sonnet — only when Haiku is genuinely unsure
  console.log(`scan-engine: escalating to Sonnet (Haiku confidence ${haikuResult.confidence})`)
  const sonnetResult = await classifyViaToolUse(
    [media, { type: 'text', text: CLASSIFY_PROMPT }],
    AI_MODEL_SMART, 1024,
  )
  return sonnetResult ?? haikuResult
}

export function fileHash(bytes: Buffer): string {
  const { createHash } = require('crypto') // eslint-disable-line @typescript-eslint/no-var-requires
  return createHash('sha256').update(bytes).digest('hex')
}

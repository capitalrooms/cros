// POST /api/landlord-onboarding/property-doc/[token]  { path, property }
// Reads a property document the landlord has just uploaded, works out what it is and pulls out the key facts,
// then records it against that property in form_data.property_docs (on the server, so it's kept even if the
// landlord closes the page straight away). Never fails the upload: if the document can't be read, it's kept
// as unread and the landlord picks the type.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL } from '@/lib/ai-classify'
import { svc, loadRow, updateFormData, DOCS_BUCKET } from '@/lib/landlordOnboarding/store'
import { FACT_LABELS, PROPERTY_DOC_TYPES, isPropertyDocType, mergePropertyDocs, type PropertyDoc } from '@/lib/landlordOnboarding/propertyDocs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PROMPT = `This document was uploaded by a landlord about one of their rental properties. Work out what it is and read the key facts.

Reply with ONLY a JSON object:
{
  "type": one of ${JSON.stringify(PROPERTY_DOC_TYPES.map(t => t.key))},
  "label": a short name for it, e.g. "Gas Safety Certificate" or "Thames Water bill — March 2026",
  "expiry_date": "YYYY-MM-DD" if the document has an expiry, renewal or next-inspection date, else omit,
  "issue_date": "YYYY-MM-DD" if shown, else omit,
  "facts": { only the keys below that the document actually shows, as short strings }
}
Allowed fact keys: ${Object.keys(FACT_LABELS).filter(k => !['expiry_date', 'issue_date'].includes(k)).join(', ')}.
Use "supplier" for the utility, insurer or company that issued it; "account_number" for a customer or account reference.
Never include bank account numbers, sort codes or card numbers. Use "other" if it is none of the listed types.`

const anthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : undefined)

async function readDocument(path: string): Promise<Pick<PropertyDoc, 'type' | 'label' | 'info' | 'expiry'>> {
  const { data: file, error } = await svc().storage.from(DOCS_BUCKET).download(path)
  if (error || !file) throw new Error('could not download')
  const data = Buffer.from(await file.arrayBuffer()).toString('base64')
  const pdf = path.endsWith('.pdf')
  const mediaType = pdf ? 'application/pdf' : path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  const msg = await anthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        pdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
          : { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data } },
        { type: 'text', text: PROMPT },
      ],
    }],
  })
  const text = msg.content.map(c => (c.type === 'text' ? c.text : '')).join('')
  const json = JSON.parse((text.match(/\{[\s\S]*\}/) ?? ['{}'])[0]) as { type?: string; label?: string; expiry_date?: string; issue_date?: string; facts?: Record<string, unknown> }
  const type = json.type && isPropertyDocType(json.type) ? json.type : 'other'
  const info: Record<string, string> = {}
  for (const [k, v] of Object.entries(json.facts ?? {})) {
    if (k in FACT_LABELS && v != null && String(v).trim()) info[k] = String(v).trim().slice(0, 200)
  }
  const expiry = isoDate(json.expiry_date)
  const issued = isoDate(json.issue_date)
  if (expiry) info.expiry_date = expiry
  if (issued) info.issue_date = issued
  return { type, label: String(json.label ?? '').trim().slice(0, 120), info, expiry }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json().catch(() => ({}))
  const path = String(body.path ?? '')
  const property = Math.max(0, Math.min(50, Number(body.property) || 0))

  const row = await loadRow(token)
  if (!row) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (row.stage >= 3) return NextResponse.json({ error: 'This form has already been submitted' }, { status: 409 })
  if (!path.startsWith(`${token}/property_document_`)) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })

  let read: Pick<PropertyDoc, 'type' | 'label' | 'info' | 'expiry'>
  try { read = await readDocument(path) }
  catch (e) {
    console.error('[property-doc] read failed', e)
    read = { type: '', label: '', info: {} }
  }

  const doc: PropertyDoc = { path, property, ...read, scanned: true, uploaded_at: new Date().toISOString() }
  const result = await updateFormData(token, current => ({
    form_data: { ...current, property_docs: mergePropertyDocs(current.property_docs, [doc]) },
  }))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, doc })
}

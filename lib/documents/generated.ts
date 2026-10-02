// Every letter or invoice made on Letters & Invoices is saved: the PDF in the private finance-docs bucket and a
// row in generated_documents (migration 197). "Delete" hides it from the list but keeps both (finance records
// are never destroyed). Server-only.
import { createServiceClient } from '@/lib/supabase'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { generateLandlordInvoice } from '@/lib/invoices/landlordInvoice'
import { invoiceFromBody, type DocInvoice } from '@/lib/invoices/fromDocumentGenerator'
import { renderFormalLetter, letterFileName } from '@/lib/letters/formalLetter'
import { letterFromBody, signerForRequest } from '@/lib/letters/letterFromRequest'

export const DOCS_BUCKET = 'finance-docs'
const TABLE = 'generated_documents'

export interface GeneratedDocument {
  id: string
  kind: 'invoice' | 'letter'
  number: string | null
  title: string
  recipient_name: string
  recipient_email: string | null
  property_id: string | null
  total: number | null
  storage_path: string
  created_by: string | null
  created_at: string
  updated_at: string
  emailed_at: string | null
  emailed_to: string[] | null
}

export interface DocFields {
  kind: 'invoice' | 'letter'
  number: string | null
  title: string
  recipient_name: string
  property_id: string | null
  total: number | null
  content: unknown
}

export const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /generated_documents/.test(e.message ?? '') && /does not exist|schema cache/.test(e.message ?? ''))

export const fileNameFor = (d: Pick<GeneratedDocument, 'kind' | 'number' | 'title' | 'recipient_name'>) =>
  d.kind === 'invoice' ? `Invoice ${d.number}.pdf` : letterFileName({ subject: d.title, recipientName: d.recipient_name })

/** Renders the PDF for a letter or invoice from the page; returns it with the details to store, or an error. */
export async function renderDocument(kind: string, body: { invoice?: unknown; letter?: unknown; signer?: unknown }, callerEmail: string): Promise<{ pdf: Buffer; fields: DocFields } | { error: string }> {
  if (kind === 'invoice') {
    const { input, error } = invoiceFromBody(body.invoice, await fetchPDFBizSettings())
    if (!input) return { error: error ?? 'The invoice is incomplete' }
    const inv = body.invoice as DocInvoice
    return {
      pdf: await generateLandlordInvoice(input),
      fields: {
        kind: 'invoice', number: input.invoiceNumber, title: input.title ?? '', recipient_name: input.landlordName,
        property_id: inv.propertyId || null, total: input.items.reduce((t, i) => t + i.qty * i.unitPrice, 0), content: inv,
      },
    }
  }
  if (kind === 'letter') {
    const { letter, error } = letterFromBody(body.letter)
    if (!letter) return { error: error ?? 'The letter is incomplete' }
    return {
      pdf: await renderFormalLetter(letter, await signerForRequest(callerEmail, body.signer)),
      fields: {
        kind: 'letter', number: null, title: letter.subject, recipient_name: letter.recipientName,
        property_id: null, total: null, content: { letter, signer: body.signer ?? null },
      },
    }
  }
  return { error: 'Unknown document type' }
}

/** Saves (or re-saves, when id is given) a rendered document. Invoice numbers must be unused by any other live document. */
export async function saveDocument(opts: {
  id?: string | null
  pdf: Buffer
  fields: DocFields
  recipientEmail?: string | null
  callerEmail: string
}): Promise<{ doc?: GeneratedDocument; error?: string; status?: number }> {
  const s = createServiceClient()
  const id = opts.id && /^[0-9a-f-]{36}$/i.test(opts.id) ? opts.id : crypto.randomUUID()

  if (opts.fields.kind === 'invoice' && opts.fields.number) {
    const { data: clash, error } = await s.from(TABLE).select('id').eq('kind', 'invoice').eq('number', opts.fields.number).is('deleted_at', null).neq('id', id).limit(1)
    if (error) return { error: isMissingTable(error) ? 'Run migration 197 in Supabase to start saving documents' : error.message, status: 503 }
    if (clash?.length) return { error: `Invoice number ${opts.fields.number} is already used — change the number`, status: 409 }
  }

  const path = `generated/${id}.pdf`
  const { error: upErr } = await s.storage.from(DOCS_BUCKET).upload(path, opts.pdf, { contentType: 'application/pdf', upsert: true })
  if (upErr) return { error: `Could not save the PDF: ${upErr.message}`, status: 500 }

  const now = new Date().toISOString()
  const row = { id, ...opts.fields, recipient_email: opts.recipientEmail || null, storage_path: path, updated_at: now }
  const { data: existing } = await s.from(TABLE).select('id').eq('id', id).maybeSingle()
  const q = existing
    ? s.from(TABLE).update(row).eq('id', id)
    : s.from(TABLE).insert({ ...row, created_by: opts.callerEmail, created_at: now })
  const { data, error } = await q.select('*').single()
  if (error) {
    if (isMissingTable(error)) return { error: 'Run migration 197 in Supabase to start saving documents', status: 503 }
    if (error.code === '23505') return { error: `Invoice number ${opts.fields.number} is already used — change the number`, status: 409 }
    return { error: error.message, status: 500 }
  }
  return { doc: data as GeneratedDocument }
}

/** First free invoice number for the day: YYYYMMDD + property code, e.g. 20261002013REC; a second one that day
 *  for the same property is 20261002013REC01, then …02. */
export async function nextInvoiceNumber(base: string): Promise<string> {
  const s = createServiceClient()
  const { data } = await s.from(TABLE).select('number').eq('kind', 'invoice').is('deleted_at', null).like('number', `${base}%`)
  return firstFree(base, new Set((data ?? []).map(r => r.number as string)))
}

export function firstFree(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  for (let i = 1; ; i++) { const n = `${base}${String(i).padStart(2, '0')}`; if (!used.has(n)) return n }
}

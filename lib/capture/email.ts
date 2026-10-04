// Invoices by email (migration 208): Harry's mailbox forwards everything to invoices@crisiionta.resend.app (Resend's
// receiving domain — capitalrooms.co.uk's own mail is with Google, so Resend can't receive on it).
// Each email is checked cheaply first; only what looks like a cost is read by the AI, and only real costs are kept —
// everything else is dropped without being stored. A kept invoice waits in Capture with the AI's reading and a
// suggestion (which property, or the company's own cost), learned from how earlier ones were filed. Nothing becomes
// an expense until someone files it there (lib/expenses/create does the checks).
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readInvoice, type InvoiceRead } from '@/lib/capture/ai'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

const PDFDocument = require('pdfkit') as typeof import('pdfkit')
const BUCKET = 'capture'
const FILES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
// worth a look: money words in the subject or body, or a PDF attached
const MONEY = /\b(invoice|receipt|bill|payment|paid|order|subscription|renewal|charge|amount due|total|£\s?\d)/i
const NOT_COSTS = /\b(unsubscribe from|newsletter|webinar|your quote|quotation|delivered|out for delivery|password|verify your|sign in)\b/i

export const INVOICE_ADDRESS = 'invoices@crisiionta.resend.app'

const plain = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&pound;/g, '£').replace(/&#163;/g, '£').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()

/** The email itself as a one-page PDF, for invoices sent as the email body (order confirmations, receipts). */
async function emailPdf(from: string, subject: string, when: string, text: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>(r => doc.on('end', () => r(Buffer.concat(chunks))))
  doc.fontSize(9).fillColor('#666').text(`From: ${from}\nSubject: ${subject}\nReceived: ${when}`).moveDown()
  doc.fontSize(10).fillColor('#000').text(text.slice(0, 20000))
  doc.end()
  return done
}

async function fetchAttachment(emailId: string, att: any): Promise<Buffer | null> {
  if (att.content) return Buffer.from(att.content, 'base64')
  if (!att.id || !emailId) return null
  try {
    const meta = await fetch(`https://api.resend.com/emails/inbound/${emailId}/attachments/${att.id}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } })
    if (!meta.ok) return null
    const { download_url } = await meta.json()
    const f = download_url ? await fetch(download_url) : null
    return f?.ok ? Buffer.from(await f.arrayBuffer()) : null
  } catch { return null }
}

/** How earlier invoices from this sender (or supplier) were filed — the strongest hint there is. */
async function history(s: SupabaseClient, from: string, supplier: string) {
  const { data } = await s.from('capture_items').select('filed_to, property_id, bill, email_from').eq('status', 'filed').eq('source', 'email').order('filed_at', { ascending: false }).limit(300)
  const same = ((data ?? []) as any[]).filter(r => r.email_from === from || (supplier && String(r.bill?.supplier ?? '').toLowerCase() === supplier.toLowerCase())).slice(0, 5)
  if (!same.length) return null
  const kind = (r: any) => String(r.filed_to ?? '').startsWith('recharge_expenses:') ? 'landlord' : String(r.filed_to ?? '').startsWith('company_documents:') ? 'company' : 'document'
  const last = same[0]
  const agree = same.filter(r => kind(r) === kind(last) && (kind(last) !== 'landlord' || r.property_id === last.property_id)).length
  return { kind: kind(last), propertyId: last.property_id as string | null, category: last.bill?.filedCategory ?? null, times: agree, of: same.length }
}

export async function handleInvoiceEmail(s: SupabaseClient, emailData: any): Promise<{ kept: number; skipped: string[] }> {
  const emailId: string = emailData.email_id || emailData.id || ''
  const fromRaw: string = emailData.from || ''
  const from = fromRaw.replace(/.*<(.+)>/, '$1').trim().toLowerCase()
  const subject: string = String(emailData.subject || '').slice(0, 300)
  const text = String(emailData.text || emailData.plain_text || '') || plain(String(emailData.html || ''))
  const skipped: string[] = []

  // Gmail asks the new forwarding address to confirm: keep the code for the Capture screen (never acted on here)
  if (/forwarding-noreply@google\.com/i.test(from)) {
    const code = (subject + ' ' + text).match(/\b\d{9}\b/)?.[0] ?? null
    await s.from('system_settings').upsert({ key: 'invoice_inbox_gmail', value: JSON.stringify({ code, at: new Date().toISOString(), subject }) }, { onConflict: 'key' })
    return { kept: 0, skipped: ['gmail confirmation'] }
  }

  const atts = ((emailData.attachments ?? []) as any[]).filter(a => FILES.some(m => String(a.content_type || a.contentType || '').toLowerCase().startsWith(m)))
  const money = MONEY.test(subject) || MONEY.test(text.slice(0, 4000))
  if (!money && !atts.some(a => /pdf/i.test(String(a.content_type || a.contentType)))) return { kept: 0, skipped: ['nothing about money'] }
  if (!atts.length && NOT_COSTS.test(subject)) return { kept: 0, skipped: ['not a cost'] }

  const { data: props } = await s.from('properties').select('id, name, address, postcode, letting_type, is_demo')
  const managed = sortPropertiesNumerically((props ?? []) as any[])
  const plist = managed.map(p => ({ id: p.id, label: [String(p.name ?? '').split('\n')[0], String(p.address ?? '').replace(/\n/g, ', '), p.postcode].filter(Boolean).join(', ') + (p.letting_type === 'let_only' ? ' (let only — not managed)' : '') + (p.is_demo ? ' (demo house — practice only)' : '') }))
  // a postcode printed on the invoice is a stronger match than any guess
  const norm = (x: unknown) => String(x ?? '').toUpperCase().replace(/\s+/g, '')
  const byPostcode = (text: string) => { const t = norm(text); const hits = managed.filter(p => norm(p.postcode).length >= 5 && t.includes(norm(p.postcode))); return hits.length === 1 ? hits[0].id as string : null }
  const { data: contractor } = await s.from('people').select('id, first_name, last_name, company').eq('email', from).in('role', ['contractor', 'cleaner']).maybeSingle()

  // the documents to look at: each PDF/image attached, or the email itself when nothing is attached
  const docs: { bytes: Buffer | null; mime: string; name: string }[] = []
  for (const a of atts.slice(0, 5)) {
    const bytes = await fetchAttachment(emailId, a)
    if (bytes && bytes.length < 15_000_000) docs.push({ bytes, mime: String(a.content_type || a.contentType).toLowerCase().replace('image/jpg', 'image/jpeg'), name: String(a.filename || 'attachment') })
  }
  if (!docs.length) docs.push({ bytes: null, mime: 'text/plain', name: `${subject || 'Email'}.pdf` })

  let kept = 0
  for (const d of docs) {
    let read: InvoiceRead
    try { read = await readInvoice(d.bytes, d.mime, { from: fromRaw, subject, text }, plist) }
    catch (e) { skipped.push(`${d.name}: couldn't read (${e instanceof Error ? e.message : 'AI error'})`); continue }
    if (!read.is_cost || read.doc_type === 'not_a_cost' || read.doc_type === 'statement') { skipped.push(`${d.name}: not a cost`); continue }

    const bytes = d.bytes ?? await emailPdf(fromRaw, subject, new Date().toLocaleString('en-GB'), text)
    const mime = d.bytes ? d.mime : 'application/pdf'
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    const { data: seen } = await s.from('capture_items').select('id').eq('file_hash', hash).neq('status', 'discarded').limit(1)
    if (seen?.length) { skipped.push(`${d.name}: already in Capture`); continue }

    // the suggestion: how this sender was filed before > a contractor of ours > the address on it > the AI's view
    const past = await history(s, from, read.supplier)
    const pc = byPostcode(`${read.address} ${subject} ${text.slice(0, 4000)}`)
    let propertyId = pc ?? read.propertyId, belongs: string = read.belongs_to, why = pc && pc !== read.propertyId ? `${read.reason} · matched to the property by its postcode` : read.reason
    if (past && past.times >= 2) { belongs = past.kind; if (past.kind === 'landlord' && !propertyId) propertyId = past.propertyId; why = `You filed the last ${past.times} from ${read.supplier || from} this way` }
    else if (contractor && belongs !== 'company') {
      belongs = 'landlord'
      if (!propertyId) {
        const { data: job } = await s.from('maintenance_tickets').select('property_id').eq('contractor_id', contractor.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
        propertyId = job?.property_id ?? null
      }
      why = `From ${[contractor.first_name, contractor.last_name].filter(Boolean).join(' ') || contractor.company}, one of your contractors${propertyId && !read.propertyId ? ' — property from their latest job' : ''}`
    }
    if (managed.find(p => p.id === propertyId)?.letting_type === 'let_only' && belongs === 'landlord') why += ' · note: that property is let-only, not managed'

    // possible duplicates already on record anywhere (same amount and supplier or invoice number)
    let dup: string | null = null
    if (read.amount > 0) {
      const [{ data: ex }, { data: co }] = await Promise.all([
        s.from('recharge_expenses').select('txn_no, supplier, invoice_number, amount').eq('amount', read.amount).is('voided_at', null).limit(20),
        s.from('company_documents').select('cex_no, supplier, invoice_number, amount').eq('amount', read.amount).is('voided_at', null).limit(20),
      ])
      const hit = [...((ex ?? []) as any[]).map(x => ({ ...x, no: x.txn_no })), ...((co ?? []) as any[]).map(x => ({ ...x, no: x.cex_no }))]
        .find(x => (read.invoice_number && x.invoice_number === read.invoice_number) || (read.supplier && String(x.supplier ?? '').toLowerCase() === read.supplier.toLowerCase()))
      if (hit) dup = `Same amount and ${read.invoice_number && hit.invoice_number === read.invoice_number ? 'invoice number' : 'supplier'} as ${hit.no ?? 'one on record'}`
    }

    const ext = mime.includes('pdf') ? 'pdf' : mime.split('/')[1] || 'jpg'
    const path = `email/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await s.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
    if (upErr) { skipped.push(`${d.name}: storage ${upErr.message}`); continue }
    const kind = read.doc_type === 'receipt' || read.already_paid ? 'receipt' : 'bill'
    const { error } = await s.from('capture_items').insert({
      source: 'email', file_path: path, file_name: d.bytes ? d.name : `${(subject || 'Email').replace(/[^\w .-]+/g, '').slice(0, 60)}.pdf`, mime, size_bytes: bytes.length, status: 'new',
      email_from: from, email_subject: subject, email_id: emailId || null, file_hash: hash,
      guess: { kind, propertyId, room: read.room, title: [read.supplier, read.what_for].filter(Boolean).join(' — ').slice(0, 120), confidence: read.confidence, reason: why },
      bill: { ...read, belongs_to: belongs, propertyId, duplicate: dup, learnedFrom: past },
    })
    if (error) { await s.storage.from(BUCKET).remove([path]); skipped.push(`${d.name}: ${error.message}`); continue }
    kept++
  }
  return { kept, skipped }
}

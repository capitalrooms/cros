/**
 * POST /api/admin/bulk-tenancy-generator/send
 *
 * Emails a landlord their proposed tenancy agreements (and our invoice) from the bulk generator,
 * in the branded Capital Rooms email. The PDFs are generated here from the same inputs the page
 * previewed, so what the landlord receives is exactly what was reviewed.
 *
 * Body: { to: string[], cc: string[], subject, message (plain text), agreements: AgreementInput[],
 *         invoice?: invoice body (see lib/invoices/fromRequest), invoices?: invoice body[], preview?: true }
 * Agreements are optional when invoices are sent on their own (invoices-only mode).
 * preview → { html } of the email as the landlord will see it; nothing is sent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { buildEmail } from '@/lib/emailWrapper'
import { sendEmail } from '@/lib/sendEmail'
import { senderFor } from '@/lib/email/sender'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { generateTenancyAgreement, agreementFileName, type AgreementInput } from '@/lib/tenancyAgreement/generate'
import { generateLandlordInvoice } from '@/lib/invoices/landlordInvoice'
import { invoiceInputFromBody } from '@/lib/invoices/fromRequest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_AGREEMENTS = 30
const MAX_ATTACH_BYTES = 30 * 1024 * 1024   // Resend allows 40 MB per email after encoding

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const emails = (v: unknown) => Array.from(new Set((Array.isArray(v) ? v : []).map(e => String(e).trim().toLowerCase()).filter(Boolean)))

// Plain-text message → email HTML: blank lines split paragraphs, "•"/"-" lines become a list.
function messageHtml(text: string): string {
  const P = 'margin:0 0 16px;font-size:15px;color:#333;line-height:1.6'
  return text.replace(/\r/g, '').trim().split(/\n\s*\n/).map(block => {
    const lines = block.split('\n')
    if (lines.every(l => /^\s*[•\-*]\s+/.test(l))) {
      return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#333;line-height:1.7">${lines.map(l => `<li>${esc(l.replace(/^\s*[•\-*]\s+/, ''))}</li>`).join('')}</ul>`
    }
    return `<p style="${P}">${lines.map(esc).join('<br>')}</p>`
  }).join('\n')
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const message = String(b.message ?? '')
  if (!message.trim()) return NextResponse.json({ error: 'Write the email message' }, { status: 400 })

  if (b.preview) {
    const sender = await senderFor(req)
    return NextResponse.json({ html: await buildEmail(messageHtml(message), { sender }), from: sender.from })
  }

  const to = emails(b.to), cc = emails(b.cc).filter(e => !to.includes(e))
  const subject = String(b.subject ?? '').trim()
  const agreements: AgreementInput[] = Array.isArray(b.agreements) ? b.agreements : []
  const bad = [...to, ...cc].filter(e => !isEmail(e))
  if (!to.length) return NextResponse.json({ error: 'Add the recipient’s email address' }, { status: 400 })
  if (bad.length) return NextResponse.json({ error: `Not a valid email address: ${bad.join(', ')}` }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'Add a subject' }, { status: 400 })
  const invoices: unknown[] = [...(b.invoice ? [b.invoice] : []), ...(Array.isArray(b.invoices) ? b.invoices : [])]
  if (!agreements.length && !invoices.length) return NextResponse.json({ error: 'Nothing to send — no agreements or invoices' }, { status: 400 })
  if (agreements.length > MAX_AGREEMENTS) return NextResponse.json({ error: `Send at most ${MAX_AGREEMENTS} agreements in one email` }, { status: 400 })

  const biz = await fetchPDFBizSettings()
  const attachments: { filename: string; content: string }[] = []
  let bytes = 0
  const used = new Set<string>()
  const unique = (name: string) => {
    let n = name, i = 2
    while (used.has(n.toLowerCase())) n = name.replace(/\.pdf$/, ` (${i++}).pdf`)
    used.add(n.toLowerCase()); return n
  }
  try {
    for (const a of agreements) {
      const pdf = await generateTenancyAgreement(a, biz)
      bytes += pdf.length
      attachments.push({ filename: unique(agreementFileName(a)), content: pdf.toString('base64') })
    }
    for (const inv of invoices) {
      const { input, error } = invoiceInputFromBody(inv, biz)
      if (!input) return NextResponse.json({ error: `Invoice: ${error}` }, { status: 400 })
      const pdf = await generateLandlordInvoice(input)
      bytes += pdf.length
      attachments.push({ filename: unique(`Invoice ${input.invoiceNumber}.pdf`), content: pdf.toString('base64') })
    }
  } catch (err) {
    console.error('bulk-tenancy send: PDF generation failed', err)
    return NextResponse.json({ error: `Could not create the documents: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was sent.` }, { status: 500 })
  }
  if (bytes > MAX_ATTACH_BYTES) {
    return NextResponse.json({ error: `The documents are too large for one email (${(bytes / 1048576).toFixed(1)} MB). Send them in two batches.` }, { status: 413 })
  }

  const { ok, error } = await sendEmail(to, subject, messageHtml(message), { req, cc, attachments })
  if (!ok) return NextResponse.json({ error: `The email was not sent: ${error ?? 'unknown error'}` }, { status: 502 })

  return NextResponse.json({ ok: true, to, cc, attachments: attachments.map(a => a.filename), sentAt: new Date().toISOString() })
}

/**
 * POST /api/admin/document-generator/send
 *
 * Emails a Document Generator letter as a PDF attachment, from the signed-in staff member, in the
 * branded Capital Rooms email. The PDF is rendered here from the same letter the page previewed.
 *
 * Body: { to: string[], cc: string[], subject, message (plain text), letter: FormalLetter, signer?, preview?: true }
 * preview → { html, from } of the email as the recipient will see it; nothing is sent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { buildEmail } from '@/lib/emailWrapper'
import { sendEmail } from '@/lib/sendEmail'
import { senderFor } from '@/lib/email/sender'
import { messageHtml } from '@/lib/email/messageHtml'
import { renderFormalLetter, letterFileName } from '@/lib/letters/formalLetter'
import { letterFromBody, signerForRequest } from '@/lib/letters/letterFromRequest'
import { invoiceFromBody } from '@/lib/invoices/fromDocumentGenerator'
import { generateLandlordInvoice } from '@/lib/invoices/landlordInvoice'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const emails = (v: unknown) => Array.from(new Set((Array.isArray(v) ? v : []).map(e => String(e).trim().toLowerCase()).filter(Boolean)))

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const message = String(b.message ?? '')
  if (!message.trim()) return NextResponse.json({ error: 'Write the email message' }, { status: 400 })

  if (b.preview) {
    const sender = await senderFor(req)
    return NextResponse.json({ html: await buildEmail(messageHtml(message), { sender }), from: sender.from })
  }

  const to = emails(b.to), cc = emails(b.cc).filter(e => !to.includes(e))
  const subject = String(b.subject ?? '').trim()
  const bad = [...to, ...cc].filter(e => !isEmail(e))
  if (!to.length) return NextResponse.json({ error: 'Add the recipient’s email address' }, { status: 400 })
  if (bad.length) return NextResponse.json({ error: `Not a valid email address: ${bad.join(', ')}` }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'Add a subject' }, { status: 400 })

  // An invoice from the same page: attach the standard invoice instead of a letter.
  if (b.invoice) {
    const { input, error: invErr } = invoiceFromBody(b.invoice, await fetchPDFBizSettings())
    if (!input) return NextResponse.json({ error: `${invErr}. Nothing was sent.` }, { status: 400 })
    let invoicePdf: Buffer
    try { invoicePdf = await generateLandlordInvoice(input) }
    catch (err) {
      console.error('document-generator send: invoice PDF failed', err)
      return NextResponse.json({ error: 'Could not create the invoice. Nothing was sent.' }, { status: 500 })
    }
    const invoiceFile = `Invoice ${input.invoiceNumber}.pdf`
    const sent = await sendEmail(to, subject, messageHtml(message), { req, cc, attachments: [{ filename: invoiceFile, content: invoicePdf.toString('base64') }] })
    if (!sent.ok) return NextResponse.json({ error: `The email was not sent: ${sent.error ?? 'unknown error'}` }, { status: 502 })
    return NextResponse.json({ ok: true, to, cc, attachment: invoiceFile, sentAt: new Date().toISOString() })
  }

  const { letter, error } = letterFromBody(b.letter)
  if (!letter) return NextResponse.json({ error }, { status: 400 })
  if (/\[[^\]\n]{2,60}\]/.test(`${letter.subject}\n${letter.salutation}\n${letter.body}`))
    return NextResponse.json({ error: 'The letter still has [placeholders] to fill in. Nothing was sent.' }, { status: 400 })

  let pdf: Buffer
  try {
    pdf = await renderFormalLetter(letter, await signerForRequest(caller.email, b.signer))
  } catch (err) {
    console.error('document-generator send: PDF failed', err)
    return NextResponse.json({ error: `Could not create the letter: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was sent.` }, { status: 500 })
  }

  const filename = letterFileName(letter)
  const { ok, error: sendError } = await sendEmail(to, subject, messageHtml(message), {
    req, cc, attachments: [{ filename, content: pdf.toString('base64') }],
  })
  if (!ok) return NextResponse.json({ error: `The email was not sent: ${sendError ?? 'unknown error'}` }, { status: 502 })
  return NextResponse.json({ ok: true, to, cc, attachment: filename, sentAt: new Date().toISOString() })
}

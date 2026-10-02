/**
 * POST /api/admin/document-generator/invoice — the invoice side of Letters & Invoices.
 *
 *   { action: 'draft', instructions, recipient: { name, role }, current?, changes? }
 *       → { invoice: { title, propertyAddress, items }, missing, coverEmail }   (AI reads the instruction)
 *   { action: 'pdf', invoice: InvoiceBody, inline? }
 *       → the standard Capital Rooms invoice PDF (same layout as Bulk Agreements invoices)
 *
 * InvoiceBody: { recipientName, recipientAddress (lines), propertyAddress, invoiceNumber, invoiceDate, title,
 *                items: [{ description, detail, qty, unitPrice }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff } from '@/lib/portalAuth'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { generateLandlordInvoice } from '@/lib/invoices/landlordInvoice'
import { invoiceFromBody } from '@/lib/invoices/fromDocumentGenerator'
import { draftInvoice } from '@/lib/invoices/draftInvoice'
import { contentDisposition } from '@/lib/contentDisposition'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const FAILED = {
  refusal: 'The assistant declined to prepare this invoice. Try rewording the instruction.',
  max_tokens: 'The invoice came out too long — split it into two.',
  unparsed: 'Could not read the draft — try again',
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const biz = await fetchPDFBizSettings()

  if (b.action === 'draft') {
    const instructions = String(b.instructions ?? '').trim()
    if (!instructions) return NextResponse.json({ error: 'Say who to invoice and what for' }, { status: 400 })
    if (instructions.length > 10000) return NextResponse.json({ error: 'The instruction is too long — keep it under 10,000 characters' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured on server' }, { status: 500 })
    try {
      const out = await draftInvoice({
        instructions, company: biz.company_name,
        recipient: { name: b.recipient?.name, role: b.recipient?.role },
        current: b.current ?? null, changes: String(b.changes ?? '').trim(),
      })
      if ('failed' in out) return NextResponse.json({ error: FAILED[out.failed] }, { status: 422 })
      const d = out.draft
      return NextResponse.json({
        invoice: {
          title: d.title,
          propertyAddress: d.property_address,
          items: d.items.map(i => ({ description: i.description, detail: i.detail, qty: i.qty > 0 ? i.qty : 1, unitPrice: i.unit_price })),
        },
        missing: d.missing,
        coverEmail: d.cover_email,
      })
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'The assistant is busy — try again in a minute' }, { status: 429 })
      if (err instanceof Anthropic.APIError) {
        console.error('document-generator invoice draft: API error', err.status, err.message)
        return NextResponse.json({ error: `The assistant could not prepare the invoice (${err.status ?? 'error'})` }, { status: 502 })
      }
      console.error('document-generator invoice draft error:', err)
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
    }
  }

  if (b.action === 'pdf') {
    const { input, error } = invoiceFromBody(b.invoice, biz)
    if (!input) return NextResponse.json({ error }, { status: 400 })
    const pdf = await generateLandlordInvoice(input)
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Invoice ${input.invoiceNumber}.pdf`, b.inline ? 'inline' : 'attachment') },
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

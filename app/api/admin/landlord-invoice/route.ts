import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { generateLandlordInvoice } from '@/lib/invoices/landlordInvoice'
import { invoiceInputFromBody } from '@/lib/invoices/fromRequest'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { contentDisposition } from '@/lib/contentDisposition'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST → landlord invoice PDF on the letterhead.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { input, error } = invoiceInputFromBody(await req.json().catch(() => ({})), await fetchPDFBizSettings())
  if (!input) return NextResponse.json({ error }, { status: 400 })
  const pdf = await generateLandlordInvoice(input)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Invoice ${input.invoiceNumber}.pdf`, 'attachment') },
  })
}

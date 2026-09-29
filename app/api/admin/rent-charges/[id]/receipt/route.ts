/**
 * GET /api/admin/rent-charges/[id]/receipt
 *
 * Generates a Capital Rooms–branded payment receipt PDF for a single rent charge.
 * Sent to the tenant (or downloaded by admin) to confirm a payment was received.
 *
 * Layout:
 *   - Tenant address block (top-left) + logo (top-right)
 *   - Re: Payment Receipt line + rule
 *   - Receipt details table: amount, date, method, reference
 *   - Running balance note
 *   - Sign-off + footer
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import {
  loadPDFLetterheadAssets, fetchPDFBizSettings,
  drawPDFLogo, drawPDFFooter, drawPDFSignOff, drawPDFLetterRule, drawPDFSalutation,
  PAGE_W, PAGE_H, MARGIN, COL_W, FOOTER_BAND_H, LOGO_H,
  BLACK, GREY,
} from '@/lib/pdfLetterhead'
import { tenancyForCharge } from '@/lib/rentCharges'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'

const gbp = (n: number) =>
  `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  standing_order: 'Standing Order',
  cash: 'Cash',
  cheque: 'Cheque',
  other: 'Other',
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: adminPerson } = await supabase
    .from('people').select('first_name, last_name, job_title, role').eq('email', session.user.email).single()
  if (!adminPerson || !['administrator', 'admin', 'lettings'].includes(adminPerson.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Fetch charge + tenant + property ────────────────────────────────────────
  const { data: charge } = await supabase
    .from('rent_charges')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  charge.tenancy = await tenancyForCharge(supabase as any, charge,
    'id, person:people!tenancies_person_id_fkey (id, first_name, last_name, email), room:rooms (name, properties (name, address))')
  if (!['paid', 'partial'].includes(charge.status))
    return NextResponse.json({ error: 'Cannot issue receipt for an unpaid charge' }, { status: 400 })

  const person   = charge.tenancy?.person
  const room     = charge.tenancy?.room
  const prop     = room?.properties

  const tenantName = person
    ? [person.first_name, person.last_name].filter(Boolean).join(' ')
    : 'Tenant'
  const firstName = person?.first_name || tenantName

  const [assets, biz] = await Promise.all([
    Promise.resolve(loadPDFLetterheadAssets()),
    fetchPDFBizSettings(),
  ])
  const { logoImg, footerImg, penImg, fontReg, fontBold } = assets

  // ── Build PDF ────────────────────────────────────────────────────────────────
  const PDFDocument = (await import('pdfkit')).default
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  drawPDFLogo(doc, logoImg)

  // Tenant address
  let ay = MARGIN
  doc.font(fontBold).fontSize(9.5).fillColor(BLACK)
    .text(tenantName, MARGIN, ay, { width: PAGE_W - MARGIN * 2 - 100 - 20 })
  ay += 13
  if (prop?.name) {
    doc.font(fontReg).fontSize(9).fillColor(GREY).text(prop.name, MARGIN, ay, { width: 250 }); ay += 12
  }
  if (prop?.address) {
    doc.font(fontReg).fontSize(9).fillColor(GREY).text(prop.address, MARGIN, ay, { width: 250 }); ay += 12
  }
  if (person?.email) {
    doc.font(fontReg).fontSize(9).fillColor(GREY).text(person.email, MARGIN, ay, { width: 250 }); ay += 12
  }

  const afterAddr = Math.max(ay + 12, MARGIN + LOGO_H + 20)
  doc.font(fontReg).fontSize(9).fillColor(GREY)
    .text(fmtDate(new Date().toISOString().slice(0, 10)), MARGIN, afterAddr)
  let y = afterAddr + 20

  // Re: line
  doc.save()
    .font(fontReg).fontSize(9).fillColor(BLACK)
    .text('Re:  ', MARGIN, y, { continued: true })
    .font(fontBold).text(`Payment Receipt — ${room?.name ? room.name + ', ' : ''}${prop?.name || prop?.address || ''}`)
    .restore()
  y = drawPDFLetterRule(doc, y + 16)

  y = drawPDFSalutation(doc, y, firstName, fontReg)

  doc.font(fontReg).fontSize(9).fillColor(GREY)
    .text('Thank you — we have received your rent payment. Please retain this receipt for your records.', MARGIN, y, { width: COL_W, lineGap: 2 })
  y = doc.y + 20

  // ── Receipt details table ────────────────────────────────────────────────────
  const rows = [
    { label: 'Amount received',  value: gbp(Number(charge.amount_received)) },
    { label: 'Amount due',       value: gbp(Number(charge.amount_due)) },
    ...(Number(charge.amount_due) !== Number(charge.amount_received)
      ? [{ label: 'Balance outstanding', value: gbp(Math.max(0, Number(charge.amount_due) - Number(charge.amount_received))) }]
      : [{ label: 'Balance outstanding', value: '£0.00 — fully cleared' }]),
    { label: 'Date received',    value: fmtDate(charge.paid_at) },
    { label: 'Payment method',   value: METHOD_LABEL[charge.payment_method] || charge.payment_method || '—' },
    { label: 'Payment period',   value: charge.charge_month ? fmtDate(charge.charge_month + '-01').replace(/^\d+ /, '').replace(/^(\w+ )(\w+ )/, '$1 $2') : fmtDate(charge.due_date) },
    { label: 'Property',         value: prop?.name || prop?.address || '—' },
    { label: 'Room',             value: room?.name || '—' },
    ...(charge.payment_notes ? [{ label: 'Reference / Notes', value: charge.payment_notes }] : []),
  ]

  for (const [i, row] of rows.entries()) {
    if (i % 2 === 0) doc.rect(MARGIN, y, COL_W, 16).fillColor('#F9FAFB').fill()
    doc.font(fontReg).fontSize(8.5).fillColor(GREY)
      .text(row.label, MARGIN + 8, y + 4, { width: 160 })
    doc.font(fontBold).fontSize(8.5).fillColor(
        row.label === 'Balance outstanding' && row.value === '£0.00 — fully cleared'
          ? '#059669'
          : row.label === 'Amount received'
            ? BLACK
            : '#374151'
      )
      .text(row.value, MARGIN + 175, y + 4, { width: COL_W - 183 })
    y += 16
  }

  // Receipt box border
  doc.strokeColor('#E5E7EB').lineWidth(0.5)
    .rect(MARGIN, y - rows.length * 16, COL_W, rows.length * 16).stroke()

  y += 20

  // ── Sign-off ──────────────────────────────────────────────────────────────────
  y = drawPDFSignOff(doc, y, {
    name: [adminPerson.first_name, adminPerson.last_name].filter(Boolean).join(' ') || 'Harry Buchanan',
    jobTitle: (adminPerson as any).job_title || 'Lettings Manager',
  }, penImg, fontReg, fontBold)

  // Footer
  const range = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    drawPDFFooter(doc, footerImg, biz, fontReg)
  }

  doc.end()
  const pdf = await new Promise<Buffer>(resolve => { doc.on('end', () => resolve(Buffer.concat(chunks))) })

  const filename = `capital-rooms-receipt-${tenantName.replace(/\s+/g, '-').toLowerCase()}-${charge.charge_month || charge.due_date?.slice(0, 7) || 'payment'}.pdf`
  return new NextResponse(pdf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(`${filename}`, 'attachment'),
      'Content-Length':      String(pdf.byteLength),
    },
  })
}

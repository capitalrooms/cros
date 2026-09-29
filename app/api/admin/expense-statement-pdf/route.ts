/**
 * GET /api/admin/expense-statement-pdf?property_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Generates a Capital Rooms–branded expense statement PDF for one property over a date range.
 * Itemised list of all recharge expenses with totals, formatted for accountant review.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import {
  loadPDFLetterheadAssets, fetchPDFBizSettings,
  drawPDFLogo, drawPDFFooter, drawPDFLetterRule,
  PAGE_W, PAGE_H, MARGIN, COL_W, FOOTER_BAND_H, LOGO_H,
  BLACK, GREY,
} from '@/lib/pdfLetterhead'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'

const gbp = (n: number) =>
  `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (s: string) =>
  new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: adminPerson } = await supabase
    .from('people').select('role').eq('email', session.user.email).single()
  if (!adminPerson || !['administrator', 'admin', 'lettings'].includes(adminPerson.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('property_id')
  const from = searchParams.get('from') || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
  const to   = searchParams.get('to')   || new Date().toISOString().slice(0, 10)

  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })

  const { data: prop } = await supabase
    .from('properties')
    .select('id, name, address, property_code, landlord_id, landlord:people!properties_landlord_id_fkey(first_name, last_name, email)')
    .eq('id', propertyId).single()
  if (!prop) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const { data: expenses } = await supabase
    .from('recharge_expenses')
    .select('id, description, amount, expense_date, reference, source')
    .eq('property_id', propertyId)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: true })

  const rows = expenses || []
  const total = rows.reduce((s: number, e: any) => s + Number(e.amount), 0)

  const [assets, biz] = await Promise.all([
    Promise.resolve(loadPDFLetterheadAssets()),
    fetchPDFBizSettings(),
  ])
  const { logoImg, footerImg, fontReg, fontBold } = assets

  const PDFDocument = (await import('pdfkit')).default
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  drawPDFLogo(doc, logoImg)

  // Landlord address block
  const landlord = (prop as any).landlord
  const landlordName = landlord ? [landlord.first_name, landlord.last_name].filter(Boolean).join(' ') : '—'
  let ay = MARGIN
  doc.font(fontBold).fontSize(9.5).fillColor(BLACK).text(landlordName, MARGIN, ay, { width: 250 }); ay += 13
  doc.font(fontReg).fontSize(9).fillColor(GREY).text(prop.name || prop.address, MARGIN, ay, { width: 250 }); ay += 12
  if (landlord?.email) { doc.font(fontReg).fontSize(9).fillColor(GREY).text(landlord.email, MARGIN, ay, { width: 250 }); ay += 12 }

  const afterAddr = Math.max(ay + 12, MARGIN + LOGO_H + 20)
  doc.font(fontReg).fontSize(9).fillColor(GREY)
    .text(fmtDate(new Date().toISOString().slice(0, 10)), MARGIN, afterAddr)
  let y = afterAddr + 20

  doc.save().font(fontReg).fontSize(9).fillColor(BLACK)
    .text('Re:  ', MARGIN, y, { continued: true })
    .font(fontBold).text(`Expense Statement — ${prop.name || prop.address} — ${fmtDate(from)} to ${fmtDate(to)}`)
    .restore()
  y = drawPDFLetterRule(doc, y + 16)

  // Table header
  const cols = { date: 75, ref: 65, desc: 235, cat: 80, amount: 36 }
  const colX = { date: MARGIN, ref: MARGIN + cols.date, desc: MARGIN + cols.date + cols.ref, cat: MARGIN + cols.date + cols.ref + cols.desc, amount: MARGIN + cols.date + cols.ref + cols.desc + cols.cat }

  doc.rect(MARGIN, y, COL_W, 14).fillColor('#F3F4F6').fill()
  doc.font(fontBold).fontSize(7.5).fillColor('#4B5563')
  doc.text('Date',        colX.date   + 2, y + 4, { width: cols.date   - 4 })
  doc.text('Ref',         colX.ref    + 2, y + 4, { width: cols.ref    - 4 })
  doc.text('Description', colX.desc   + 2, y + 4, { width: cols.desc   - 4 })
  doc.text('Category',    colX.cat    + 2, y + 4, { width: cols.cat    - 4 })
  doc.text('Amount',      colX.amount + 2, y + 4, { width: cols.amount + 5, align: 'right' })
  y += 14

  const bodyBottom = PAGE_H - FOOTER_BAND_H - 30
  let rowNum = 0
  for (const e of rows as any[]) {
    if (y > bodyBottom - 14) { doc.addPage(); y = MARGIN }
    if (rowNum % 2 === 0) doc.rect(MARGIN, y, COL_W, 14).fillColor('#FAFAFA').fill()
    doc.font(fontReg).fontSize(8).fillColor(BLACK)
    doc.text(fmtDate(e.expense_date), colX.date   + 2, y + 3, { width: cols.date   - 4 })
    doc.text(e.reference || '—',      colX.ref    + 2, y + 3, { width: cols.ref    - 4 })
    doc.text(e.description || '—',    colX.desc   + 2, y + 3, { width: cols.desc   - 4 })
    doc.text((e.source || '').replace(/_/g, ' ') || '—', colX.cat + 2, y + 3, { width: cols.cat - 4 })
    doc.font(fontBold).text(gbp(Number(e.amount)), colX.amount + 2, y + 3, { width: cols.amount + 5, align: 'right' })
    y += 14
    rowNum++
  }

  if (rows.length === 0) {
    doc.font(fontReg).fontSize(9).fillColor(GREY).text('No expenses found for this period.', MARGIN, y + 4); y += 20
  }

  // Total row
  if (y > bodyBottom - 18) { doc.addPage(); y = MARGIN }
  doc.rect(MARGIN, y, COL_W, 18).fillColor('#111827').fill()
  doc.font(fontBold).fontSize(9).fillColor('white')
    .text('TOTAL', MARGIN + 8, y + 5, { width: 200 })
    .text(gbp(total), colX.amount - 8, y + 5, { width: cols.amount + 15, align: 'right' })
  y += 28

  doc.font(fontReg).fontSize(8).fillColor(GREY)
    .text(`${rows.length} expense${rows.length !== 1 ? 's' : ''} · Period: ${fmtDate(from)} – ${fmtDate(to)} · ${prop.name || prop.address}`, MARGIN, y, { width: COL_W })
  y += 20

  doc.font(fontReg).fontSize(8).fillColor(GREY)
    .text('These expenses have been recharged to the landlord and deducted from the net remittance. All figures inclusive of VAT where applicable.', MARGIN, y, { width: COL_W, lineGap: 2 })

  const range = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    drawPDFFooter(doc, footerImg, biz, fontReg)
  }

  doc.end()
  const pdf = await new Promise<Buffer>(resolve => { doc.on('end', () => resolve(Buffer.concat(chunks))) })

  const propCode = (prop as any).property_code || propertyId.slice(0, 8)
  const filename = `capital-rooms-expenses-${propCode}-${from.slice(0, 7)}-to-${to.slice(0, 7)}.pdf`
  return new NextResponse(pdf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(`${filename}`, 'attachment'),
      'Content-Length':      String(pdf.byteLength),
    },
  })
}

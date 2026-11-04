/**
 * GET /api/admin/arrears-letter?rent_charge_id=...
 *
 * Generates a Capital Rooms–branded formal rent arrears letter for a tenant.
 * Addressed to the specific tenant, showing what is owed and payment instructions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { dearName, dearFromText } from '@/lib/people'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import {
  loadPDFLetterheadAssets, fetchPDFBizSettings,
  drawPDFLogo, drawPDFFooter, drawPDFSignOff, drawPDFLetterRule, drawPDFSalutation,
  PAGE_W, MARGIN, COL_W, LOGO_H,
  BLACK, GREY,
} from '@/lib/pdfLetterhead'
import { tenancyForCharge } from '@/lib/rentCharges'
import { contentDisposition } from '@/lib/contentDisposition'
import { PDF } from '@/lib/pdf/palette'

export const dynamic = 'force-dynamic'

const gbp = (n: number) =>
  `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: adminPerson } = await supabase
    .from('people').select('salutation, first_name, last_name, job_title, role').eq('email', session.user.email).single()
  if (!adminPerson || !['administrator', 'admin', 'lettings'].includes(adminPerson.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const chargeId = searchParams.get('rent_charge_id')
  if (!chargeId) return NextResponse.json({ error: 'rent_charge_id required' }, { status: 400 })

  const { data: charge } = await supabase
    .from('rent_charges')
    .select('*')
    .eq('id', chargeId).single()

  if (!charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  charge.tenancy = await tenancyForCharge(supabase as any, charge,
    'id, rent_amount, payment_reference, person:people!tenancies_person_id_fkey (id, salutation, first_name, last_name, email), room:rooms (name, properties (name, address, landlord:people!properties_landlord_id_fkey (salutation, first_name, last_name)))')

  const person = charge.tenancy?.person
  const room   = charge.tenancy?.room
  const prop   = room?.properties

  const tenantName = person ? [person.salutation, person.first_name, person.last_name].filter(Boolean).join(' ') : 'Tenant'
  const firstName  = person?.first_name || tenantName
  const outstanding = Math.max(0, Number(charge.amount_due) - Number(charge.amount_received || 0))

  const [assets, biz] = await Promise.all([
    Promise.resolve(loadPDFLetterheadAssets()),
    fetchPDFBizSettings(),
  ])
  const { logoImg, footerImg, penImg, fontReg, fontBold } = assets

  const PDFDocument = (await import('pdfkit')).default
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  drawPDFLogo(doc, logoImg)

  // Tenant address block
  let ay = MARGIN
  doc.font(fontBold).fontSize(9.5).fillColor(BLACK)
    .text(tenantName, MARGIN, ay, { width: PAGE_W - MARGIN * 2 - 100 - 20 }); ay += 13
  if (prop?.name) { doc.font(fontReg).fontSize(9).fillColor(GREY).text(prop.name, MARGIN, ay, { width: 250 }); ay += 12 }
  if (room?.name) { doc.font(fontReg).fontSize(9).fillColor(GREY).text(room.name, MARGIN, ay, { width: 250 }); ay += 12 }
  if (prop?.address) { doc.font(fontReg).fontSize(9).fillColor(GREY).text(prop.address, MARGIN, ay, { width: 250 }); ay += 12 }

  const afterAddr = Math.max(ay + 12, MARGIN + LOGO_H + 20)
  doc.font(fontReg).fontSize(9).fillColor(GREY)
    .text(fmtDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })), MARGIN, afterAddr)
  let y = afterAddr + 20

  doc.save()
    .font(fontReg).fontSize(9).fillColor(BLACK)
    .text('Re:  ', MARGIN, y, { continued: true })
    .font(fontBold).text(`Rent arrears — ${room?.name ? room.name + ', ' : ''}${prop?.name || prop?.address || ''}`)
    .restore()
  y = drawPDFLetterRule(doc, y + 16)

  y = drawPDFSalutation(doc, y, person ? dearName(person as any) : dearFromText(tenantName), fontReg)   // "Dear Miss Pious" (lib/people)

  // Body
  doc.font(fontReg).fontSize(9.5).fillColor(BLACK)
    .text('We are writing about an outstanding balance on your rent account. Our records show the following amount is unpaid:', MARGIN, y, { width: COL_W, lineGap: 2 })
  y = doc.y + 18

  // Arrears box
  const boxH = 56
  doc.rect(MARGIN, y, COL_W, boxH).fillColor(PDF.tint).fill()
  doc.strokeColor(PDF.tint).lineWidth(1).rect(MARGIN, y, COL_W, boxH).stroke()

  doc.font(fontReg).fontSize(8.5).fillColor(PDF.alert)
    .text('AMOUNT OUTSTANDING', MARGIN + 16, y + 12, { width: COL_W - 32 })
  doc.font(fontBold).fontSize(22).fillColor(PDF.alert)
    .text(gbp(outstanding), MARGIN + 16, y + 24, { width: COL_W - 32 })
  doc.font(fontReg).fontSize(8).fillColor(PDF.alert)
    .text([`Due ${fmtDate(charge.due_date)}`, charge.tenancy?.payment_reference ? `Payment reference ${charge.tenancy.payment_reference}` : null].filter(Boolean).join('   ·   '), MARGIN + 16, y + 44, { width: COL_W - 32 })
  y += boxH + 18

  // Payment instructions
  doc.font(fontBold).fontSize(9.5).fillColor(BLACK).text('Payment details', MARGIN, y); y += 14
  // only ways that exist (4 Nov 2026: this used to offer an "online portal" payment the tenant app doesn't take)
  const instructions = [
    `Bank transfer: please pay ${gbp(outstanding)} into the account you normally pay your rent into${charge.tenancy?.payment_reference ? `, quoting your payment reference ${charge.tenancy.payment_reference}` : ', quoting your name and room'}.`,
    'Standing order: if you pay by standing order, please check that it is set up for the correct amount and date.',
  ]
  for (const line of instructions) {
    doc.font(fontReg).fontSize(9).fillColor(GREY)
      .text(`▸  ${line}`, MARGIN, y, { width: COL_W, lineGap: 2, indent: 14 })
    y = doc.y + 8
  }

  y += 4
  doc.font(fontReg).fontSize(9).fillColor(BLACK)
    .text(`If payment has already been made or you have any queries about this letter, please contact us at ${biz.email} or on ${biz.phone}. If we do not receive payment or hear from you within 7 days, we may need to take further action.`, MARGIN, y, { width: COL_W, lineGap: 2 })
  y = doc.y + 16

  y = drawPDFSignOff(doc, y, {
    name: [adminPerson.first_name, adminPerson.last_name].filter(Boolean).join(' ') || 'Harry Buchanan',
    jobTitle: (adminPerson as any).job_title || 'Lettings Manager',
  }, penImg, fontReg, fontBold)

  const range = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    drawPDFFooter(doc, footerImg, biz, fontReg)
  }

  doc.end()
  const pdf = await new Promise<Buffer>(resolve => { doc.on('end', () => resolve(Buffer.concat(chunks))) })

  const filename = `capital-rooms-arrears-${tenantName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })}.pdf`
  return new NextResponse(pdf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(`${filename}`, 'attachment'),
      'Content-Length':      String(pdf.byteLength),
    },
  })
}

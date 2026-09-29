/**
 * GET /api/admin/arrears-letter?rent_charge_id=...
 *
 * Generates a Capital Rooms–branded formal rent arrears letter for a tenant.
 * Addressed to the specific tenant, showing what is owed and payment instructions.
 */

import { NextRequest, NextResponse } from 'next/server'
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
    .from('people').select('first_name, last_name, job_title, role').eq('email', session.user.email).single()
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
    'id, rent_amount, person:people!tenancies_person_id_fkey (id, first_name, last_name, email), room:rooms (name, properties (name, address, landlord:people!properties_landlord_id_fkey (first_name, last_name)))')

  const person = charge.tenancy?.person
  const room   = charge.tenancy?.room
  const prop   = room?.properties

  const tenantName = person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : 'Tenant'
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
    .text(fmtDate(new Date().toISOString().slice(0, 10)), MARGIN, afterAddr)
  let y = afterAddr + 20

  doc.save()
    .font(fontReg).fontSize(9).fillColor(BLACK)
    .text('Re:  ', MARGIN, y, { continued: true })
    .font(fontBold).text(`Rent Arrears Notice — ${room?.name ? room.name + ', ' : ''}${prop?.name || prop?.address || ''}`)
    .restore()
  y = drawPDFLetterRule(doc, y + 16)

  y = drawPDFSalutation(doc, y, firstName, fontReg)

  // Body
  doc.font(fontReg).fontSize(9.5).fillColor(BLACK)
    .text('We write to draw your attention to an outstanding balance on your rent account. Our records show the following amount remains unpaid:', MARGIN, y, { width: COL_W, lineGap: 2 })
  y = doc.y + 18

  // Arrears box
  const boxH = 56
  doc.rect(MARGIN, y, COL_W, boxH).fillColor('#FEF2F2').fill()
  doc.strokeColor('#FECACA').lineWidth(1).rect(MARGIN, y, COL_W, boxH).stroke()

  doc.font(fontReg).fontSize(8.5).fillColor('#991B1B')
    .text('AMOUNT OUTSTANDING', MARGIN + 16, y + 12, { width: COL_W - 32 })
  doc.font(fontBold).fontSize(22).fillColor('#991B1B')
    .text(gbp(outstanding), MARGIN + 16, y + 24, { width: COL_W - 32 })
  doc.font(fontReg).fontSize(8).fillColor('#B91C1C')
    .text(`Due date: ${fmtDate(charge.due_date)} · Rent charge ID: ${chargeId.slice(0, 8).toUpperCase()}`, MARGIN + 16, y + 44, { width: COL_W - 32 })
  y += boxH + 18

  // Payment instructions
  doc.font(fontBold).fontSize(9.5).fillColor(BLACK).text('How to pay', MARGIN, y); y += 14
  const instructions = [
    `Bank Transfer: Please transfer ${gbp(outstanding)} to the account details held on file and include your name and property address as the reference.`,
    'Standing Order: If you have an active standing order, please check that the correct amount is set up and contact us if you need assistance.',
    `Online Portal: Log in to your tenant account to make a payment directly.`,
  ]
  for (const line of instructions) {
    doc.font(fontReg).fontSize(9).fillColor(GREY)
      .text(`▸  ${line}`, MARGIN, y, { width: COL_W, lineGap: 2, indent: 14 })
    y = doc.y + 8
  }

  y += 4
  doc.font(fontReg).fontSize(9).fillColor(BLACK)
    .text(`If payment has already been made or you have any queries regarding this notice, please contact us immediately at ${biz.email} or ${biz.phone}. Failure to make payment or contact us within 7 days may result in further action being taken.`, MARGIN, y, { width: COL_W, lineGap: 2 })
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

  const filename = `capital-rooms-arrears-${tenantName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
  return new NextResponse(pdf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(`${filename}`, 'attachment'),
      'Content-Length':      String(pdf.byteLength),
    },
  })
}

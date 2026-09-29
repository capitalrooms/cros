/**
 * GET /api/admin/landlord-statement/pdf?landlord_id=...&month=YYYY-MM
 *
 * Generates a Capital Rooms–branded monthly remittance statement PDF for one landlord.
 * Uses the standard pdfLetterhead.ts library — letterhead logo top-right, dark footer band.
 *
 * Layout:
 *   - Header: "Landlord Remittance Statement" + period
 *   - Landlord address block (top-left, parallel with logo)
 *   - Re: line + rule
 *   - Per-property section with room table
 *   - Expense deductions
 *   - Grand total box
 *   - Sign-off
 *   - Footer (footer band on every page via bufferPages)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import {
  loadPDFLetterheadAssets, fetchPDFBizSettings,
  drawPDFLogo, drawPDFFooter, drawPDFSignOff, drawPDFLetterRule,
  PAGE_W, PAGE_H, MARGIN, COL_W, FOOTER_BAND_H,
  LOGO_W, LOGO_H, BLACK, GREY,
} from '@/lib/pdfLetterhead'
import { landlordFormalNames } from '@/lib/people'
import { contentDisposition } from '@/lib/contentDisposition'
import { resolveFee, feeAmount } from '@/lib/fees/managementFee'

export const dynamic = 'force-dynamic'

const gbp = (n: number) =>
  `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function monthLabel(iso: string) {
  return new Date(iso + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: adminPerson } = await supabase
    .from('people').select('first_name, last_name, job_title, role').eq('email', session.user.email).single()
  if (!adminPerson || !['administrator', 'admin', 'lettings'].includes(adminPerson.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const landlordId = searchParams.get('landlord_id')
  const month      = searchParams.get('month') || new Date().toISOString().slice(0, 7)

  if (!landlordId) return NextResponse.json({ error: 'landlord_id required' }, { status: 400 })

  // ── Fetch landlord ───────────────────────────────────────────────────────────
  const { data: landlord } = await supabase
    .from('people')
    .select('id, first_name, last_name, email, home_address, joint_salutation, joint_first_name, joint_last_name, salutation')
    .eq('id', landlordId).single()
  if (!landlord) return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })

  // ── Fetch properties for this landlord ──────────────────────────────────────
  const { data: properties } = await supabase
    .from('properties')
    .select(`
      id, name, address, property_code, management_fee_pct, management_fee_type, management_fee_fixed,
      rooms (
        id, name, current_asking_rent, status,
        tenancies (
          id, person_id, start_date, end_date, management_fee_type, management_fee_pct, management_fee_fixed,
          people:people!tenancies_person_id_fkey (first_name, last_name)
        )
      )
    `)
    .eq('landlord_id', landlordId)
  if (!properties?.length) return NextResponse.json({ error: 'No properties for this landlord' }, { status: 404 })

  // ── Fetch rent charges for this month ───────────────────────────────────────
  const propIds = properties.map((p: any) => p.id)
  const roomIds = properties.flatMap((p: any) => (p.rooms || []).map((r: any) => r.id))

  const monthStart = month + '-01'
  const monthEnd   = new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 0)
    .toISOString().slice(0, 10)

  const { data: charges } = await supabase
    .from('rent_charges')
    .select('id, room_id, amount_due, amount_received, status, charge_month, payment_method')
    .in('room_id', roomIds.length ? roomIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('charge_month', monthStart)
    .lte('charge_month', monthEnd)

  const chargesByRoom: Record<string, any> = {}
  for (const c of (charges || [])) chargesByRoom[c.room_id] = c

  // ── Fetch expenses for this month ───────────────────────────────────────────
  const { data: expenses } = await supabase
    .from('recharge_expenses')
    .select('id, property_id, description, amount, expense_date, reference')
    .in('property_id', propIds.length ? propIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('expense_date', monthStart)
    .lte('expense_date', monthEnd)

  const expensesByProp: Record<string, any[]> = {}
  for (const e of (expenses || [])) {
    if (!expensesByProp[e.property_id]) expensesByProp[e.property_id] = []
    expensesByProp[e.property_id].push(e)
  }

  // ── Load assets & biz settings ──────────────────────────────────────────────
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

  const landlordName = landlordFormalNames(landlord as any) || 'Landlord'
  const statementDate = fmtDate(new Date().toISOString().slice(0, 10))

  // ── Page 1 header ────────────────────────────────────────────────────────────
  const drawPageHeader = () => {
    drawPDFLogo(doc, logoImg)

    // Landlord address block (top-left)
    let ay = MARGIN
    doc.font(fontBold).fontSize(9.5).fillColor(BLACK).text(landlordName, MARGIN, ay, { width: PAGE_W - MARGIN * 2 - LOGO_W - 20 })
    ay += 13
    for (const line of String(landlord.home_address || '').split(/\n|,\s*/).map(l => l.trim()).filter(Boolean)) {
      doc.font(fontReg).fontSize(9).fillColor(GREY).text(line, MARGIN, ay, { width: 250 }); ay += 12
    }
    if (landlord.email) {
      doc.font(fontReg).fontSize(9).fillColor(GREY).text(landlord.email, MARGIN, ay, { width: 250 }); ay += 12
    }

    const afterAddr = Math.max(ay + 12, MARGIN + LOGO_H + 20)
    doc.y = afterAddr

    // Date
    doc.font(fontReg).fontSize(9).fillColor(GREY).text(statementDate, MARGIN, afterAddr)
    let y = afterAddr + 20

    // Re: line
    doc.save()
      .font(fontReg).fontSize(9).fillColor(BLACK)
      .text('Re:  ', MARGIN, y, { continued: true })
      .font(fontBold).text(`Landlord Remittance Statement — ${monthLabel(month)}`)
      .restore()
    y = drawPDFLetterRule(doc, y + 16)

    // Opening line
    doc.font(fontReg).fontSize(9.5).fillColor(BLACK)
      .text(`Dear ${landlord.first_name || landlordName},`, MARGIN, y)
    y += 22
    doc.font(fontReg).fontSize(9).fillColor(GREY)
      .text('Please find below your remittance statement for the period shown above. A summary of rent collected, management fees deducted, and any expenses recharged is set out per property below.', MARGIN, y, { width: COL_W, lineGap: 2 })
    y = doc.y + 16

    return y
  }

  let y = drawPageHeader()
  const bodyBottom = PAGE_H - FOOTER_BAND_H - 30

  // ── Per-property sections ────────────────────────────────────────────────────
  let grandRent = 0, grandFee = 0, grandExpenses = 0, grandNet = 0

  for (const prop of (properties as any[])) {
    // each room's fee: its tenancy's own fee, else the property's (lib/fees/managementFee) — never assumed
    const occupiedRooms = (prop.rooms || []).filter((r: any) => r.status === 'occupied' || chargesByRoom[r.id])

    // Section heading
    if (y > bodyBottom - 60) { doc.addPage(); y = MARGIN }
    doc.font(fontBold).fontSize(10).fillColor(BLACK).text(prop.name || prop.address, MARGIN, y)
    y += 13
    doc.font(fontReg).fontSize(8.5).fillColor(GREY).text(prop.address || '', MARGIN, y); y += 14

    // Table header
    const cols = { room: 150, tenant: 160, rent: 70, fee: 70, net: 70 }
    const colX = { room: MARGIN, tenant: MARGIN + cols.room, rent: MARGIN + cols.room + cols.tenant, fee: MARGIN + cols.room + cols.tenant + cols.rent, net: MARGIN + cols.room + cols.tenant + cols.rent + cols.fee }

    doc.rect(MARGIN, y, COL_W, 14).fillColor('#F3F4F6').fill()
    doc.font(fontBold).fontSize(7.5).fillColor('#4B5563')
    doc.text('Room',           colX.room   + 3, y + 4, { width: cols.room   - 6 })
    doc.text('Tenant',         colX.tenant + 3, y + 4, { width: cols.tenant - 6 })
    doc.text('Rent',           colX.rent   + 3, y + 4, { width: cols.rent   - 6, align: 'right' })
    doc.text('Fee', colX.fee  + 3, y + 4, { width: cols.fee    - 6, align: 'right' })
    doc.text('Net',            colX.net    + 3, y + 4, { width: cols.net    - 6, align: 'right' })
    y += 14

    let propRent = 0, propFee = 0

    for (const room of occupiedRooms) {
      if (y > bodyBottom - 16) { doc.addPage(); y = MARGIN }
      const charge = chargesByRoom[room.id]
      const rent = charge ? Number(charge.amount_received || charge.amount_due) : Number(room.current_asking_rent || 0)
      const tenancy = ((room.tenancies || []) as any[]).filter(t => t.start_date <= monthEnd && (!t.end_date || t.end_date >= monthStart))
        .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0] ?? (room.tenancies || [])[0]
      const fee  = feeAmount(resolveFee(tenancy, prop), { received: rent, charged: charge ? Number(charge.amount_due || 0) : rent }) ?? 0
      const net  = rent - fee
      propRent += rent; propFee += fee

      const tenantName = tenancy?.people
        ? [tenancy.people.first_name, tenancy.people.last_name].filter(Boolean).join(' ')
        : '—'
      const statusStr = charge?.status || 'pending'

      doc.font(fontReg).fontSize(8).fillColor(BLACK)
      doc.text(room.name || '—',  colX.room   + 3, y + 3, { width: cols.room   - 6 })
      doc.text(tenantName,        colX.tenant + 3, y + 3, { width: cols.tenant - 6 })
      doc.text(gbp(rent),         colX.rent   + 3, y + 3, { width: cols.rent   - 6, align: 'right' })
      doc.font(fontReg).fillColor('#DC2626')
        .text(`−${gbp(fee)}`,     colX.fee    + 3, y + 3, { width: cols.fee    - 6, align: 'right' })
      doc.fillColor(statusStr === 'paid' ? '#059669' : BLACK)
        .font(fontBold).text(gbp(net), colX.net + 3, y + 3, { width: cols.net - 6, align: 'right' })

      doc.strokeColor('#F3F4F6').lineWidth(0.5)
        .moveTo(MARGIN, y + 14).lineTo(MARGIN + COL_W, y + 14).stroke()
      y += 14
    }

    if (occupiedRooms.length === 0) {
      doc.font(fontReg).fontSize(8).fillColor(GREY).text('No occupied rooms this period.', MARGIN, y + 3); y += 14
    }

    // Expenses
    const propExpenses = expensesByProp[prop.id] || []
    let totalExpenses = 0
    if (propExpenses.length > 0) {
      y += 4
      doc.font(fontBold).fontSize(8).fillColor('#374151').text('Expenses recharged:', MARGIN, y); y += 12
      for (const e of propExpenses) {
        if (y > bodyBottom - 14) { doc.addPage(); y = MARGIN }
        doc.font(fontReg).fontSize(8).fillColor('#4B5563')
          .text(e.description || 'Expense', MARGIN + 8, y + 2, { width: COL_W - 80 })
        doc.fillColor('#DC2626').font(fontBold)
          .text(`−${gbp(Number(e.amount))}`, MARGIN + COL_W - 70, y + 2, { width: 70, align: 'right' })
        totalExpenses += Number(e.amount)
        y += 13
      }
      grandExpenses += totalExpenses
    }

    // Property subtotal bar
    if (y > bodyBottom - 20) { doc.addPage(); y = MARGIN }
    const propNet = propRent - propFee - totalExpenses
    grandRent += propRent; grandFee += propFee; grandNet += propNet
    doc.rect(MARGIN, y, COL_W, 18).fillColor('#F9FAFB').fill()
    doc.strokeColor('#E5E7EB').lineWidth(0.5).rect(MARGIN, y, COL_W, 18).stroke()
    doc.font(fontBold).fontSize(8.5).fillColor('#374151')
      .text(`${prop.name || 'Property'} subtotal`, MARGIN + 6, y + 5, { width: 300 })
    doc.fillColor(propNet < 0 ? '#DC2626' : '#059669')
      .text(gbp(propNet), MARGIN + COL_W - 80, y + 5, { width: 74, align: 'right' })
    y += 26
  }

  // ── Grand total ───────────────────────────────────────────────────────────────
  if (y > bodyBottom - 80) { doc.addPage(); y = MARGIN }
  y += 8
  const boxH = grandExpenses > 0 ? 76 : 62
  doc.rect(MARGIN, y, COL_W, boxH).fillColor('#111827').fill()

  doc.font(fontReg).fontSize(7.5).fillColor('white')
    .text('GROSS RENT COLLECTED', MARGIN + 10, y + 10, { width: 150 })
  doc.font(fontBold).fontSize(11).fillColor('white')
    .text(gbp(grandRent), MARGIN + 10, y + 19, { width: 150 })

  doc.font(fontReg).fontSize(7.5).fillColor('rgba(255,255,255,0.5)')
    .text('MANAGEMENT FEES', MARGIN + 175, y + 10, { width: 130 })
  doc.font(fontBold).fontSize(11).fillColor('#FCA5A5')
    .text(`−${gbp(grandFee)}`, MARGIN + 175, y + 19, { width: 130 })

  if (grandExpenses > 0) {
    doc.font(fontReg).fontSize(7.5).fillColor('rgba(255,255,255,0.5)')
      .text('EXPENSES RECHARGED', MARGIN + 175, y + 36, { width: 130 })
    doc.font(fontBold).fontSize(11).fillColor('#FCA5A5')
      .text(`−${gbp(grandExpenses)}`, MARGIN + 175, y + 45, { width: 130 })
  }

  const netY = grandExpenses > 0 ? y + 58 : y + 44
  doc.strokeColor('rgba(255,255,255,0.15)').lineWidth(0.5)
    .moveTo(MARGIN + 10, netY - 6).lineTo(MARGIN + COL_W - 10, netY - 6).stroke()
  doc.font(fontBold).fontSize(10).fillColor('white')
    .text('NET AMOUNT DUE TO YOU', MARGIN + 10, netY, { width: 200 })
  doc.font(fontBold).fontSize(16).fillColor('#6EE7B7')
    .text(gbp(grandNet), MARGIN + COL_W - 110, y + (grandExpenses > 0 ? 26 : 20), { width: 104, align: 'right' })

  y += boxH + 20

  // ── Sign-off ──────────────────────────────────────────────────────────────────
  if (y > bodyBottom - 80) { doc.addPage(); y = MARGIN + 40 }
  doc.font(fontReg).fontSize(9).fillColor(GREY)
    .text('Funds will be transferred to your nominated bank account within 3 working days of this statement date.', MARGIN, y, { width: COL_W, lineGap: 2 })
  y = doc.y + 12

  y = drawPDFSignOff(doc, y, {
    name: [adminPerson.first_name, adminPerson.last_name].filter(Boolean).join(' ') || 'Harry Buchanan',
    jobTitle: (adminPerson as any).job_title || 'Lettings Manager',
  }, penImg, fontReg, fontBold)

  // ── Footer on every page ──────────────────────────────────────────────────────
  const range = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    drawPDFFooter(doc, footerImg, biz, fontReg)
  }

  doc.end()

  const pdf = await new Promise<Buffer>(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })

  const filename = `capital-rooms-statement-${landlordName.replace(/\s+/g, '-').toLowerCase()}-${month}.pdf`
  return new NextResponse(pdf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(`${filename}`, 'attachment'),
      'Content-Length':      String(pdf.byteLength),
    },
  })
}

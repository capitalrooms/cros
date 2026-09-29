/**
 * POST /api/admin/reports/export-pdf
 *
 * Generates a Capital Rooms–branded PDF for:
 *   - type=landlord_income  → 12-month income & deductions summary per landlord
 *   - type=tax_year         → Tax year summary (reuses tax-year report data)
 *
 * Body: { type, from, to, landlord_name?, landlord_id? }
 *
 * Returns: PDF binary (application/pdf)
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function monthLabel(ym: string) {
  return new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function dateLabel(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Build PDF using pdfLetterhead ─────────────────────────────────────────────

async function buildPDF(data: any, type: string, from: string, to: string): Promise<Buffer> {
  const [assets, biz] = await Promise.all([
    Promise.resolve(loadPDFLetterheadAssets()),
    fetchPDFBizSettings(),
  ])
  const { logoImg, footerImg, fontReg, fontBold } = assets

  const PDFDocument = (await import('pdfkit')).default
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  const title = type === 'tax_year' ? 'Tax Year Income Summary' : 'Landlord Income Analysis'

  // ── Page 1 header ─────────────────────────────────────────────────────────
  drawPDFLogo(doc, logoImg)

  doc.font(fontBold).fontSize(16).fillColor(BLACK).text(title, MARGIN, MARGIN, { width: COL_W, align: 'right' })
  doc.font(fontReg).fontSize(9).fillColor(GREY)
    .text(`${dateLabel(from)} – ${dateLabel(to)}`, MARGIN, MARGIN + 20, { width: COL_W, align: 'right' })

  let y = Math.max(MARGIN + LOGO_H + 20, MARGIN + 40)
  doc.font(fontReg).fontSize(9).fillColor(GREY)
    .text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), MARGIN, y)
  y += 18

  // Re: line
  doc.save().font(fontReg).fontSize(9).fillColor(BLACK)
    .text('Re:  ', MARGIN, y, { continued: true })
    .font(fontBold).text(`${title} — ${dateLabel(from)} to ${dateLabel(to)}`).restore()
  y = drawPDFLetterRule(doc, y + 16)

  // Disclaimer banner
  doc.rect(MARGIN, y, COL_W, 22).fillColor('#FEF9C3').fill()
  doc.strokeColor('#FDE68A').lineWidth(0.5).rect(MARGIN, y, COL_W, 22).stroke()
  doc.font(fontReg).fontSize(8).fillColor('#713F12')
    .text('For informational purposes only. This is not a certified tax return. Please consult your accountant.', MARGIN + 8, y + 7)
  y += 30

  const bodyBottom = PAGE_H - FOOTER_BAND_H - 30
  const landlords = data.landlords || (data.landlord ? [data.landlord] : [])

  for (const landlord of landlords) {
    if (y > bodyBottom - 60) { doc.addPage(); y = MARGIN }

    doc.font(fontBold).fontSize(12).fillColor(BLACK).text(landlord.landlord_name || landlord.name, MARGIN, y)
    y += 14
    if (landlord.email) {
      doc.font(fontReg).fontSize(8.5).fillColor(GREY).text(landlord.email, MARGIN, y); y += 12
    }

    // Summary tiles
    const tiles = [
      { label: 'Gross Rent',      value: gbp(landlord.rent || 0),            dark: false },
      { label: 'Mgmt Fees',       value: gbp(landlord.management_fees || 0), dark: false },
      { label: 'Letting Fees',    value: gbp(landlord.letting_fees || 0),    dark: false },
      { label: 'Expenses',        value: gbp(landlord.expenses || 0),        dark: false },
      { label: 'Net to Landlord', value: gbp(landlord.net || 0),             dark: true  },
    ]
    const tileW = Math.floor(COL_W / 5) - 2
    const tileH = 38
    tiles.forEach((tile, i) => {
      const x = MARGIN + i * (tileW + 2)
      doc.rect(x, y, tileW, tileH).fillColor(tile.dark ? '#F0FDF4' : '#F9FAFB').fill()
      doc.strokeColor(tile.dark ? '#BBF7D0' : '#E5E7EB').lineWidth(0.5).rect(x, y, tileW, tileH).stroke()
      doc.font(fontReg).fontSize(7).fillColor(GREY).text(tile.label, x + 4, y + 5, { width: tileW - 8 })
      doc.font(fontBold).fontSize(9.5).fillColor(tile.dark ? '#166534' : BLACK)
        .text(tile.value, x + 4, y + 16, { width: tileW - 8 })
    })
    y += tileH + 12

    // Per-property
    for (const prop of (landlord.properties || [])) {
      if (y > bodyBottom - 60) { doc.addPage(); y = MARGIN }

      doc.font(fontBold).fontSize(9.5).fillColor('#374151').text(prop.property_name, MARGIN, y); y += 12

      const cols = [
        { label: 'Month',       x: MARGIN,       w: 60  },
        { label: 'Rent',        x: MARGIN + 62,  w: 78  },
        { label: 'Mgmt Fee',    x: MARGIN + 142, w: 78  },
        { label: 'Letting Fee', x: MARGIN + 222, w: 78  },
        { label: 'Expenses',    x: MARGIN + 302, w: 78  },
        { label: 'Net',         x: MARGIN + 382, w: COL_W - 382 },
      ]
      const hy = y
      doc.rect(MARGIN, hy, COL_W, 14).fillColor('#F3F4F6').fill()
      cols.forEach(c => {
        doc.font(fontBold).fontSize(7.5).fillColor('#4B5563').text(c.label, c.x + 2, hy + 4, { width: c.w - 4 })
      })
      y = hy + 14

      let bg = false
      for (const m of (prop.months || [])) {
        if (y > bodyBottom - 14) { doc.addPage(); y = MARGIN }
        if (bg) doc.rect(MARGIN, y, COL_W, 13).fillColor('#F9FAFB').fill()
        bg = !bg
        const net = Number(m.rent || 0) - Number(m.mgmt || 0) - Number(m.letting || 0) - Number(m.expenses || 0)
        const vals = [monthLabel(m.month), gbp(m.rent || 0), gbp(m.mgmt || 0), gbp(m.letting || 0), gbp(m.expenses || 0), gbp(net)]
        cols.forEach((c, i) => {
          doc.font(fontReg).fontSize(7.5).fillColor(BLACK).text(vals[i], c.x + 2, y + 3, { width: c.w - 4 })
        })
        y += 13
      }

      if (y > bodyBottom - 15) { doc.addPage(); y = MARGIN }
      const ty = y
      doc.rect(MARGIN, ty, COL_W, 14).fillColor('#E5E7EB').fill()
      const propNet = Number(prop.rent || 0) - Number(prop.management_fees || 0) - Number(prop.letting_fees || 0) - Number(prop.expenses || 0)
      const totVals = ['Total', gbp(prop.rent || 0), gbp(prop.management_fees || 0), gbp(prop.letting_fees || 0), gbp(prop.expenses || 0), gbp(propNet)]
      cols.forEach((c, i) => {
        doc.font(fontBold).fontSize(7.5).fillColor(BLACK).text(totVals[i], c.x + 2, ty + 4, { width: c.w - 4 })
      })
      y = ty + 20
    }

    y += 12
  }

  // ── Footer on each page ───────────────────────────────────────────────────
  const pages = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i)
    drawPDFFooter(doc, footerImg, biz, fontReg)
  }

  doc.end()

  return new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await supabase
    .from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { type, from, to, landlord_name } = await req.json()
  if (!type || !from || !to) return NextResponse.json({ error: 'type, from, to required' }, { status: 400 })

  // Fetch report data from the relevant internal route
  const baseUrl = req.nextUrl.origin
  let reportData: any

  if (type === 'landlord_income') {
    const params = new URLSearchParams({ from, to, search: landlord_name || '' })
    const res = await fetch(`${baseUrl}/api/admin/reports/landlord-income?${params}`, {
      headers: { cookie: req.headers.get('cookie') || '' },
    })
    reportData = await res.json()
  } else if (type === 'tax_year') {
    const params = new URLSearchParams({ from, to, search: landlord_name || '' })
    const res = await fetch(`${baseUrl}/api/admin/reports/tax-year?${params}`, {
      headers: { cookie: req.headers.get('cookie') || '' },
    })
    reportData = await res.json()
    // Normalise tax-year response to match landlord_income shape
    if (reportData && !reportData.landlords) {
      reportData = { landlords: reportData.landlord ? [{ ...reportData.landlord, ...reportData }] : [] }
    }
  } else {
    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
  }

  const pdf = await buildPDF(reportData, type, from, to)

  const filename = `capital-rooms-${type.replace('_', '-')}-${from.slice(0, 7)}-to-${to.slice(0, 7)}.pdf`

  return new NextResponse(pdf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(`${filename}`, 'attachment'),
      'Content-Length':      String(pdf.byteLength),
    },
  })
}

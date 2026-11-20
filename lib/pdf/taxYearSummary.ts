// The tax-year income summary PDF (19 Nov 2026). Shares the approved letterhead with every CROS letter: the logo top-right,
// the date and Re: line, the rule, and the dark footer band from lib/pdfLetterhead. Only the content area is laid out here.
// The figures come from /api/admin/reports/tax-year, one row per landlord statement, dated within the tax year.
import {
  PAGE_W, PAGE_H, MARGIN, COL_W, FOOTER_BAND_H, LOGO_H, BLACK, GREY,
  drawPDFLogo, drawPDFFooter, drawPDFLetterRule,
  type PDFLetterheadAssets, type PDFBizSettings,
} from '@/lib/pdfLetterhead'
import { PDF } from '@/lib/pdf/palette'

// a suppressed total (coverage not complete) is a dash, never a zero
const money = (n: number | null | undefined) => n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string | null | undefined) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const range = (a: string | null | undefined, b: string | null | undefined) => (a && b ? `${day(a)} – ${day(b)}` : '—')

export interface TaxYearStatement { reference: string | null; statement_date: string | null; period_start: string | null; period_end: string | null; rent: number; agency_fees: number; expenses: number; net: number; entries: number }
export interface TaxYearProperty { property_name: string; property_address: string | null; gross_rent: number | null; management_fees: number | null; expenses: number | null; net_income: number | null; statements: TaxYearStatement[]; outside_year: TaxYearStatement[] }
export interface TaxYearReport { landlord_name: string; period_from: string; period_to: string; gross_rent: number | null; management_fees: number | null; expenses: number | null; net_income: number | null; properties: TaxYearProperty[]; reconciles: boolean; coverage: 'full' | 'partial' | 'none'; coverage_message: string | null; reliable_from: string; basis: string }

export async function buildTaxYearPDF(d: TaxYearReport, assets: PDFLetterheadAssets, biz: PDFBizSettings): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const { fontReg, fontBold, logoImg, footerImg } = assets
  const bodyBottom = PAGE_H - FOOTER_BAND_H - 36
  const inYearCount = d.properties.reduce((t, p) => t + p.statements.length, 0)
  const outsideCount = d.properties.reduce((t, p) => t + p.outside_year.length, 0)
  const notCovered = d.coverage !== 'full'

  // ── Page 1: the approved letter header ─────────────────────────────────────────────────────────────────────────
  drawPDFLogo(doc, logoImg)
  let y = Math.max(MARGIN + LOGO_H + 20, MARGIN + 40)
  doc.font(fontReg).fontSize(9).fillColor(GREY)
    .text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), MARGIN, y)
  y += 28
  doc.save().font(fontReg).fontSize(9).fillColor(BLACK)
    .text('Re:  ', MARGIN, y, { continued: true })
    .font(fontBold).text(`Tax year income summary — ${day(d.period_from)} to ${day(d.period_to)}`).restore()
  y = drawPDFLetterRule(doc, y + 24)

  // ── Summary: landlord, then the four figures as an executive summary (no boxes) ─────────────────────────────────
  y += 14
  doc.font(fontReg).fontSize(7.5).fillColor(PDF.muted).text('TAX YEAR 2025/26  ·  LANDLORD', MARGIN, y, { characterSpacing: 0.8 })
  y += 14
  doc.font(fontBold).fontSize(18).fillColor(PDF.ink).text(d.landlord_name, MARGIN, y, { width: COL_W })
  y = doc.y + 6
  doc.font(fontReg).fontSize(9).fillColor(PDF.muted)
    .text(`${day(d.period_from)} to ${day(d.period_to)}  ·  ${d.properties.length} ${d.properties.length === 1 ? 'property' : 'properties'}  ·  ${inYearCount} ${inYearCount === 1 ? 'statement' : 'statements'} in the year`, MARGIN, y, { width: COL_W })
  y = doc.y + 22

  const figures: [string, string | null, string][] = [
    ['GROSS RENT', money(d.gross_rent), PDF.ink],
    ['AGENCY FEES', money(d.management_fees), PDF.ink],
    ['EXPENSES', money(d.expenses), PDF.ink],
    ['NET TO LANDLORD', money(d.net_income), PDF.forest],
  ]
  const colW = COL_W / 4
  if (notCovered) {
    doc.font(fontBold).fontSize(9).fillColor(PDF.alert).text(d.coverage_message ?? 'CROS does not hold a complete record for this period.', MARGIN, y, { width: COL_W })
    y = doc.y + 12
  }
  doc.moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).strokeColor(PDF.line).lineWidth(0.5).stroke()
  figures.forEach(([label, value, colour], i) => {
    const x = MARGIN + i * colW
    doc.font(fontReg).fontSize(7.5).fillColor(PDF.muted).text(label, x, y + 12, { width: colW - 10, characterSpacing: 0.6 })
    doc.font(fontBold).fontSize(17).fillColor(colour).text(value, x, y + 26, { width: colW - 10 })
  })
  y += 66
  if (notCovered) y += 0
  doc.moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).strokeColor(PDF.line).lineWidth(0.5).stroke()
  y += 10
  doc.font(fontReg).fontSize(8).fillColor(PDF.muted)
    .text(d.reconciles
      ? 'Every book entry for this landlord is included in one of the statements listed below.'
      : 'Warning: some book entries are not in a statement listed below. Check before using these figures.',
    MARGIN, y, { width: COL_W })
  y = doc.y + 30

  // ── Each property: its own section, with a heading, its statements and a total ───────────────────────────────────
  const cols = [
    { key: 'ref',    label: 'Statement',  x: MARGIN,       w: 120, align: 'left'  as const },
    { key: 'period', label: 'Period',     x: MARGIN + 124, w: 150, align: 'left'  as const },
    { key: 'rent',   label: 'Rent',       x: MARGIN + 278, w: 62,  align: 'right' as const },
    { key: 'fees',   label: 'Agency fees', x: MARGIN + 344, w: 66,  align: 'right' as const },
    { key: 'exp',    label: 'Expenses',   x: MARGIN + 414, w: 60,  align: 'right' as const },
    { key: 'net',    label: 'Net',        x: MARGIN + 478, w: COL_W - 478, align: 'right' as const },
  ]
  const ensure = (need: number) => { if (y + need > bodyBottom) { doc.addPage(); y = MARGIN + 10 } }

  for (const p of d.properties) {
    ensure(120)
    doc.font(fontBold).fontSize(12.5).fillColor(PDF.ink).text(p.property_name, MARGIN, y, { width: COL_W })
    y = doc.y + 2
    if (p.property_address && p.property_address !== p.property_name) {
      doc.font(fontReg).fontSize(8.5).fillColor(PDF.muted).text(p.property_address, MARGIN, y, { width: COL_W })
      y = doc.y
    }
    y += 12

    // column headings: small, muted, one hairline beneath — no fills
    doc.font(fontReg).fontSize(7).fillColor(PDF.muted)
    cols.forEach(c => doc.text(c.label.toUpperCase(), c.x, y, { width: c.w, align: c.align, characterSpacing: 0.5 }))
    y += 14
    doc.moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).strokeColor(PDF.line).lineWidth(0.5).stroke()
    y += 6

    const rowFor = (s: TaxYearStatement) => [s.reference ?? 'Expenses', s.reference ? range(s.period_start, s.period_end) : day(s.statement_date), money(s.rent), money(s.agency_fees), money(s.expenses), money(s.net)]
    for (const s of p.statements) {
      ensure(22)
      const v = rowFor(s)
      doc.font(fontReg).fontSize(8.5).fillColor(PDF.ink)
      cols.forEach((c, i) => {
        const text = i === 0 && s.reference ? `${v[0]}` : v[i]
        doc.text(text, c.x, y, { width: c.w, align: c.align })
      })
      // the statement date sits beneath the reference, in muted type, so every line can be traced
      doc.font(fontReg).fontSize(7).fillColor(PDF.muted).text(day(s.statement_date), cols[0].x, y + 10, { width: cols[0].w })
      y += 24
    }

    // property total, with a hairline above: the sum of the rows above (checked by the route)
    ensure(26)
    doc.moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).strokeColor(PDF.line).lineWidth(0.5).stroke()
    y += 6
    doc.font(fontBold).fontSize(8.5).fillColor(PDF.ink).text('Total for the year', cols[0].x, y, { width: cols[0].w + cols[1].w })
    const tot = [p.gross_rent, p.management_fees, p.expenses, p.net_income]
    ;[cols[2], cols[3], cols[4], cols[5]].forEach((c, i) => doc.font(fontBold).fontSize(8.5).fillColor(i === 3 ? PDF.forest : PDF.ink).text(money(tot[i]), c.x, y, { width: c.w, align: 'right' }))
    y += 26
    if (p.outside_year.length) {
      ensure(18 + p.outside_year.length * 14)
      doc.font(fontReg).fontSize(7.5).fillColor(PDF.muted)
        .text('Not in this tax year (dated after 5 April 2026, so counted next year):', MARGIN, y, { width: COL_W })
      y = doc.y + 4
      for (const s of p.outside_year) {
        doc.font(fontReg).fontSize(7.5).fillColor(PDF.muted)
          .text(`${s.reference ?? '—'}  ·  ${day(s.statement_date)}  ·  rent ${money(s.rent)}  ·  net ${money(s.net)}`, MARGIN, y, { width: COL_W })
        y = doc.y + 2
      }
    }
    y += 30
  }

  // ── Footnote: the disclaimer, plain, above the footer band ─────────────────────────────────────────────────────
  ensure(40)
  doc.font(fontReg).fontSize(7.5).fillColor(PDF.muted)
    .text('For information only. This is not a certified tax return. Please consult your accountant.', MARGIN, y, { width: COL_W })
  if (outsideCount) doc.text(`${outsideCount} statement${outsideCount === 1 ? '' : 's'} dated after the year end ${outsideCount === 1 ? 'is' : 'are'} listed under the property ${outsideCount === 1 ? 'it belongs to' : 'they belong to'}.`, MARGIN, doc.y + 4, { width: COL_W })

  // ── Footer band on every page: the approved one ─────────────────────────────────────────────────────────────────
  const pages = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i)
    drawPDFFooter(doc, footerImg, biz, fontReg)
  }
  doc.end()
  return new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))
}

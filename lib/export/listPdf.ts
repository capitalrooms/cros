// Any list in CROS as a PDF, in the Capital Rooms money-document style (lib/invoices/invoiceDocument): logo top
// right, black accreditation footer, black-header table with zebra rows, a totals row, and "Page X of Y".
// Used by the Export button on every list screen (app/components/ExportButtons + /api/admin/export/pdf).
import {
  loadPDFLetterheadAssets, drawPDFFooter, fetchPDFBizSettings, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H, BLACK, GREY,
} from '@/lib/pdfLetterhead'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

export interface ListColumn { key: string; label: string; align?: 'left' | 'right'; money?: boolean }
export interface ListPdf {
  title: string
  subtitle?: string               // e.g. the filters that produced the list
  columns: ListColumn[]
  rows: Record<string, unknown>[]
  totals?: Record<string, unknown> // a final bold row (e.g. sums of the money columns)
  generatedBy?: string
}

const COL_W = PAGE_W - MARGIN * 2
const gbp = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cell = (c: ListColumn, v: unknown) =>
  v == null || v === '' ? '' : c.money && !isNaN(Number(v)) ? gbp(Number(v)) : String(v)

export async function renderListPdf(d: ListPdf): Promise<Buffer> {
  const assets = loadPDFLetterheadAssets()
  const biz = await fetchPDFBizSettings()
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN }, info: { Title: d.title, Author: biz.company_name } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej) })
  const R = assets.fontReg, B = assets.fontBold
  const logo = assets.logoImg.length ? doc.openImage(assets.logoImg) : null
  const footer = (assets.footerImg.length ? Object.assign(doc.openImage(assets.footerImg), { length: assets.footerImg.length }) : assets.footerImg) as unknown as Buffer
  const bottom = PAGE_H - FOOTER_BAND_H - 30

  // Column widths: each column gets what its widest value needs (header and totals measured bold). If that's more
  // than the page, only the long text columns give way — numbers, dates and references never wrap.
  const size = 7.5
  const need = d.columns.map(c => {
    doc.font(B).fontSize(size)
    let w = Math.max(doc.widthOfString(c.label), d.totals ? doc.widthOfString(cell(c, d.totals[c.key])) : 0)
    doc.font(R).fontSize(size)
    for (const r of d.rows.slice(0, 500)) w = Math.max(w, doc.widthOfString(cell(c, r[c.key])))
    return Math.min(w + 10, 220)
  })
  const widths = [...need]
  const FIRM = 95                                              // columns this narrow are kept whole
  let over = widths.reduce((a, b) => a + b, 0) - COL_W
  if (over > 0) {
    const flexible = widths.map((w, i) => (w > FIRM ? i : -1)).filter(i => i >= 0)
    const flexTotal = flexible.reduce((t, i) => t + widths[i] - FIRM, 0)
    for (const i of flexible) widths[i] -= Math.min(widths[i] - FIRM, over * ((widths[i] - FIRM) / (flexTotal || 1)))
    over = widths.reduce((a, b) => a + b, 0) - COL_W
    if (over > 0) { const k = COL_W / (COL_W + over); for (let i = 0; i < widths.length; i++) widths[i] *= k }   // very many columns
  } else if (over < 0) {
    const widest = widths.indexOf(Math.max(...widths)); widths[widest] -= over                          // spare room to the widest
  }
  const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, b) => a + b, 0))

  const headerRow = (y: number) => {
    doc.save().rect(MARGIN, y, COL_W, 16).fill(BLACK).restore()
    d.columns.forEach((c, i) => doc.font(B).fontSize(size).fillColor('#ffffff')
      .text(c.label, xs[i] + 4, y + 4.5, { width: widths[i] - 8, align: c.align ?? (c.money ? 'right' : 'left'), lineBreak: false, ellipsis: true }))
    return y + 16
  }
  const newPage = (first: boolean) => {
    if (!first) doc.addPage()
    if (logo) doc.image(logo as never, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
    drawPDFFooter(doc, footer, biz, R)
    let y = MARGIN + 2
    if (first) {
      doc.font(B).fontSize(18).fillColor(BLACK).text(d.title, MARGIN, y, { width: COL_W - LOGO_W - 20 })
      y = doc.y + 2
      const meta = [d.subtitle, `${d.rows.length} ${d.rows.length === 1 ? 'row' : 'rows'} · produced ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}${d.generatedBy ? ` by ${d.generatedBy}` : ''}`].filter(Boolean)
      for (const m of meta) { doc.font(R).fontSize(9).fillColor(GREY).text(m!, MARGIN, y, { width: COL_W - LOGO_W - 20 }); y = doc.y + 1 }
    } else {
      doc.font(B).fontSize(10).fillColor(BLACK).text(`${d.title} (continued)`, MARGIN, y, { width: COL_W - LOGO_W - 20 })
      y = doc.y
    }
    return headerRow(Math.max(y + 14, MARGIN + LOGO_H + 12))
  }

  let y = newPage(true)
  const drawRow = (r: Record<string, unknown>, zebra: boolean, bold: boolean) => {
    doc.font(bold ? B : R).fontSize(size)
    const h = Math.max(...d.columns.map((c, i) => doc.heightOfString(cell(c, r[c.key]) || ' ', { width: widths[i] - 8 }))) + 7
    if (y + h > bottom) y = newPage(false)
    if (bold) doc.save().rect(MARGIN, y, COL_W, h).fill('#e8e8e8').restore()
    else if (zebra) doc.save().rect(MARGIN, y, COL_W, h).fill('#f4f4f4').restore()
    d.columns.forEach((c, i) => doc.font(bold ? B : R).fontSize(size).fillColor(BLACK)
      .text(cell(c, r[c.key]), xs[i] + 4, y + 3.5, { width: widths[i] - 8, align: c.align ?? (c.money ? 'right' : 'left') }))
    y += h
  }
  d.rows.forEach((r, i) => drawRow(r, i % 2 === 1, false))
  if (d.totals) drawRow(d.totals, false, true)
  if (!d.rows.length) doc.font(R).fontSize(9).fillColor(GREY).text('Nothing to show for these filters.', MARGIN, y + 8)

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.font(R).fontSize(7.5).fillColor(GREY).text(`Page ${i + 1} of ${range.count}`, MARGIN, PAGE_H - FOOTER_BAND_H - 16, { width: COL_W, align: 'right', lineBreak: false })
  }
  doc.end()
  return done
}

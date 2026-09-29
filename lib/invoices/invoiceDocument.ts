// The Capital Rooms money-document layout (the standard, agreed Sep 2026): letterhead with logo top right
// and black accreditation footer; recipient top left; big title with a reference/date panel; black-header
// table with zebra rows; black total box; grey "How to pay" box. Used by the landlord invoice and the
// check-in balance demand — every money document should render through here so they all match.
import {
  loadPDFLetterheadAssets, drawPDFFooter, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H, BLACK, GREY,
  type PDFBizSettings,
} from '@/lib/pdfLetterhead'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

export interface DocLine {
  description: string
  detail?: string
  qty?: number
  unitPrice?: number
  amount: number
  /** 'subtotal' = bold ruled line; 'less' = a deduction shown in brackets */
  kind?: 'item' | 'subtotal' | 'less'
}

export interface InvoiceStyleDocument {
  pdfTitle: string
  docTitle: string                    // "Invoice", "Check-in balance"
  subtitle?: string
  recipientName: string
  addressLines: string[]
  propertyLine?: string               // bold line under the title
  meta: [string, string][]            // right-hand panel
  columns: 'qty' | 'amount'           // qty = description/qty/unit/amount; amount = description/amount
  lines: DocLine[]
  totalLabel: string
  total: number
  pay: { title?: string; rows: [string, string][]; note?: string }
  continuedRef: string                // shown on continuation pages
  biz: PDFBizSettings
}

const COL_W = PAGE_W - MARGIN * 2
const BOTTOM = PAGE_H - FOOTER_BAND_H - 16
export const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function renderInvoiceStyleDocument(d: InvoiceStyleDocument): Promise<Buffer> {
  const assets = loadPDFLetterheadAssets()
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN }, info: { Title: d.pdfTitle, Author: d.biz.company_name } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej) })
  const R = assets.fontReg, B = assets.fontBold
  const logo = assets.logoImg.length ? doc.openImage(assets.logoImg) : null
  const footer = (assets.footerImg.length ? Object.assign(doc.openImage(assets.footerImg), { length: assets.footerImg.length }) : assets.footerImg) as unknown as Buffer
  const decorate = () => {
    if (logo) doc.image(logo as never, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
    drawPDFFooter(doc, footer, d.biz, R)
  }
  decorate()

  // ── Recipient (parallel to the logo) ─────────────────────────────────
  let y = MARGIN + 2
  doc.font(B).fontSize(9.5).fillColor(BLACK).text(d.recipientName, MARGIN, y, { width: COL_W - LOGO_W - 20 })
  y = doc.y + 1
  for (const line of d.addressLines.filter(Boolean)) {
    doc.font(R).fontSize(9).fillColor(BLACK).text(line, MARGIN, y, { width: COL_W - LOGO_W - 20 })
    y = doc.y
  }
  y = Math.max(y + 24, MARGIN + LOGO_H + 24)

  // ── Title + meta ──────────────────────────────────────────────────────
  doc.font(B).fontSize(20).fillColor(BLACK).text(d.docTitle, MARGIN, y, { width: COL_W * 0.55 })
  let ty = doc.y + 2
  if (d.subtitle) { doc.font(R).fontSize(9.5).fillColor(GREY).text(d.subtitle, MARGIN, ty, { width: COL_W * 0.55 }); ty = doc.y + 2 }
  if (d.propertyLine) { doc.font(B).fontSize(9.5).fillColor(BLACK).text(d.propertyLine, MARGIN, ty, { width: COL_W * 0.55 }); ty = doc.y }

  const metaX = MARGIN + COL_W * 0.6, metaW = COL_W * 0.4
  d.meta.forEach(([k, v], i) => {
    doc.font(R).fontSize(8.5).fillColor(GREY).text(k, metaX, y + 4 + i * 16, { width: metaW * 0.45 })
    doc.font(B).fontSize(8.5).fillColor(BLACK).text(v, metaX + metaW * 0.45, y + 4 + i * 16, { width: metaW * 0.55, align: 'right' })
  })
  y = Math.max(ty, y + 4 + d.meta.length * 16) + 18

  // ── Table ─────────────────────────────────────────────────────────────
  const qtyCols = d.columns === 'qty'
  const descW = qtyCols ? COL_W * 0.58 : COL_W * 0.7
  const cQty = MARGIN + COL_W * 0.62, cUnit = MARGIN + COL_W * 0.72, cAmt = MARGIN + COL_W * 0.86
  const wQty = COL_W * 0.1, wUnit = COL_W * 0.14, wAmt = COL_W * 0.14
  const tableHeader = () => {
    doc.save().rect(MARGIN, y, COL_W, 22).fill('#1a1a1a').restore()
    doc.font(B).fontSize(8.5).fillColor('#ffffff')
    doc.text('DESCRIPTION', MARGIN + 10, y + 7, { characterSpacing: 0.4 })
    if (qtyCols) {
      doc.text('QTY', cQty, y + 7, { width: wQty, align: 'center', characterSpacing: 0.4 })
      doc.text('UNIT PRICE', cUnit, y + 7, { width: wUnit, align: 'right', characterSpacing: 0.4 })
    }
    doc.text('AMOUNT', cAmt, y + 7, { width: wAmt - 10, align: 'right', characterSpacing: 0.4 })
    y += 22
  }
  const newPage = () => { doc.addPage(); decorate(); y = MARGIN + LOGO_H + 20 }
  tableHeader()

  const payH = Math.max(d.pay.rows.length * 14 + 44, 100)
  let zebra = 0
  d.lines.forEach((it, i) => {
    const sub = it.kind === 'subtotal', less = it.kind === 'less'
    doc.font(B).fontSize(9)
    const hDesc = doc.heightOfString(it.description, { width: descW })
    doc.font(R).fontSize(8.5)
    const hDetail = it.detail ? doc.heightOfString(it.detail, { width: descW }) + 2 : 0
    const h = Math.max(hDesc + hDetail, 12) + 14
    // the last line carries the total + payment box with it, so they never sit alone on a page
    const need = i === d.lines.length - 1 ? h + 64 + payH : h
    if (y + need > BOTTOM) {
      newPage()
      doc.font(R).fontSize(8.5).fillColor(GREY).text(`${d.docTitle} ${d.continuedRef} — continued`, MARGIN, y - 14)
      tableHeader()
    }
    if (sub) doc.save().strokeColor('#1a1a1a').lineWidth(0.8).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore()
    else if (zebra++ % 2 === 1) doc.save().rect(MARGIN, y, COL_W, h).fill('#f6f6f6').restore()
    doc.font(sub ? B : less ? R : B).fontSize(9).fillColor(less ? GREY : BLACK).text(it.description, MARGIN + 10, y + 7, { width: descW })
    if (it.detail) doc.font(R).fontSize(8.5).fillColor(GREY).text(it.detail, MARGIN + 10, y + 7 + hDesc + 2, { width: descW })
    doc.font(sub ? B : R).fontSize(9).fillColor(less ? GREY : BLACK)
    if (qtyCols && !sub && !less) {
      doc.text(String(it.qty ?? 1), cQty, y + 7, { width: wQty, align: 'center' })
      doc.text(money(it.unitPrice ?? it.amount), cUnit, y + 7, { width: wUnit, align: 'right' })
    }
    doc.text(less ? `(${money(Math.abs(it.amount))})` : money(it.amount), cAmt, y + 7, { width: wAmt - 10, align: 'right' })
    y += h
  })
  doc.save().strokeColor('#d0d0d0').lineWidth(0.5).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore()

  // ── Total ─────────────────────────────────────────────────────────────
  if (y + 12 + 30 > BOTTOM) newPage()
  y += 12
  const totW = COL_W * 0.42, totX = PAGE_W - MARGIN - totW
  doc.save().rect(totX, y, totW, 30).fill('#1a1a1a').restore()
  doc.font(B).fontSize(10).fillColor('#ffffff').text(d.totalLabel, totX + 12, y + 10)
  doc.font(B).fontSize(12).fillColor('#ffffff').text(money(d.total), totX, y + 8.5, { width: totW - 12, align: 'right' })
  y += 52

  // ── How to pay ────────────────────────────────────────────────────────
  if (y + payH > BOTTOM) newPage()
  doc.save().roundedRect(MARGIN, y, COL_W, payH, 4).fill('#f3f3f3').restore()
  doc.font(B).fontSize(9.5).fillColor(BLACK).text(d.pay.title ?? 'How to pay', MARGIN + 14, y + 12)
  d.pay.rows.forEach(([k, v], i) => {
    doc.font(R).fontSize(9).fillColor(GREY).text(k, MARGIN + 14, y + 32 + i * 14, { width: 110 })
    doc.font(B).fontSize(9).fillColor(BLACK).text(v, MARGIN + 124, y + 32 + i * 14, { width: COL_W * 0.52 - 124 })
  })
  if (d.pay.note) {
    doc.font(R).fontSize(8.5).fillColor(GREY).text(d.pay.note, MARGIN + COL_W * 0.52, y + 32, { width: COL_W * 0.45, lineGap: 2 })
  }

  doc.end()
  return done
}

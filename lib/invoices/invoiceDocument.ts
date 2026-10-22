// The Capital Rooms money-document layout — invoices, the check-in balance, the annual summary. 22 Oct 2026: redrawn in
// the landlord statement's look (lib/statements/modernPdf; Harry: "the statement style invoice we use for landlord …
// would look the best"): letterhead, a small label line, the subject big, chips, one big dark figure, a clean table,
// a "How to pay" tile. Every money document renders through here so they all match.
import {
  loadPDFLetterheadAssets, drawPDFFooter, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H,
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
  /** small rounded labels under the heading, e.g. "Period October 2026" */
  chips?: string[]
  /** one line beside the big figure, e.g. "Pay by 5 November 2026" */
  heroNote?: string[]
}

const INK = '#141414', MUTED = '#6B6B6B', LINE = '#E4E2DE', TILE = '#F4F3F0'
const COL_W = PAGE_W - MARGIN * 2
const BOTTOM = PAGE_H - FOOTER_BAND_H - 36
export const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function renderInvoiceStyleDocument(d: InvoiceStyleDocument): Promise<Buffer> {
  const assets = loadPDFLetterheadAssets()
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN }, info: { Title: d.pdfTitle, Author: d.biz.company_name } })
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
  const newPage = () => { doc.addPage(); decorate(); y = MARGIN + LOGO_H + 20 }
  decorate()

  // ── Heading: what it is, what it's about ─────────────────────────────
  const headW = COL_W - LOGO_W - 30
  let y = MARGIN + 4
  const ref = d.meta.find(([k]) => /number|reference/i.test(k))?.[1]
  doc.font(B).fontSize(8.5).fillColor(MUTED).text(`${d.docTitle.toUpperCase()}${ref ? `  ·  ${ref}` : ''}`, MARGIN, y, { characterSpacing: 1.2, width: headW })
  y = doc.y + 6
  // a short subtitle ("Management fees — October 2026") is the heading; a long one sits under the document's name
  const big = d.subtitle && d.subtitle.length <= 48 ? d.subtitle : d.docTitle
  doc.font(B).fontSize(22).fillColor(INK).text(big, MARGIN, y, { width: headW })
  y = doc.y + 2
  for (const line of [big === d.subtitle ? '' : d.subtitle, d.propertyLine].filter(Boolean) as string[]) {
    doc.font(R).fontSize(11).fillColor(INK).text(line, MARGIN, y, { width: headW }); y = doc.y + 2
  }
  y += 6
  let cx = MARGIN
  for (const c of d.chips ?? []) {
    doc.font(B).fontSize(8)
    const w = doc.widthOfString(c) + 14
    if (cx + w > MARGIN + headW) { cx = MARGIN; y += 22 }
    doc.save().roundedRect(cx, y, w, 16, 8).fill(TILE).restore()
    doc.font(B).fontSize(8).fillColor(INK).text(c, cx + 7, y + 4.5, { lineBreak: false })
    cx += w + 6
  }
  if (d.chips?.length) y += 24
  y += 4
  // who it's to
  doc.font(B).fontSize(9).fillColor(INK).text(d.recipientName, MARGIN, y, { width: 260 })
  doc.font(R).fontSize(9).fillColor(MUTED).text(d.addressLines.filter(Boolean).join('\n'), MARGIN, doc.y + 1, { width: 260, lineGap: 1 })
  y = doc.y
  // meta, right, under the logo
  const metaX = PAGE_W - MARGIN - 200
  let my = MARGIN + LOGO_H + 16
  for (const [k, v] of d.meta) {
    doc.font(R).fontSize(8.5).fillColor(MUTED).text(k, metaX, my, { width: 90 })
    doc.font(B).fontSize(8.5).fillColor(INK).text(v, metaX + 90, my, { width: 110, align: 'right' })
    my += 13
  }
  y = Math.max(y, my) + 16

  // ── Hero: the one figure ─────────────────────────────────────────────
  const heroH = 74
  doc.save().roundedRect(MARGIN, y, COL_W, heroH, 10).fill(INK).restore()
  doc.font(R).fontSize(9.5).fillColor('#BDBDBD').text(d.totalLabel, MARGIN + 20, y + 15)
  doc.font(B).fontSize(28).fillColor('#FFFFFF').text(money(d.total), MARGIN + 20, y + 29)
  const due = d.meta.find(([k]) => /due|pay by/i.test(k))?.[1]
  const note = d.heroNote ?? [due ? `Pay by ${due}` : '', ref ? `Reference ${ref}` : ''].filter(Boolean)
  doc.font(R).fontSize(9).fillColor('#E6E6E6').text(note.join('\n'), MARGIN + COL_W - 240, y + 22, { width: 220, align: 'right', lineGap: 3 })
  y += heroH + 22

  // ── Table ─────────────────────────────────────────────────────────────
  const qtyCols = d.columns === 'qty'
  const cols: { label: string; w: number; align: 'left' | 'right' }[] = qtyCols
    ? [{ label: 'Description', w: COL_W - 220, align: 'left' }, { label: 'Qty', w: 50, align: 'right' }, { label: 'Unit price', w: 82, align: 'right' }, { label: 'Amount', w: 88, align: 'right' }]
    : [{ label: 'Description', w: COL_W - 110, align: 'left' }, { label: 'Amount', w: 110, align: 'right' }]
  const xs = cols.map((_, i) => MARGIN + cols.slice(0, i).reduce((t, c) => t + c.w, 0))
  const head = () => {
    cols.forEach((c, i) => doc.font(B).fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), xs[i] + 6, y, { width: c.w - 12, align: c.align, characterSpacing: 0.6 }))
    y += 14; doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.8).strokeColor(INK).stroke().restore(); y += 6
  }
  head()
  const payH = Math.max(d.pay.rows.length * 14 + 44, 96)
  d.lines.forEach((it, i) => {
    const sub = it.kind === 'subtotal', less = it.kind === 'less'
    doc.font(B).fontSize(9.5)
    const hDesc = doc.heightOfString(it.description, { width: cols[0].w - 12 })
    doc.font(R).fontSize(8.5)
    const hDetail = it.detail ? doc.heightOfString(it.detail, { width: cols[0].w - 12 }) + 2 : 0
    const h = hDesc + hDetail + 10
    // the last line carries the total and the payment tile with it, so they never sit alone on a page
    const need = i === d.lines.length - 1 ? h + 40 + payH : h
    if (y + need > BOTTOM) {
      newPage()
      doc.font(R).fontSize(8.5).fillColor(MUTED).text(`${d.docTitle} ${d.continuedRef} — continued`, MARGIN, y - 14)
      head()
    }
    if (sub) doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.8).strokeColor(INK).stroke().restore()
    doc.font(sub ? B : R).fontSize(9.5).fillColor(less ? MUTED : INK).text(it.description, xs[0] + 6, y + 4, { width: cols[0].w - 12 })
    if (it.detail) doc.font(R).fontSize(8.5).fillColor(MUTED).text(it.detail, xs[0] + 6, y + 4 + hDesc + 2, { width: cols[0].w - 12 })
    doc.font(sub ? B : R).fontSize(9.5).fillColor(less ? MUTED : INK)
    const last = cols.length - 1
    if (qtyCols && !sub && !less) {
      doc.text(String(it.qty ?? 1), xs[1] + 6, y + 4, { width: cols[1].w - 12, align: 'right' })
      doc.text(money(it.unitPrice ?? it.amount), xs[2] + 6, y + 4, { width: cols[2].w - 12, align: 'right' })
    }
    doc.text(less ? `(${money(Math.abs(it.amount))})` : money(it.amount), xs[last] + 6, y + 4, { width: cols[last].w - 12, align: 'right' })
    y += h
    doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.5).strokeColor(LINE).stroke().restore()
  })
  // total row
  if (y + 30 > BOTTOM) newPage()
  doc.font(B).fontSize(10.5).fillColor(INK).text(d.totalLabel, xs[0] + 6, y + 8, { width: cols[0].w - 12 })
  doc.font(B).fontSize(10.5).fillColor(INK).text(money(d.total), MARGIN, y + 8, { width: COL_W - 6, align: 'right' })
  y += 28
  doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.8).strokeColor(INK).stroke().restore()
  y += 18

  // ── How to pay ────────────────────────────────────────────────────────
  if (y + payH > BOTTOM) newPage()
  doc.save().roundedRect(MARGIN, y, COL_W, payH, 8).fill(TILE).restore()
  doc.font(B).fontSize(11).fillColor(INK).text(d.pay.title ?? 'How to pay', MARGIN + 16, y + 13)
  d.pay.rows.forEach(([k, v], i) => {
    doc.font(R).fontSize(9).fillColor(MUTED).text(k, MARGIN + 16, y + 34 + i * 14, { width: 110 })
    // wide enough for an IBAN on one line
    doc.font(B).fontSize(9).fillColor(INK).text(v, MARGIN + 126, y + 34 + i * 14, { width: COL_W * 0.58 - 126, lineBreak: false })
  })
  if (d.pay.note) doc.font(R).fontSize(8.5).fillColor(MUTED).text(d.pay.note, MARGIN + COL_W * 0.6, y + 34, { width: COL_W * 0.37, lineGap: 2 })

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.font(R).fontSize(7.5).fillColor(MUTED).text(`${d.docTitle}${d.continuedRef ? ` ${d.continuedRef}` : ''} · page ${i + 1} of ${range.count}`, MARGIN, PAGE_H - FOOTER_BAND_H - 16, { width: COL_W, align: 'right', lineBreak: false })
  }
  doc.end()
  return done
}

// Capital Rooms Rental Valuation PDF generator — built with pdfkit (zero React dependency).
// Letterhead design: logo top-right, large faint watermark, grey footer band.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

import {
  loadPDFLetterheadAssets,
  PAGE_W as _PW, PAGE_H as _PH, MARGIN as _M, FOOTER_BAND_H as _FBH,
  LOGO_W as _LW, LOGO_H as _LH, GREY_BAND as _GB, BLACK as _BK, GREY as _GR,
  drawPDFFooter, drawPDFSignOff,
  type PDFBizSettings, type PDFSender,
} from '@/lib/pdfLetterhead'
import { ValuationData } from './ValuationDocument'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, sym = '£') { return `${sym}${n.toLocaleString('en-GB')} pcm` }
function fmtCost(n: number, sym = '£') { return `${sym}${n.toLocaleString('en-GB')}` }
function formatDate(iso?: string) {
  return (iso ? new Date(iso) : new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
function typeName(t: string) {
  const m: Record<string, string> = {
    single_let_current:      'Single Let Rental Valuation — Current Condition',
    single_let_improvements: 'Single Let Rental Valuation — With Suggested Improvements',
    hmo_current:             'HMO Rental Valuation — Current Condition',
    hmo_improvements:        'HMO Rental Valuation — With Suggested Improvements',
    // Legacy type support (historical records)
    current_market:     'Current Market Rental Valuation',
    post_refurb:        'Post-Refurbishment Rental Valuation',
    single_let:         'Single Let Rental Valuation',
    investment_analysis:'HMO vs Single Let Investment Analysis',
  }
  return m[t] ?? t
}
function refurbTierLabel(t?: string) {
  return ({
    light:     'Cosmetic Refurbishment',
    selective: 'Selective Refurbishment',
    full:      'Full Renovation',
    extensive: 'Full Renovation',
  }[t ?? ''] ?? '')
}

// ── Colour / size constants — sourced from lib/pdfLetterhead ─────────────────

const PAGE_W     = _PW
const PAGE_H     = _PH
const MARGIN     = _M
const COL_W      = PAGE_W - MARGIN * 2
const BLACK      = _BK
const GREY       = _GR
const LIGHT      = '#f8f8f8'
const BORDER     = '#e0e0e0'
const GREY_BAND  = _GB
const LOGO_W     = _LW
const LOGO_H     = _LH
const FOOTER_BAND_H = _FBH

// ── Drawing utilities ──────────────────────────────────────────────────────────

function drawHRule(doc: PDFKit.PDFDocument, x: number, y: number, w: number, colour = BORDER) {
  doc.save().strokeColor(colour).lineWidth(0.5).moveTo(x, y).lineTo(x + w, y).stroke().restore()
}

function tableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: { text: string; x: number; w: number; align?: 'left' | 'right' }[],
  rowH: number,
  bg?: string,
  bold = false,
  fontReg = 'Helvetica',
  fontBold = 'Helvetica-Bold',
) {
  if (bg) {
    doc.save().fillColor(bg).rect(MARGIN, y, COL_W, rowH).fill().restore()
  }
  doc.save()
    .fillColor(bg === BLACK ? '#fff' : BLACK)
    .font(bold || bg === BLACK ? fontBold : fontReg)
    .fontSize(8)
  for (const col of cols) {
    doc.text(col.text, col.x, y + 5, { width: col.w, align: col.align ?? 'left', lineBreak: false })
  }
  doc.restore()
}

// ── Main generator ─────────────────────────────────────────────────────────────

export async function generateValuationPDF(data: ValuationData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: FOOTER_BAND_H + 20, left: MARGIN, right: MARGIN },
      info: {
        Title: `Capital Rooms Valuation — ${data.propertyAddress}`,
        Author: 'Capital Rooms',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const { logoImg, footerImg, penImg, fontReg, fontBold } = loadPDFLetterheadAssets()

    const sym = data.currency ?? '£'
    const disclaimer = data.disclaimer ??
      'This valuation has been prepared by Capital Rooms based on current market conditions and comparable rental evidence at the time of writing. Figures stated are estimates and subject to change. This document does not constitute a formal valuation report or legal advice. Capital Rooms accepts no liability for decisions made solely on the basis of this document.'

    // ─ HEADER: LOGO TOP-RIGHT ─────────────────────────────────────────────────
    const logoX = PAGE_W - MARGIN - LOGO_W
    doc.image(logoImg, logoX, MARGIN, { width: LOGO_W, height: LOGO_H })

    // ─ RECIPIENT ADDRESS — top-left, parallel to logo ─────────────────────────
    // Reference letterhead: address block starts at same Y as logo, left margin.
    let y = MARGIN

    doc.save().font(fontBold).fontSize(9.5).fillColor(BLACK)
      .text(data.recipientName, MARGIN, y)
      .restore()
    y += 14

    if (data.recipientAddress?.length > 0) {
      doc.save().font(fontReg).fontSize(9).fillColor('#333')
      for (const line of data.recipientAddress) {
        doc.text(line, MARGIN, y)
        y += 13
      }
      doc.restore()
    }

    // Ensure we clear the logo before placing the date
    y = Math.max(y + 20, MARGIN + LOGO_H + 20)

    // ─ DATE ───────────────────────────────────────────────────────────────────
    doc.save().font(fontReg).fontSize(9).fillColor(GREY)
      .text(formatDate(data.letterDate), MARGIN, y)
      .restore()
    y += 28   // generous gap between date and subject heading

    // ─ SUBJECT LINE ───────────────────────────────────────────────────────────

    const subjectLine = `${typeName(data.type)} — ${data.propertyAddress}${data.propertyRef ? ` (Ref: ${data.propertyRef})` : ''}`
    doc.save().font(fontReg).fontSize(9).fillColor(BLACK)
      .text('Re: ', MARGIN, y, { continued: true })
      .font(fontBold)
      .text(subjectLine)
      .restore()
    y += 24

    // Thin rule under Re: line
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 12

    // ─ OPENING PARA ───────────────────────────────────────────────────────────

    function drawPara(text: string) {
      const height = doc.heightOfString(text, { width: COL_W, align: 'justify' })
      doc.save().font(fontReg).fontSize(9.5).fillColor(BLACK)
        .text(text, MARGIN, y, { width: COL_W, align: 'justify', lineGap: 3 })
        .restore()
      y += height + 12
    }

    function sectionHeading(text: string) {
      y += 6
      doc.save().font(fontBold).fontSize(10).fillColor(BLACK)
        .text(text, MARGIN, y)
        .restore()
      y += 16
    }

    drawPara(data.openingParagraph)

    // ─ ROOM PRICING TABLE (Low / High only) ───────────────────────────────────

    const showRooms = (data.type === 'current_market' || data.type === 'post_refurb' || data.type === 'investment_analysis') && data.rooms.length > 0
    const roomHeading = data.type === 'post_refurb' && data.refurbTier
      ? `Room-by-Room Rental Valuation — ${refurbTierLabel(data.refurbTier)}`
      : 'Room-by-Room Rental Valuation'

    function drawRoomTable(rows: ValuationData['rooms']) {
      const ROW_H = 22
      const colRoomW = COL_W * 0.60
      const priceW   = COL_W * 0.20
      const colRoomX = MARGIN
      const col2X    = MARGIN + colRoomW
      const col3X    = col2X + priceW

      // Header row — black band, white text
      tableRow(doc, y,
        [
          { text: 'Room', x: colRoomX, w: colRoomW },
          { text: 'Low', x: col2X, w: priceW, align: 'right' },
          { text: 'High', x: col3X, w: priceW, align: 'right' },
        ],
        ROW_H, BLACK, true, fontReg, fontBold
      )
      y += ROW_H

      let totalLow = 0
      let totalHigh = 0

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const bg = i % 2 === 1 ? LIGHT : undefined
        tableRow(doc, y,
          [
            { text: r.label, x: colRoomX, w: colRoomW },
            { text: fmt(r.low, sym), x: col2X, w: priceW, align: 'right' },
            { text: fmt(r.high, sym), x: col3X, w: priceW, align: 'right' },
          ],
          ROW_H, bg, false, fontReg, fontBold
        )
        if (r.notes) {
          doc.save().font(fontReg).fontSize(7).fillColor('#888')
            .text(r.notes, colRoomX + 4, y + ROW_H - 8, { width: colRoomW - 8, lineBreak: false })
            .restore()
        }
        drawHRule(doc, MARGIN, y + ROW_H, COL_W, '#ececec')
        y += ROW_H
        totalLow  += r.low
        totalHigh += r.high
      }

      // Totals row
      doc.save().fillColor('#f2f2f2').rect(MARGIN, y, COL_W, ROW_H).fill().restore()
      doc.save().font(fontBold).fontSize(8).fillColor(BLACK)
        .text('Combined monthly income', colRoomX + 4, y + 7, { width: colRoomW - 8, lineBreak: false })
        .text(fmt(totalLow, sym),  col2X, y + 7, { width: priceW, align: 'right', lineBreak: false })
        .text(fmt(totalHigh, sym), col3X, y + 7, { width: priceW, align: 'right', lineBreak: false })
        .restore()
      y += ROW_H + 14
    }

    if (showRooms) {
      sectionHeading(roomHeading)
      drawRoomTable(data.rooms)
    }

    // ─ REFURB TABLE ───────────────────────────────────────────────────────────

    if (data.type === 'post_refurb' && data.refurbItems?.length) {
      sectionHeading('Indicative Refurbishment Cost Breakdown')
      const ROW_H = 20
      const catW  = COL_W * 0.22
      const descW = COL_W * 0.56
      const costW = COL_W * 0.22
      const catX  = MARGIN
      const descX = catX + catW
      const costX = descX + descW

      tableRow(doc, y,
        [
          { text: 'Category', x: catX, w: catW },
          { text: 'Works', x: descX, w: descW },
          { text: 'Est. Cost', x: costX, w: costW, align: 'right' },
        ],
        ROW_H, BLACK, true, fontReg, fontBold
      )
      y += ROW_H

      let total = 0
      for (let i = 0; i < data.refurbItems.length; i++) {
        const item = data.refurbItems[i]
        const bg = i % 2 === 1 ? LIGHT : undefined
        tableRow(doc, y,
          [
            { text: item.category, x: catX, w: catW },
            { text: item.description, x: descX, w: descW },
            { text: fmtCost(item.estimatedCost, sym), x: costX, w: costW, align: 'right' },
          ],
          ROW_H, bg, false, fontReg, fontBold
        )
        drawHRule(doc, MARGIN, y + ROW_H, COL_W, '#ececec')
        y += ROW_H
        total += item.estimatedCost
      }

      doc.save().fillColor('#f2f2f2').rect(MARGIN, y, COL_W, ROW_H).fill().restore()
      doc.save().font(fontBold).fontSize(8).fillColor(BLACK)
        .text('Total estimated refurbishment cost', catX + 4, y + 5, { width: catW + descW - 8, lineBreak: false })
        .text(fmtCost(total, sym), costX, y + 5, { width: costW, align: 'right', lineBreak: false })
        .restore()
      y += ROW_H + 12

      if (data.refurbNotes) drawPara(data.refurbNotes)
    }

    // ─ SINGLE LET ─────────────────────────────────────────────────────────────

    if (data.type === 'single_let') {
      sectionHeading('Single Let Rental Estimate')
      const BOX_H = 46
      doc.save().fillColor(LIGHT).rect(MARGIN, y, COL_W, BOX_H).fill()
        .strokeColor(BORDER).lineWidth(0.5).rect(MARGIN, y, COL_W, BOX_H).stroke()
        .restore()
      const rows: [string, number | undefined][] = [
        ['Low estimate', data.singleLetLow],
        ['High estimate', data.singleLetHigh],
      ]
      let ry = y + 8
      for (const [lbl, val] of rows) {
        if (val != null) {
          doc.save().font(fontReg).fontSize(9).fillColor(GREY)
            .text(lbl, MARGIN + 12, ry, { width: COL_W * 0.6, lineBreak: false })
            .font(fontBold).fillColor(BLACK)
            .text(fmt(val, sym), MARGIN + COL_W * 0.6, ry, { width: COL_W * 0.4 - 12, align: 'right', lineBreak: false })
            .restore()
          ry += 16
        }
      }
      y += BOX_H + 12
    }

    // ─ INVESTMENT ANALYSIS ────────────────────────────────────────────────────

    if (data.type === 'investment_analysis') {
      if (data.rooms.length > 0) {
        sectionHeading('HMO Rental Income — Room by Room')
        drawRoomTable(data.rooms)
      }
      sectionHeading('Yield Comparison')
      const yieldRows: [string, string | undefined][] = [
        ['Gross yield — HMO (high scenario)', data.grossYieldHmo != null ? `${data.grossYieldHmo.toFixed(1)}%` : undefined],
        ['Single let estimate (high)', data.singleLetHigh != null ? fmt(data.singleLetHigh, sym) : undefined],
        ['Gross yield — single let', data.grossYieldSingleLet != null ? `${data.grossYieldSingleLet.toFixed(1)}%` : undefined],
      ]
      const validRows = yieldRows.filter(([, v]) => v != null)
      const BOX_H = validRows.length * 18 + 12
      doc.save().fillColor(LIGHT).rect(MARGIN, y, COL_W, BOX_H).fill()
        .strokeColor(BORDER).lineWidth(0.5).rect(MARGIN, y, COL_W, BOX_H).stroke()
        .restore()
      let ry = y + 8
      for (const [lbl, val] of validRows) {
        doc.save().font(fontReg).fontSize(9).fillColor(GREY)
          .text(lbl, MARGIN + 12, ry, { width: COL_W * 0.65, lineBreak: false })
          .font(fontBold).fillColor(BLACK)
          .text(val!, MARGIN + COL_W * 0.65, ry, { width: COL_W * 0.35 - 12, align: 'right', lineBreak: false })
          .restore()
        ry += 18
      }
      y += BOX_H + 12
      if (data.investmentNotes) drawPara(data.investmentNotes)
    }

    // ─ CLOSING ────────────────────────────────────────────────────────────────

    y += 4
    drawPara(data.closingParagraph)

    if (data.preparedBy) {
      const sender: PDFSender = {
        name:        data.preparedBy,
        jobTitle:    data.senderJobTitle,
        directPhone: data.senderDirectPhone,
      }
      y = drawPDFSignOff(doc, y, sender, penImg, fontReg, fontBold)
    }

    // ─ DISCLAIMER ─────────────────────────────────────────────────────────────

    y += 6
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 8
    doc.save().font(fontReg).fontSize(6.5).fillColor('#999')
      .text(disclaimer, MARGIN, y, { width: COL_W, align: 'left', lineGap: 2 })
      .restore()

    // ─ FOOTER BAND — shared component (lib/pdfLetterhead) ────────────────────
    drawPDFFooter(doc, footerImg, data.bizSettings, fontReg)

    doc.end()
  })
}

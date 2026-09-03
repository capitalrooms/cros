// Capital Rooms Rental Valuation PDF generator — built with pdfkit (zero React dependency).
// Letterhead design: logo top-right, large faint watermark, grey footer band.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

import { LOGO_B64, FOOTER_STRIP_B64 } from './letterhead'
import { ValuationData } from './ValuationDocument'

// ── Helpers ────────────────────────────────────────────────────────────────────

function b64ToBuffer(dataUri: string): Buffer {
  const base64 = dataUri.replace(/^data:[^;]+;base64,/, '')
  return Buffer.from(base64, 'base64')
}

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

// ── Colour / size constants ────────────────────────────────────────────────────

const PAGE_W = 595.28   // A4 points
const PAGE_H = 841.89
const MARGIN = 52
const COL_W = PAGE_W - MARGIN * 2

const BLACK     = '#1a1a1a'
const GREY      = '#555555'
const LIGHT     = '#f8f8f8'
const BORDER    = '#e0e0e0'
const GREY_BAND = '#939598'   // footer band colour

// Header logo dimensions — rendered top-right, matching the letterhead
const LOGO_W = 90   // pt — logo is ~square (910×849), so height ≈ same
const LOGO_H = (849 / 910) * LOGO_W

// Footer band
const FOOTER_BAND_H = 58

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
  bold = false
) {
  if (bg) {
    doc.save().fillColor(bg).rect(MARGIN, y, COL_W, rowH).fill().restore()
  }
  doc.save()
    .fillColor(bg === BLACK ? '#fff' : BLACK)
    .font(bold || bg === BLACK ? 'Helvetica-Bold' : 'Helvetica')
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

    const logoImg = b64ToBuffer(LOGO_B64)
    const footerImg = b64ToBuffer(FOOTER_STRIP_B64)

    const sym = data.currency ?? '£'
    const disclaimer = data.disclaimer ??
      'This valuation has been prepared by Capital Rooms based on current market conditions and comparable rental evidence at the time of writing. Figures stated are estimates and subject to change. This document does not constitute a formal valuation report or legal advice. Capital Rooms accepts no liability for decisions made solely on the basis of this document.'

    // ─ WATERMARK ───────────────────────────────────────────────────────────────
    // Large faint logo centred in lower half of page, matching the real letterhead
    const wmW = 360
    const wmH = (849 / 910) * wmW
    const wmX = (PAGE_W - wmW) / 2
    const wmY = PAGE_H * 0.42  // lower half of page

    doc.save()
    try {
      // pdfkit ≥0.13 supports opacity via fillOpacity + strokeOpacity but not directly on images.
      // We piggyback on the fillOpacity approach by setting the graphics state before rendering.
      ;(doc as any).fillOpacity(0.05)
      doc.image(logoImg, wmX, wmY, { width: wmW, height: wmH })
    } catch (_) {
      // Older pdfkit — skip watermark gracefully
    }
    doc.restore()

    // ─ HEADER: LOGO TOP-RIGHT ─────────────────────────────────────────────────
    const logoX = PAGE_W - MARGIN - LOGO_W
    doc.image(logoImg, logoX, MARGIN, { width: LOGO_W, height: LOGO_H })

    // Content starts below logo height
    let y = MARGIN + LOGO_H + 28

    // ─ DATE + RECIPIENT ────────────────────────────────────────────────────────

    doc.save().font('Helvetica').fontSize(9).fillColor(GREY)
      .text(formatDate(data.letterDate), MARGIN, y)
      .restore()
    y += 20

    doc.save().font('Helvetica-Bold').fontSize(9.5).fillColor(BLACK)
      .text(data.recipientName, MARGIN, y)
      .restore()
    y += 14

    if (data.recipientAddress?.length > 0) {
      doc.save().font('Helvetica').fontSize(9).fillColor('#333')
      for (const line of data.recipientAddress) {
        doc.text(line, MARGIN, y)
        y += 13
      }
      doc.restore()
    }
    y += 12

    // ─ SUBJECT LINE ───────────────────────────────────────────────────────────

    const subjectLine = `${typeName(data.type)} — ${data.propertyAddress}${data.propertyRef ? ` (Ref: ${data.propertyRef})` : ''}`
    doc.save().font('Helvetica').fontSize(9).fillColor(BLACK)
      .text('Re: ', MARGIN, y, { continued: true })
      .font('Helvetica-Bold')
      .text(subjectLine)
      .restore()
    y += 24

    // Thin rule under Re: line
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 12

    // ─ OPENING PARA ───────────────────────────────────────────────────────────

    function drawPara(text: string) {
      const height = doc.heightOfString(text, { width: COL_W, align: 'justify' })
      doc.save().font('Helvetica').fontSize(9.5).fillColor(BLACK)
        .text(text, MARGIN, y, { width: COL_W, align: 'justify', lineGap: 3 })
        .restore()
      y += height + 12
    }

    function sectionHeading(text: string) {
      y += 6
      doc.save().font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
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
        ROW_H, BLACK, true
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
          ROW_H, bg
        )
        if (r.notes) {
          doc.save().font('Helvetica').fontSize(7).fillColor('#888')
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
      doc.save().font('Helvetica-Bold').fontSize(8).fillColor(BLACK)
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
        ROW_H, BLACK, true
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
          ROW_H, bg
        )
        drawHRule(doc, MARGIN, y + ROW_H, COL_W, '#ececec')
        y += ROW_H
        total += item.estimatedCost
      }

      doc.save().fillColor('#f2f2f2').rect(MARGIN, y, COL_W, ROW_H).fill().restore()
      doc.save().font('Helvetica-Bold').fontSize(8).fillColor(BLACK)
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
          doc.save().font('Helvetica').fontSize(9).fillColor(GREY)
            .text(lbl, MARGIN + 12, ry, { width: COL_W * 0.6, lineBreak: false })
            .font('Helvetica-Bold').fillColor(BLACK)
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
        doc.save().font('Helvetica').fontSize(9).fillColor(GREY)
          .text(lbl, MARGIN + 12, ry, { width: COL_W * 0.65, lineBreak: false })
          .font('Helvetica-Bold').fillColor(BLACK)
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
      doc.save().font('Helvetica').fontSize(9.5).fillColor(BLACK)
        .text('Yours sincerely,', MARGIN, y)
        .restore()
      y += 40   // signature gap
      doc.save().font('Helvetica-Bold').fontSize(9.5).fillColor(BLACK)
        .text(data.preparedBy, MARGIN, y)
        .restore()
      y += 14
      doc.save().font('Helvetica').fontSize(9).fillColor(GREY)
        .text('Capital Rooms', MARGIN, y)
        .restore()
      y += 22
    }

    // ─ DISCLAIMER ─────────────────────────────────────────────────────────────

    y += 6
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 8
    doc.save().font('Helvetica').fontSize(6.5).fillColor('#999')
      .text(disclaimer, MARGIN, y, { width: COL_W, align: 'left', lineGap: 2 })
      .restore()

    // ─ FOOTER BAND ────────────────────────────────────────────────────────────
    // Grey band full page width. Top portion: contact details text.
    // Bottom portion: accreditation strip image.

    const footerBandY = PAGE_H - FOOTER_BAND_H
    doc.save().fillColor(GREY_BAND).rect(0, footerBandY, PAGE_W, FOOTER_BAND_H).fill().restore()

    // Contact line
    doc.save().font('Helvetica').fontSize(6.5).fillColor('#fff')
      .text(
        '  Capital Rooms, Hoxton Mix, 66 Paul Street, London, EC2A 4NA     info@capitalrooms.co.uk     0207-112-9163',
        0, footerBandY + 7,
        { width: PAGE_W, align: 'center', lineBreak: false }
      )
      .restore()

    // Accreditation strip image (white-on-transparent — sits on grey band)
    const stripH = FOOTER_BAND_H - 22
    doc.image(footerImg, 0, footerBandY + 20, { width: PAGE_W, height: stripH })

    doc.end()
  })
}

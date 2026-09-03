// Capital Rooms — AML Compliance Report PDF generator
// Produces a formal per-landlord CDD record suitable for HMRC inspection.
// Reuses the same pdfkit letterhead as the valuation letters.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

import { LOGO_B64, FOOTER_STRIP_B64 } from '@/lib/valuations/letterhead'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AmlReportLandlord {
  name: string
  email: string
  phone?: string
  properties?: string[]
  riskLevel?: 'low' | 'medium' | 'high'
  riskNotes?: string
}

export interface AmlReportRecord {
  type: 'initial' | 'refresh'
  requestedAt: string
  completedAt?: string
  entityType?: string
  propertyCount?: string
  stage: number
}

export interface AmlReportData {
  landlord: AmlReportLandlord
  records: AmlReportRecord[]
  generatedBy?: string
  generatedAt?: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 52
const COL_W  = PAGE_W - MARGIN * 2

const BLACK     = '#1a1a1a'
const GREY      = '#555555'
const LIGHT     = '#f8f8f8'
const BORDER    = '#e0e0e0'
const GREY_BAND = '#939598'
const GREEN     = '#1a6b3c'
const AMBER     = '#7a5800'
const RED_C     = '#7a1a1a'

const LOGO_W = 90
const LOGO_H = (849 / 910) * LOGO_W
const FOOTER_BAND_H = 58

// ── Firm-level compliance constants (from Capital Rooms policy documents) ──────
const MLRO_NAME       = 'Harry Buchanan'
const MLRO_TITLE      = 'Director & Money Laundering Reporting Officer'
const MLRO_CERT       = 'Anti-Money Laundering (AML) and Financial Crime — Certified'
const FIRM_NAME       = 'Capital Rooms Ltd'
const FIRM_SUPERVISOR = 'His Majesty\'s Revenue and Customs (HMRC)'
const POLICY_DOCS     = [
  'Capital Rooms Anti-Money Laundering Policy (current)',
  'AML Policy for Handling Client Funds (current)',
  'Customer Identity Check and Risk Assessment Form 2023',
  'Suspected Money Laundering Activity Report Form',
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function b64ToBuffer(dataUri: string): Buffer {
  return Buffer.from(dataUri.replace(/^data:[^;]+;base64,/, ''), 'base64')
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function drawHRule(doc: PDFKit.PDFDocument, x: number, y: number, w: number, colour = BORDER) {
  doc.save().strokeColor(colour).lineWidth(0.5).moveTo(x, y).lineTo(x + w, y).stroke().restore()
}

function stageLabel(stage: number): { text: string; colour: string } {
  if (stage >= 3) return { text: 'Completed', colour: GREEN }
  if (stage >= 2) return { text: 'Sent — awaiting', colour: AMBER }
  return { text: 'Draft', colour: GREY }
}

function riskColour(level?: string) {
  if (level === 'high')   return RED_C
  if (level === 'medium') return AMBER
  return GREEN
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateAMLReport(data: AmlReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: FOOTER_BAND_H + 20, left: MARGIN, right: MARGIN },
      info: {
        Title: `Capital Rooms — AML Compliance Record — ${data.landlord.name}`,
        Author: 'Capital Rooms',
        Subject: 'Anti-Money Laundering Customer Due Diligence Record',
        Keywords: 'AML, CDD, MLR 2017, compliance, landlord, HMRC',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const logoImg   = b64ToBuffer(LOGO_B64)
    const footerImg = b64ToBuffer(FOOTER_STRIP_B64)
    const generatedAt = data.generatedAt ?? new Date().toISOString()

    // ─ WATERMARK ──────────────────────────────────────────────────────────────
    const wmW = 360; const wmH = (849 / 910) * wmW
    doc.save()
    try {
      ;(doc as any).fillOpacity(0.05)
      doc.image(logoImg, (PAGE_W - wmW) / 2, PAGE_H * 0.42, { width: wmW, height: wmH })
    } catch (_) { /* pdfkit without opacity */ }
    doc.restore()

    // ─ HEADER: LOGO TOP-RIGHT ─────────────────────────────────────────────────
    doc.image(logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })

    let y = MARGIN + LOGO_H + 24

    // ─ DOCUMENT TITLE ─────────────────────────────────────────────────────────
    doc.save().font('Helvetica').fontSize(7).fillColor(GREY)
      .text('CONFIDENTIAL — ANTI-MONEY LAUNDERING COMPLIANCE RECORD', MARGIN, y, { letterSpacing: 0.8 })
      .restore()
    y += 14

    doc.save().font('Helvetica-Bold').fontSize(16).fillColor(BLACK)
      .text('AML Compliance Record', MARGIN, y)
      .restore()
    y += 20

    doc.save().font('Helvetica').fontSize(8.5).fillColor(GREY)
      .text(`Generated: ${fmtDate(generatedAt)}     ·     Prepared by: ${data.generatedBy ?? MLRO_NAME}, ${FIRM_NAME}`, MARGIN, y)
      .restore()
    y += 6

    drawHRule(doc, MARGIN, y + 6, COL_W, '#c0c0c0')
    y += 20

    // ─ REGULATORY BASIS BOX ───────────────────────────────────────────────────
    const regText =
      `This record is maintained by ${FIRM_NAME} in accordance with the Money Laundering, Terrorist Financing and Transfer of Funds ` +
      `(Information on the Payer) Regulations 2017 (SI 2017/692) as amended by the Money Laundering and Terrorist Financing (Amendment) ` +
      `Regulations 2019 ("the Regulations"). ${FIRM_NAME} is a property management agent supervised by ${FIRM_SUPERVISOR} under the ` +
      `Regulations. Customer Due Diligence (CDD) measures have been applied in accordance with Regulation 28. Records are retained for a ` +
      `minimum of five years following the end of the business relationship in accordance with Regulation 40(3).`

    const regH = doc.heightOfString(regText, { width: COL_W - 24, align: 'justify' })
    doc.save().fillColor('#f4f4f4').rect(MARGIN, y, COL_W, regH + 16).fill()
      .strokeColor(BORDER).lineWidth(0.5).rect(MARGIN, y, COL_W, regH + 16).stroke()
      .restore()
    doc.save().font('Helvetica').fontSize(8).fillColor('#444')
      .text(regText, MARGIN + 12, y + 8, { width: COL_W - 24, align: 'justify', lineGap: 2 })
      .restore()
    y += regH + 22

    // ─ FIRM COMPLIANCE FRAMEWORK ──────────────────────────────────────────────
    doc.save().font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
      .text('Firm Compliance Framework', MARGIN, y)
      .restore()
    y += 12
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 10

    // Two-column: MLRO left, policies right
    const halfW = (COL_W - 16) / 2
    const rightX = MARGIN + halfW + 16

    // MLRO box
    const mlroLines: [string, string][] = [
      ['MLRO',            MLRO_NAME],
      ['Title',           MLRO_TITLE],
      ['Qualification',   MLRO_CERT],
      ['AML Supervisor',  FIRM_SUPERVISOR],
    ]

    let mlroY = y
    for (const [lbl, val] of mlroLines) {
      doc.save().font('Helvetica').fontSize(8).fillColor(GREY)
        .text(lbl, MARGIN, mlroY, { width: 80, lineBreak: false })
        .font('Helvetica-Bold').fillColor(BLACK)
        .text(val, MARGIN + 85, mlroY, { width: halfW - 85, lineBreak: false })
        .restore()
      mlroY += 15
    }

    // Policy docs box (right column)
    doc.save().font('Helvetica-Bold').fontSize(8).fillColor(BLACK)
      .text('Policy Documents on File', rightX, y)
      .restore()
    let policyY = y + 14
    for (const p of POLICY_DOCS) {
      doc.save().font('Helvetica').fontSize(8).fillColor(BLACK)
        .text('·  ' + p, rightX, policyY, { width: halfW, lineBreak: false })
        .restore()
      policyY += 13
    }

    y = Math.max(mlroY, policyY) + 14

    // ─ CLIENT DETAILS ─────────────────────────────────────────────────────────
    doc.save().font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
      .text('Client Details', MARGIN, y)
      .restore()
    y += 12
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 10

    const riskLevel = data.landlord.riskLevel ?? 'low'
    const detailRows: [string, string, string?][] = [
      ['Full name',        data.landlord.name],
      ['Email address',    data.landlord.email],
      ['Phone',            data.landlord.phone ?? '—'],
      ['Client type',      'Landlord / Property owner'],
      ['Risk classification', riskLevel.charAt(0).toUpperCase() + riskLevel.slice(0), riskLevel],
    ]
    if (data.landlord.riskNotes) {
      detailRows.push(['Risk notes', data.landlord.riskNotes])
    }
    if (data.landlord.properties?.length) {
      detailRows.push(['Properties managed', data.landlord.properties.join('; ')])
    }

    for (const [lbl, val, colourKey] of detailRows) {
      const colour = colourKey ? riskColour(colourKey) : BLACK
      doc.save().font('Helvetica').fontSize(9).fillColor(GREY)
        .text(lbl, MARGIN, y, { width: 145, lineBreak: false })
        .font('Helvetica-Bold').fillColor(colour)
        .text(val, MARGIN + 150, y, { width: COL_W - 150, lineBreak: false })
        .restore()
      y += 15
    }
    y += 8

    // ─ CDD VERIFICATION HISTORY TABLE ─────────────────────────────────────────
    doc.save().font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
      .text('CDD Verification History', MARGIN, y)
      .restore()
    y += 12
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 8

    const ROW_H = 22
    const col1W = COL_W * 0.22
    const col2W = COL_W * 0.22
    const col3W = COL_W * 0.22
    const col4W = COL_W * 0.18
    const col5W = COL_W * 0.16
    const col1X = MARGIN
    const col2X = col1X + col1W
    const col3X = col2X + col2W
    const col4X = col3X + col3W
    const col5X = col4X + col4W

    // Header row
    doc.save().fillColor(BLACK).rect(MARGIN, y, COL_W, ROW_H).fill().restore()
    doc.save().font('Helvetica-Bold').fontSize(7.5).fillColor('#fff')
      .text('Type',       col1X + 4, y + 7, { width: col1W - 8, lineBreak: false })
      .text('Requested',  col2X + 4, y + 7, { width: col2W - 8, lineBreak: false })
      .text('Completed',  col3X + 4, y + 7, { width: col3W - 8, lineBreak: false })
      .text('Entity',     col4X + 4, y + 7, { width: col4W - 8, lineBreak: false })
      .text('Status',     col5X + 4, y + 7, { width: col5W - 8, lineBreak: false })
      .restore()
    y += ROW_H

    if (data.records.length === 0) {
      doc.save().font('Helvetica').fontSize(8.5).fillColor(GREY)
        .text('No verification records on file.', MARGIN + 4, y + 8)
        .restore()
      y += ROW_H
    } else {
      data.records.forEach((r, i) => {
        const bg = i % 2 === 1 ? LIGHT : undefined
        if (bg) doc.save().fillColor(bg).rect(MARGIN, y, COL_W, ROW_H).fill().restore()
        const { text: statusText, colour: statusColour } = stageLabel(r.stage)
        doc.save().font('Helvetica').fontSize(8).fillColor(BLACK)
          .text(r.type === 'refresh' ? 'Re-verification' : 'Initial verification',
            col1X + 4, y + 7, { width: col1W - 8, lineBreak: false })
          .text(fmtDate(r.requestedAt),  col2X + 4, y + 7, { width: col2W - 8, lineBreak: false })
          .text(r.completedAt ? fmtDate(r.completedAt) : '—', col3X + 4, y + 7, { width: col3W - 8, lineBreak: false })
          .text(r.entityType ? (r.entityType === 'individual' ? 'Individual' : 'Company') : '—',
            col4X + 4, y + 7, { width: col4W - 8, lineBreak: false })
          .restore()
        doc.save().font('Helvetica-Bold').fontSize(8).fillColor(statusColour)
          .text(statusText, col5X + 4, y + 7, { width: col5W - 8, lineBreak: false })
          .restore()
        drawHRule(doc, MARGIN, y + ROW_H, COL_W, '#ebebeb')
        y += ROW_H
      })
    }
    y += 16

    // ─ DOCUMENTS COLLECTED ────────────────────────────────────────────────────
    const completedCount = data.records.filter(r => r.stage >= 3).length
    if (completedCount > 0) {
      doc.save().font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
        .text('Documents & Information Collected', MARGIN, y)
        .restore()
      y += 12
      drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
      y += 10

      const docItems = [
        'Proof of identity: passport, UK driving licence, or national identity card',
        'Proof of residential address dated within 3 months: utility bill, council tax bill, or bank statement',
        'Proof of property ownership: mortgage statement, title deed, or property utility bill',
        'Mortgage provider and account details (where applicable)',
        'Bank account details for rental income remittance',
        'HMRC residency status; NRL reference where the landlord is non-UK resident',
        'Emergency contact details',
        'Signed declaration confirming accuracy and consent to AML compliance use',
      ]

      for (const item of docItems) {
        doc.save().font('Helvetica').fontSize(8.5).fillColor(BLACK)
          .text('✓  ' + item, MARGIN, y, { width: COL_W, lineGap: 1.5 })
          .restore()
        y += 13
      }
      y += 8
    }

    // ─ DATA RETENTION NOTICE ──────────────────────────────────────────────────
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 8

    const retentionText =
      `Data retention: In accordance with Regulation 40(3) of the Money Laundering Regulations 2017, all CDD records and supporting evidence ` +
      `are retained for a minimum of five years from the end of the business relationship, or five years from the date of any occasional transaction, ` +
      `whichever is later. Records are held securely and are accessible only to authorised personnel of ${FIRM_NAME}.`

    doc.save().font('Helvetica').fontSize(7.5).fillColor(GREY)
      .text(retentionText, MARGIN, y, { width: COL_W, align: 'justify', lineGap: 1.5 })
      .restore()
    y += doc.heightOfString(retentionText, { width: COL_W }) + 14

    // ─ MLRO SIGN-OFF ──────────────────────────────────────────────────────────
    drawHRule(doc, MARGIN, y, COL_W, '#d0d0d0')
    y += 10

    const signOffRows: [string, string][] = [
      ['Prepared by',   `${data.generatedBy ?? MLRO_NAME}`],
      ['Role',          MLRO_TITLE],
      ['Qualification', MLRO_CERT],
      ['Organisation',  FIRM_NAME],
      ['Date',          fmtDate(generatedAt)],
    ]
    for (const [lbl, val] of signOffRows) {
      doc.save().font('Helvetica').fontSize(8.5).fillColor(GREY)
        .text(lbl, MARGIN, y, { width: 130, lineBreak: false })
        .font('Helvetica-Bold').fillColor(BLACK)
        .text(val, MARGIN + 135, y, { width: COL_W - 135, lineBreak: false })
        .restore()
      y += 14
    }

    // ─ FOOTER BAND ────────────────────────────────────────────────────────────
    const footerBandY = PAGE_H - FOOTER_BAND_H
    doc.save().fillColor(GREY_BAND).rect(0, footerBandY, PAGE_W, FOOTER_BAND_H).fill().restore()
    doc.save().font('Helvetica').fontSize(6.5).fillColor('#fff')
      .text(
        `  ${FIRM_NAME}, Hoxton Mix, 66 Paul Street, London, EC2A 4NA     info@capitalrooms.co.uk     0207-112-9163`,
        0, footerBandY + 7,
        { width: PAGE_W, align: 'center', lineBreak: false }
      )
      .restore()
    doc.image(footerImg, 0, footerBandY + 20, { width: PAGE_W, height: FOOTER_BAND_H - 22 })

    doc.end()
  })
}

/**
 * Capital Rooms — Check-In Balance Demand PDF generator
 *
 * Exact same letterhead as the Management Agreement:
 *   - Logo top-right on every page (pageAdded event)
 *   - Footer band on every page
 *   - Lato-Regular / Lato-Bold via lib/pdfLetterhead
 *   - Black header row on the balance table (same pattern as fee schedule)
 *   - Alternating #f8f8f8 stripes on data rows
 *
 * Rent modes:
 *   'full'    — first payment is a complete calendar month from start date
 *   'prorata' — first payment is the pro-rated days remaining in the start month
 *               calculated as: (days remaining incl. start / days in month) × monthly rent
 *               or pass proRataAmount to override the calculation
 *
 * Supports 1–3 named tenants on a single tenancy (joint / single-let).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

import {
  loadPDFLetterheadAssets,
  PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H,
  BLACK, GREY,
  drawPDFFooter,
  type PDFBizSettings,
  type PDFLetterheadAssets,
} from '@/lib/pdfLetterhead'

export interface CheckInBalanceData {
  /** All tenant names on this tenancy (1–3) */
  tenantNames:     string[]
  /** Full address displayed under names */
  propertyAddress: string
  /** Monthly rent in £ */
  rentMonthly:     number
  /** Security deposit in £ */
  depositAmount:   number
  /** Holding deposit already received — deducted from amount due */
  holdingDeposit:  number
  /** Tenancy start date ISO string "YYYY-MM-DD" */
  startDate:       string
  /** 'full' = full first month; 'prorata' = days remaining in start month */
  rentMode:        'full' | 'prorata'
  /** Override pro-rata amount (skip calculation when provided) */
  proRataAmount?:  number
  /** Payment reference for this tenancy e.g. "003KFT03" */
  paymentRef:      string
  /** Bank account name e.g. "Capital Rooms Ltd" */
  bankName:        string
  /** Sort code e.g. "20-18-93" */
  sortCode:        string
  /** Account number e.g. "4016 2574" */
  accountNo:       string
  /** IBAN e.g. "GB19 BUKB 2018 9340 1625 74" */
  iban:            string
  /** SWIFT/BIC e.g. "BUKBGB22" */
  swift?:          string
  /** Business settings (fetched by route, passed in) */
  bizSettings?:    PDFBizSettings
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const COL_W = PAGE_W - MARGIN * 2
const LIGHT  = '#f8f8f8'
const RED    = '#C0392B'

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function daysRemainingInclusive(d: Date): number {
  return daysInMonth(d) - d.getDate() + 1
}

function fmtMoney(n: number): string {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hRule(doc: any, x: number, y: number, w: number, colour = '#e0e0e0') {
  doc.save().strokeColor(colour).lineWidth(0.5).moveTo(x, y).lineTo(x + w, y).stroke().restore()
}

// ── Main generator ─────────────────────────────────────────────────────────────

export async function generateCheckInBalancePDF(data: CheckInBalanceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const assets: PDFLetterheadAssets = loadPDFLetterheadAssets()
    const { logoImg, footerImg, fontReg, fontBold } = assets
    const biz = data.bizSettings ?? {
      company_name:  'Capital Rooms',
      address_line1: 'Hoxton Mix, 66 Paul Street',
      city:          'London',
      postcode:      'EC2A 4NA',
      email:         'info@capitalrooms.co.uk',
      phone:         '0207 112 9163',
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: FOOTER_BAND_H + 20, left: MARGIN, right: MARGIN },
      info: {
        Title:  `Capital Rooms — Check-In Balance Demand — ${data.propertyAddress}`,
        Author: 'Capital Rooms',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // ── Letterhead on every page ──────────────────────────────────────────────
    function drawPageDecor() {
      if (logoImg.length) {
        doc.image(logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
      }
      drawPDFFooter(doc, footerImg, biz, fontReg)
    }

    drawPageDecor()
    doc.on('pageAdded', () => { drawPageDecor() })

    // ── Content state ─────────────────────────────────────────────────────────
    let y = MARGIN

    function ensureSpace(needed: number) {
      if (y + needed > PAGE_H - FOOTER_BAND_H - 24) {
        doc.addPage()
        y = MARGIN + LOGO_H + 12
      }
    }

    // ── Compute rent figures ──────────────────────────────────────────────────
    const start    = parseDate(data.startDate)
    const lastDay  = lastDayOfMonth(start)

    let rentAmount:  number
    let rentDateStr: string

    if (data.rentMode === 'prorata') {
      const days    = daysRemainingInclusive(start)
      const total   = daysInMonth(start)
      rentAmount    = data.proRataAmount ?? Math.round((data.rentMonthly / total) * days * 100) / 100
      rentDateStr   = `${fmtDate(start)} – ${fmtDate(lastDay)}`
    } else {
      // Full first month: start date through the day before same date next month
      rentAmount    = data.rentMonthly
      const endDate = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1)
      rentDateStr   = `${fmtDate(start)} – ${fmtDate(endDate)}`
    }

    const total      = rentAmount + data.depositAmount
    const amountDue  = total - data.holdingDeposit

    // ── Title block ───────────────────────────────────────────────────────────
    doc.save().font(fontBold).fontSize(14).fillColor(BLACK)
      .text('CHECK-IN BALANCE DEMAND', MARGIN, y)
      .restore()
    y += 20

    doc.save().font(fontReg).fontSize(10).fillColor(GREY)
      .text('Capital Rooms', MARGIN, y)
      .restore()
    y += 14

    // Ensure content clears the logo on the right
    y = Math.max(y, MARGIN + LOGO_H + 12)

    // Date line
    doc.save().font(fontReg).fontSize(9).fillColor(GREY)
      .text(fmtDate(new Date()), MARGIN, y)
      .restore()
    y += 20

    hRule(doc, MARGIN, y, COL_W, '#c0c0c0')
    y += 16

    // ── Tenant names ──────────────────────────────────────────────────────────
    ensureSpace(50)
    doc.save().font(fontBold).fontSize(9.5).fillColor(GREY)
      .text('TO', MARGIN, y)
      .restore()
    y += 14

    doc.save().font(fontBold).fontSize(11).fillColor(BLACK)
      .text(data.tenantNames.join('\n'), MARGIN, y)
      .restore()
    y += data.tenantNames.length * 15 + 2

    // Property address (underlined)
    doc.save().font(fontReg).fontSize(9.5).fillColor(BLACK)
      .text(data.propertyAddress, MARGIN, y, { underline: true, width: COL_W - 100 })
      .restore()
    y = doc.y + 6

    // Monthly rent summary line
    doc.save().font(fontReg).fontSize(9).fillColor(GREY)
      .text(
        `Monthly rent: ${fmtMoney(data.rentMonthly)}   ·   Tenancy start: ${fmtDate(start)}`,
        MARGIN, y
      )
      .restore()
    y = doc.y + 20

    hRule(doc, MARGIN, y, COL_W, '#c0c0c0')
    y += 16

    // ── Balance table (black header, same as fee schedule in management agreement) ──
    ensureSpace(160)

    const ROW_H = 28
    const c1W   = COL_W * 0.72   // description column
    const c2X   = MARGIN + c1W   // value column x-start
    const c2W   = COL_W - c1W    // value column width

    // Black header row
    doc.save().fillColor(BLACK).rect(MARGIN, y, COL_W, ROW_H).fill().restore()
    doc.save().font(fontBold).fontSize(8.5).fillColor('#ffffff')
      .text('Description', MARGIN + 8, y + 9, { width: c1W - 16, lineBreak: false })
      .restore()
    doc.save().font(fontBold).fontSize(8.5).fillColor('#ffffff')
      .text('Amount', c2X + 6, y + 9, { width: c2W - 14, align: 'right', lineBreak: false })
      .restore()
    y += ROW_H

    // Rent row
    doc.save().fillColor(LIGHT).rect(MARGIN, y, COL_W, ROW_H).fill().restore()
    doc.save().font(fontReg).fontSize(8.5).fillColor(BLACK)
      .text(`Rent  (${rentDateStr})`, MARGIN + 8, y + 9, { width: c1W - 16, lineBreak: false })
      .restore()
    doc.save().font(fontReg).fontSize(8.5).fillColor(BLACK)
      .text(fmtMoney(rentAmount), c2X + 6, y + 9, { width: c2W - 14, align: 'right', lineBreak: false })
      .restore()
    hRule(doc, MARGIN, y + ROW_H, COL_W, '#ececec')
    y += ROW_H

    // Deposit row
    doc.save().font(fontReg).fontSize(8.5).fillColor(BLACK)
      .text('Security Deposit', MARGIN + 8, y + 9, { width: c1W - 16, lineBreak: false })
      .restore()
    doc.save().font(fontReg).fontSize(8.5).fillColor(BLACK)
      .text(fmtMoney(data.depositAmount), c2X + 6, y + 9, { width: c2W - 14, align: 'right', lineBreak: false })
      .restore()
    hRule(doc, MARGIN, y + ROW_H, COL_W, '#ececec')
    y += ROW_H

    // Total row (light background, bold)
    doc.save().fillColor(LIGHT).rect(MARGIN, y, COL_W, ROW_H).fill().restore()
    doc.save().font(fontBold).fontSize(8.5).fillColor(BLACK)
      .text('Total', MARGIN + 8, y + 9, { width: c1W - 16, lineBreak: false })
      .restore()
    doc.save().font(fontBold).fontSize(8.5).fillColor(BLACK)
      .text(fmtMoney(total), c2X + 6, y + 9, { width: c2W - 14, align: 'right', lineBreak: false })
      .restore()
    hRule(doc, MARGIN, y + ROW_H, COL_W, '#c0c0c0')
    y += ROW_H

    // Less holding deposit row
    doc.save().font(fontReg).fontSize(8.5).fillColor(GREY)
      .text('Less Holding Deposit Received', MARGIN + 8, y + 9, { width: c1W - 16, lineBreak: false })
      .restore()
    doc.save().font(fontReg).fontSize(8.5).fillColor(GREY)
      .text(`(${fmtMoney(data.holdingDeposit)})`, c2X + 6, y + 9, { width: c2W - 14, align: 'right', lineBreak: false })
      .restore()
    hRule(doc, MARGIN, y + ROW_H, COL_W, '#c0c0c0')
    y += ROW_H

    // Amount due row — black background (same treatment as management agreement "total" emphasis)
    doc.save().fillColor(BLACK).rect(MARGIN, y, COL_W, ROW_H).fill().restore()
    doc.save().font(fontBold).fontSize(9.5).fillColor('#ffffff')
      .text('Amount Due', MARGIN + 8, y + 8, { width: c1W - 16, lineBreak: false })
      .restore()
    doc.save().font(fontBold).fontSize(9.5).fillColor('#ffffff')
      .text(fmtMoney(amountDue), c2X + 6, y + 8, { width: c2W - 14, align: 'right', lineBreak: false })
      .restore()
    y += ROW_H + 20

    // ── BACS details ──────────────────────────────────────────────────────────
    hRule(doc, MARGIN, y, COL_W, '#c0c0c0')
    y += 16

    ensureSpace(120)
    doc.save().font(fontBold).fontSize(9.5).fillColor(BLACK)
      .text('Payment by BACS Transfer', MARGIN, y)
      .restore()
    y += 16

    const bacsPairs: [string, string][] = [
      ['Account Name', data.bankName],
      ['Sort Code',    data.sortCode],
      ['Account No.',  data.accountNo],
      ['Reference',    data.paymentRef],
      ['IBAN',         data.iban],
    ]
    if (data.swift) bacsPairs.push(['SWIFT/BIC', data.swift])

    const LABEL_W = 96
    for (const [label, value] of bacsPairs) {
      doc.save().font(fontBold).fontSize(9).fillColor(GREY)
        .text(label, MARGIN, y, { width: LABEL_W, lineBreak: false })
        .restore()
      doc.save().font(fontReg).fontSize(9).fillColor(BLACK)
        .text(value, MARGIN + LABEL_W, y, { width: COL_W - LABEL_W, lineBreak: false })
        .restore()
      y += 15
    }

    y += 20

    // ── Red warning box ───────────────────────────────────────────────────────
    const WARNING =
      'TO CHECK-IN ON TIME WE KINDLY REQUIRE YOUR BALANCE TO BE PAID IN FULL IN ' +
      'CLEARED FUNDS AT LEAST 24 HOURS PRIOR TO CHECK IN'

    const WARN_PAD = 12
    const WARN_W   = COL_W

    const warnTextH = doc.font(fontBold).fontSize(8.5)
      .heightOfString(WARNING, { width: WARN_W - WARN_PAD * 2 })
    const warnH = warnTextH + WARN_PAD * 2

    ensureSpace(warnH + 8)

    doc.save().fillColor(RED).rect(MARGIN, y, WARN_W, warnH).fill().restore()
    doc.save()
      .font(fontBold).fontSize(8.5).fillColor('#ffffff')
      .text(WARNING, MARGIN + WARN_PAD, y + WARN_PAD, {
        width: WARN_W - WARN_PAD * 2,
        align: 'center',
        lineGap: 2,
      })
      .restore()

    doc.end()
  })
}

// Capital Rooms — Lettings Statement PDF Generator
// Matches the exact format of 003KFT02 - Statement.pdf

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

import {
  loadPDFLetterheadAssets,
  PAGE_W, PAGE_H, MARGIN,
  FOOTER_BAND_H, LOGO_W, LOGO_H,
  BLACK, GREY,
  drawPDFFooter,
  type PDFBizSettings,
} from '@/lib/pdfLetterhead'

export interface LettingsStatementData {
  // Landlord
  landlordName: string
  landlordAddress: string   // multi-line, newline-separated

  // Property & room
  roomName: string          // e.g. "Room 2"
  propertyAddress: string   // full address

  // Tenancy
  startDate: string         // ISO
  rentAmount: number        // monthly
  depositAmount: number
  rentInAdvance?: number    // months (default 1)
  depositWeeks?: number     // default 5

  // Tenant
  tenantSalutation?: string
  tenantFirstName: string
  tenantLastName: string
  tenantPhone?: string
  tenantEmail?: string
  tenantNotes?: string       // DOB, occupation etc pulled from profile

  // Fee
  lettingFeePct?: number    // e.g. 75 for 75%
  lettingFeeFlat?: number   // flat fee override
  lettingFeeLabel?: string  // override label e.g. "¾ of monthly rent"
  holdingDepositReceived?: number

  // Bank details (property's landlord account)
  bankName?: string
  bankAccountName: string
  bankSortCode?: string
  bankAccountNumber?: string
  paymentReference?: string

  // Statement date
  statementDate?: string    // ISO, defaults to today

  bizSettings?: PDFBizSettings
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtGBP(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso?: string) {
  return (iso ? new Date(iso) : new Date()).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function pctToFraction(pct: number): string {
  const fractions: Record<number, string> = {
    25: '¼', 33: '⅓', 50: '½', 67: '⅔', 75: '¾', 100: '1',
  }
  return fractions[Math.round(pct)] ?? `${pct}%`
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateLettingsStatementPDF(data: LettingsStatementData): Promise<Buffer> {
  const assets = await loadPDFLetterheadAssets()

  const fontReg  = assets.fontReg
  const fontBold = assets.fontBold

  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  const COL_W = PAGE_W - MARGIN * 2
  const ORANGE = '#C0392B'  // Capital Rooms red/orange for deductions (matches statement)
  const LIGHT_GREY = '#f7f7f7'
  const BORDER = '#dddddd'

  // ── Logo + footer on every page ──────────────────────────────────────────
  function drawPageDecor() {
    if (assets.logoImg.length) {
      doc.image(assets.logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
    }
    drawPDFFooter(doc, assets.footerImg, data.bizSettings, fontReg)
  }

  drawPageDecor()
  doc.on('pageAdded', () => { drawPageDecor() })

  let y = MARGIN

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - FOOTER_BAND_H - 24) {
      doc.addPage()
      y = MARGIN + LOGO_H + 12
    }
  }

  // ── Landlord address (top left) ──────────────────────────────────────────
  doc.font(fontReg).fontSize(10).fillColor(BLACK)
  const addrLines = [data.landlordName, ...data.landlordAddress.split('\n').filter(Boolean)]
  for (const line of addrLines) {
    doc.text(line, MARGIN, y)
    y += 14
  }

  // Ensure content clears the logo
  y = Math.max(y + 8, MARGIN + LOGO_H + 12)

  // ── Date ─────────────────────────────────────────────────────────────────
  y += 8
  doc.font(fontReg).fontSize(10).fillColor(BLACK)
  doc.text(fmtDate(data.statementDate), MARGIN, y)
  y += 32

  // ── Heading ──────────────────────────────────────────────────────────────
  doc.font(fontBold).fontSize(18).fillColor(BLACK)
  doc.text('LETTINGS STATEMENT', MARGIN, y)
  y += 30

  // ── Property line ────────────────────────────────────────────────────────
  doc.font(fontReg).fontSize(11).fillColor(BLACK)
  doc.text(`🏠  ${data.roomName}, ${data.propertyAddress}`, MARGIN, y)
  y += 24

  // ── Info table ───────────────────────────────────────────────────────────
  const tableX = MARGIN
  const tableW = COL_W
  const rowH = 18
  const labelW = 120

  function infoTableStart() {
    doc.save().fillColor(LIGHT_GREY).rect(tableX, y, tableW, 1).fill().restore()
    doc.save().strokeColor(BORDER).lineWidth(0.5)
      .rect(tableX, y, tableW, 0).stroke().restore()
  }

  function infoRow(label: string, value: string, extra?: string) {
    const rh = extra ? rowH * 2 + 4 : rowH + 4
    doc.save().fillColor(LIGHT_GREY).rect(tableX, y, tableW, rh).fill().restore()
    doc.save().strokeColor(BORDER).lineWidth(0.3)
      .moveTo(tableX, y + rh).lineTo(tableX + tableW, y + rh).stroke().restore()

    doc.font(fontBold).fontSize(9).fillColor(BLACK)
    doc.text(label, tableX + 12, y + 5, { width: labelW })

    doc.font(fontReg).fontSize(9).fillColor(BLACK)
    if (extra) {
      doc.text(value, tableX + labelW + 12, y + 5, { width: tableW - labelW - 24 })
      doc.text(extra, tableX + labelW + 12, y + 5 + rowH, { width: tableW - labelW - 24 })
    } else {
      doc.text(value, tableX + labelW + 12, y + 5, { width: tableW - labelW - 24 })
    }
    y += rh
  }

  // Draw border around info box
  const infoBoxY = y
  infoRow('START DATE:', fmtDate(data.startDate))
  infoRow('ADDRESS:', `${data.roomName}, ${data.propertyAddress}`)
  infoRow('RENT:', `${fmtGBP(data.rentAmount)} pcm`)
  infoRow('DEPOSIT:', fmtGBP(data.depositAmount))

  const tenantName = [data.tenantSalutation, data.tenantFirstName, data.tenantLastName].filter(Boolean).join(' ')
  const tenantContact = [data.tenantPhone, data.tenantEmail].filter(Boolean).join(', ')
  const tenantDisplay = tenantContact ? `${tenantName} (${tenantContact})` : tenantName
  infoRow('TENANT:', tenantDisplay)

  if (data.tenantNotes) {
    infoRow('NOTES:', data.tenantNotes)
  }

  // Draw border around info box
  doc.save().strokeColor(BORDER).lineWidth(0.5)
    .rect(tableX, infoBoxY, tableW, y - infoBoxY).stroke().restore()

  y += 20

  // ── Financials table ─────────────────────────────────────────────────────
  ensureSpace(180)
  const depositWeeks = data.depositWeeks ?? 5
  const depositLabel = depositWeeks === 1 ? 'One Week' : depositWeeks === 2 ? 'Two Weeks' : `${depositWeeks} Weeks`
  const rentMonths = data.rentInAdvance ?? 1
  const rentLabel = rentMonths === 1 ? 'One Month' : `${rentMonths} Months`

  // Calculate fee
  let feeAmount = 0
  let feeLabel = ''
  if (data.lettingFeeFlat) {
    feeAmount = data.lettingFeeFlat
    feeLabel = `Let fee — flat £${data.lettingFeeFlat}`
  } else if (data.lettingFeePct) {
    feeAmount = Math.round((data.rentAmount * data.lettingFeePct / 100) * 100) / 100
    const fracLabel = data.lettingFeeLabel ?? `${pctToFraction(data.lettingFeePct)} of monthly rent`
    feeLabel = `Let fee @ ${fracLabel}`
  }

  const totalIn = data.depositAmount + (data.rentAmount * rentMonths)
  const holdingDeducted = data.holdingDepositReceived ?? 0
  const dueToLandlord = totalIn - feeAmount - holdingDeducted

  const finBoxY = y

  function finRow(label: string, sublabel: string, amount: string, labelColor = BLACK, amountColor = BLACK) {
    const rh = 36
    doc.save().fillColor(LIGHT_GREY).rect(tableX, y, tableW, rh).fill().restore()
    doc.save().strokeColor(BORDER).lineWidth(0.3)
      .moveTo(tableX, y + rh).lineTo(tableX + tableW, y + rh).stroke().restore()

    doc.font(fontBold).fontSize(9).fillColor(labelColor)
    doc.text(label, tableX + 12, y + 6, { width: 160 })
    doc.font(fontReg).fontSize(9).fillColor(labelColor)
    doc.text(sublabel, tableX + 12, y + 20, { width: 160 })

    doc.font(fontBold).fontSize(10).fillColor(amountColor)
    doc.text(amount, tableX + 180, y + 12, { width: tableW - 192, align: 'left' })
    y += rh
  }

  function finRowTotal(label: string, amount: string) {
    const rh = 32
    doc.save().fillColor('#ffffff').rect(tableX, y, tableW, rh).fill().restore()

    doc.font(fontBold).fontSize(11).fillColor(BLACK)
    doc.text(label, tableX + 12, y + 9, { width: 200 })
    doc.font(fontBold).fontSize(12).fillColor(BLACK)
    doc.text(amount, tableX + 180, y + 9, { width: tableW - 192, align: 'left' })
    y += rh
  }

  finRow('DEPOSIT RECEIVED:', depositLabel, fmtGBP(data.depositAmount))
  finRow('RENT RECEIVED:', rentLabel, fmtGBP(data.rentAmount * rentMonths))
  if (feeAmount > 0) {
    finRow('DEDUCTIONS:', feeLabel, `-${fmtGBP(feeAmount)}`, ORANGE, ORANGE)
  }
  if (holdingDeducted > 0) {
    finRow('HOLDING DEPOSIT:', 'Already received', `-${fmtGBP(holdingDeducted)}`, ORANGE, ORANGE)
  }

  // separator line before total
  doc.save().strokeColor(BORDER).lineWidth(0.5)
    .moveTo(tableX, y).lineTo(tableX + tableW, y).stroke().restore()
  y += 4

  finRowTotal('DUE TO LANDLORD:', fmtGBP(dueToLandlord))

  // Draw border around financials box
  doc.save().strokeColor(BORDER).lineWidth(0.5)
    .rect(tableX, finBoxY, tableW, y - finBoxY).stroke().restore()

  y += 24

  // ── Transfer confirmation text ────────────────────────────────────────────
  ensureSpace(80)
  doc.font(fontReg).fontSize(10).fillColor(BLACK)
  const transferLine = `The balance owed to you of `
  doc.text(transferLine, MARGIN, y, { continued: true })
  doc.font(fontBold).text(fmtGBP(dueToLandlord), { continued: true })
  doc.font(fontReg).text(' will be transferred to the following account:')
  y += 24

  // ── Bank details box ─────────────────────────────────────────────────────
  const bankBoxY = y

  doc.save().fillColor(LIGHT_GREY).rect(tableX, bankBoxY, tableW, 14).fill().restore()
  doc.font(fontBold).fontSize(8).fillColor(GREY)
  doc.text('YOUR ACCOUNT DETAILS FOR PAYMENT', tableX + 12, bankBoxY + 3, { characterSpacing: 0.5 })
  y += 14

  const bankRows: [string, string][] = []
  if (data.bankName) bankRows.push(['BANK:', data.bankName])
  bankRows.push(['NAME:', data.bankAccountName])
  if (data.bankAccountNumber) bankRows.push(['ACCOUNT:', data.bankAccountNumber])
  if (data.bankSortCode) bankRows.push(['SORT CODE:', data.bankSortCode])
  if (data.paymentReference) bankRows.push(['REFERENCE', data.paymentReference])

  for (const [lbl, val] of bankRows) {
    const rh = 18
    doc.font(fontBold).fontSize(9).fillColor(BLACK)
    doc.text(lbl, tableX + 12, y + 4, { width: 100 })
    doc.font(fontReg).fontSize(9).fillColor(ORANGE)
    doc.text(val, tableX + 120, y + 4, { width: tableW - 132 })
    y += rh
  }

  const bankBoxH = y + 6 - bankBoxY
  doc.save().strokeColor(BORDER).lineWidth(0.5)
    .rect(tableX, bankBoxY, tableW, bankBoxH).stroke().restore()
  y += 12

  doc.end()
  return new Promise<Buffer>(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

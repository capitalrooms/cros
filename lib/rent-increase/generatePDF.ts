// Capital Rooms — Section 13 (Form 4A) PDF generator
// Produces two documents:
//   1. Cover letter — Capital Rooms house tone, explains increase + tenant rights
//   2. Form 4A — statutory notice, Housing Act 1988 s.13(2) as amended post-May 2026
//
// Uses pdfkit (zero React dependency), same letterhead as valuations.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')
import { LOGO_B64, FOOTER_STRIP_B64 } from '@/lib/valuations/letterhead'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RentIncreaseData {
  // Tenant
  tenantTitle:      string          // e.g. "Miss"
  tenantFullName:   string          // e.g. "Rebecca Rumsey"
  tenantFirstName:  string          // for salutation
  roomName:         string          // e.g. "Room 2"
  propertyAddress:  string          // e.g. "208 Rotherhithe Street, London, SE16 7RB"
  propertyPostcode: string          // e.g. "SE16 7RB"

  // Landlord (Section 2 of Form 4A)
  landlordName:     string          // full name / company name
  // Service address = Capital Rooms address (NRLA explicitly permits agent address)

  // Tenancy
  tenancyStartDate: string          // ISO date — determines rental period start day
  currentRent:      number          // £/month
  proposedRent:     number          // £/month
  effectiveDate:    string          // ISO date — proposed new rent start (pre-validated)
  noticeServedDate: string          // ISO date — today / when served
  lastS13Date:      string | null   // ISO date — date of last s.13 increase, or null

  // Cover letter customisation
  marketAreaDescription?: string    // e.g. "SE16" — for "similar rooms in SE16"
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_W  = 595.28
const PAGE_H  = 841.89
const MARGIN  = 52
const COL_W   = PAGE_W - MARGIN * 2

const BLACK      = '#1a1a1a'
const GREY       = '#555555'
const LIGHT      = '#f8f8f8'
const BORDER     = '#e0e0e0'
const GREY_BAND  = '#939598'

const LOGO_W = 90
const LOGO_H = (849 / 910) * LOGO_W
const FOOTER_BAND_H = 58

const CR_ADDRESS_LINE1 = 'Third Floor, 86-90 Paul Street'
const CR_ADDRESS_LINE2 = 'London, EC2A 4NE'
const CR_EMAIL         = 'management@capitalrooms.co.uk'
const CR_PHONE         = '0207 112 9163'
const CR_FULL_ADDRESS  = `Capital Rooms, ${CR_ADDRESS_LINE1}, ${CR_ADDRESS_LINE2}`

// ── Helpers ────────────────────────────────────────────────────────────────────

function b64(dataUri: string): Buffer {
  return Buffer.from(dataUri.replace(/^data:[^;]+;base64,/, ''), 'base64')
}

function fmtMoney(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtDateShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function ordinalDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDate()
  const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  const year  = d.getFullYear()
  return `${day}${suffix} ${month} ${year}`
}

function pct(oldR: number, newR: number): string {
  const p = ((newR - oldR) / oldR) * 100
  return p.toFixed(0) + '%'
}

function postcode(address: string): string {
  const m = address.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i)
  return m ? m[0].toUpperCase() : ''
}

// ── Document factory ───────────────────────────────────────────────────────────

function makeDoc(title: string) {
  const logoImg   = b64(LOGO_B64)
  const footerImg = b64(FOOTER_STRIP_B64)

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: FOOTER_BAND_H + 20, left: MARGIN, right: MARGIN },
    info: { Title: title, Author: 'Capital Rooms' },
  })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  return {
    doc,
    logoImg,
    footerImg,
    finish: (): Promise<Buffer> => new Promise((res, rej) => {
      doc.on('end', () => res(Buffer.concat(chunks)))
      doc.on('error', rej)
      doc.end()
    }),
  }
}

function drawLetterhead(doc: PDFKit.PDFDocument, logoImg: Buffer, y: number): number {
  // Faint watermark
  const wmW = 340
  const wmH = (849 / 910) * wmW
  try {
    ;(doc as any).fillOpacity(0.05)
    doc.image(logoImg, (PAGE_W - wmW) / 2, PAGE_H * 0.44, { width: wmW, height: wmH })
  } catch { /* older pdfkit */ }
  doc.restore?.()
  ;(doc as any).fillOpacity(1)

  // Logo top-right
  doc.image(logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
  return MARGIN + LOGO_H + 24
}

function drawFooter(doc: PDFKit.PDFDocument, footerImg: Buffer) {
  const y = PAGE_H - FOOTER_BAND_H
  doc.save().fillColor(GREY_BAND).rect(0, y, PAGE_W, FOOTER_BAND_H).fill().restore()
  doc.save().font('Helvetica').fontSize(6.5).fillColor('#fff')
    .text(
      `  ${CR_FULL_ADDRESS}     ${CR_EMAIL}     ${CR_PHONE}`,
      0, y + 7, { width: PAGE_W, align: 'center', lineBreak: false }
    ).restore()
  doc.image(footerImg, 0, y + 20, { width: PAGE_W, height: FOOTER_BAND_H - 22 })
}

function rule(doc: PDFKit.PDFDocument, x: number, y: number, w: number, col = BORDER) {
  doc.save().strokeColor(col).lineWidth(0.5).moveTo(x, y).lineTo(x + w, y).stroke().restore()
}

function para(doc: PDFKit.PDFDocument, text: string, y: number, opts?: { size?: number; align?: 'left'|'justify'|'right' }): number {
  const size  = opts?.size  ?? 9.5
  const align = opts?.align ?? 'justify'
  const h = doc.heightOfString(text, { width: COL_W, align })
  doc.save().font('Helvetica').fontSize(size).fillColor(BLACK)
    .text(text, MARGIN, y, { width: COL_W, align, lineGap: 3 })
    .restore()
  return y + h + 12
}

// ── DOCUMENT 1: Cover Letter ───────────────────────────────────────────────────

export async function generateCoverLetter(d: RentIncreaseData): Promise<Buffer> {
  const { doc, logoImg, footerImg, finish } = makeDoc(
    `Section 13 Cover Letter — ${d.tenantFullName}`
  )

  let y = drawLetterhead(doc, logoImg, MARGIN)

  // Recipient address block
  const addrLines = [
    `${d.tenantTitle} ${d.tenantFullName}`,
    d.roomName,
    ...d.propertyAddress.split(',').map(s => s.trim()),
  ]
  doc.save().font('Helvetica').fontSize(9.5).fillColor(BLACK)
  for (const line of addrLines) {
    doc.text(line, MARGIN, y); y += 13
  }
  doc.restore()
  y += 12

  // Date
  doc.save().font('Helvetica').fontSize(9.5).fillColor(BLACK)
    .text(ordinalDate(d.noticeServedDate), MARGIN, y).restore()
  y += 26

  // Subject — underlined bold
  const subject = 'Cover Letter to Accompany Section 13 Rent Increase Notice'
  doc.save().font('Helvetica-Bold').fontSize(9.5).fillColor(BLACK)
    .text(subject, MARGIN, y, { underline: true }).restore()
  y += 22

  // Salutation
  doc.save().font('Helvetica').fontSize(9.5).fillColor(BLACK)
    .text(`Dear ${d.tenantFirstName},`).restore()
  y += 18

  // Body paragraphs
  const area    = d.marketAreaDescription || postcode(d.propertyAddress) || 'the local area'
  const pcgStr  = pct(d.currentRent, d.proposedRent)
  const effDate = ordinalDate(d.effectiveDate)

  y = para(doc, 'I hope this letter finds you well.', y)

  y = para(doc,
    `We are writing to inform you of a change to your rent, effective from ${effDate}. ` +
    `This adjustment represents an increase of ${pcgStr}, which has been carefully considered to ` +
    `keep rents here closer to current market levels while remaining fair and competitive.`,
    y
  )

  y = para(doc,
    `Even with this adjustment, your rent will remain competitive compared to similar rooms in ${area}.`,
    y
  )

  y = para(doc,
    `We are required by law to give you formal notice of this change under Section 13 of the Housing Act 1988. ` +
    `You will find the official Form 4A notice enclosed. This sets out the full details of the proposed new rent and the date it takes effect.`,
    y
  )

  y = para(doc,
    `If you are happy with the new rent, please update your standing order to ${fmtMoney(d.proposedRent)} per month before ${effDate} and ` +
    `let us know so we can record your acceptance.`,
    y
  )

  y = para(doc,
    `If you have any questions or concerns, please do get in touch — we are happy to discuss the increase and explain how we arrived at the proposed figure. ` +
    `If after speaking with us you would prefer to agree a different (lower) amount, we can do so in writing.`,
    y
  )

  y = para(doc,
    `You also have the right to refer this notice to the First-tier Tribunal before ${effDate} if you believe the proposed rent exceeds the open market rate for a comparable property. ` +
    `Free advice is available from a citizens' advice bureau, housing advice centre, law centre, or solicitor.`,
    y
  )

  y = para(doc, 'Thank you for your understanding. We greatly value you as a tenant.', y)

  y += 6
  doc.save().font('Helvetica').fontSize(9.5).fillColor(BLACK).text('Best regards,', MARGIN, y).restore()
  y += 34
  doc.save().font('Helvetica-Bold').fontSize(9.5).fillColor(BLACK).text('Harry', MARGIN, y).restore()
  y += 14
  doc.save().font('Helvetica').fontSize(9.5).fillColor(BLACK).text('Capital Rooms', MARGIN, y).restore()

  drawFooter(doc, footerImg)
  return finish()
}

// ── DOCUMENT 2: Form 4A (statutory notice) ─────────────────────────────────────

export async function generateForm4A(d: RentIncreaseData): Promise<Buffer> {
  const { doc, logoImg, footerImg, finish } = makeDoc(
    `Form 4A — Section 13 Notice — ${d.tenantFullName}`
  )

  // Page 1: The statutory notice itself
  let y = MARGIN

  // Logo top-right (no full watermark on statutory form — keep it clean)
  doc.image(b64(LOGO_B64), PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
  y = MARGIN + LOGO_H + 18

  // ─ HEADING ──────────────────────────────────────────────────────────────────
  doc.save().font('Helvetica-Bold').fontSize(14).fillColor(BLACK)
    .text('FORM 4A', MARGIN, y, { width: COL_W, align: 'center' })
    .restore()
  y += 20

  doc.save().font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
    .text("Landlord's Notice proposing a new rent under an Assured Periodic Tenancy", MARGIN, y, { width: COL_W, align: 'center' })
    .restore()
  y += 14

  doc.save().font('Helvetica').fontSize(8).fillColor(GREY)
    .text('Housing Act 1988 section 13(2), as amended by the Regulatory Reform (Assured Periodic Tenancies) (Rent Increases) Order 2003 and the Renters\' Rights Act 2025', MARGIN, y, { width: COL_W, align: 'center', lineGap: 2 })
    .restore()
  y += 26

  rule(doc, MARGIN, y, COL_W, '#999')
  y += 10

  doc.save().font('Helvetica').fontSize(8).fillColor(GREY)
    .text('The notes on page 2 of this form give guidance to both landlords and tenants about this notice.', MARGIN, y, { width: COL_W })
    .restore()
  y += 18

  // ─ SECTIONS 1–3: PARTIES ────────────────────────────────────────────────────

  // Helper: label + dotted fill line
  function labelField(label: string, value: string, indent = 0) {
    const LW = 60
    const FW = COL_W - LW - indent
    const labelX = MARGIN + indent
    const fieldX = MARGIN + LW + indent
    doc.save().font('Helvetica-Bold').fontSize(8.5).fillColor(BLACK)
      .text(label, labelX, y, { width: LW, lineBreak: false })
      .restore()
    doc.save().font('Helvetica').fontSize(8.5).fillColor(BLACK)
      .text(value, fieldX, y, { width: FW })
      .restore()
    const h = Math.max(doc.heightOfString(value, { width: FW }), 11)
    y += h + 6
  }

  // Section 1 — Tenant
  doc.save().font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
    .text('Section 1 — Tenant details', MARGIN, y).restore()
  y += 14

  const tenantAddr = `${d.roomName}, ${d.propertyAddress}`
  labelField('1.1  To:', `${d.tenantTitle} ${d.tenantFullName}`)
  labelField('1.2  Of:', tenantAddr)
  y += 6

  // Section 2 — Landlord
  doc.save().font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
    .text('Section 2 — Landlord details', MARGIN, y).restore()
  y += 14

  labelField('2.1  From:', d.landlordName)
  labelField('2.2  Service address:', `${CR_ADDRESS_LINE1}, ${CR_ADDRESS_LINE2}`)
  labelField('2.3  Contact:', `${CR_EMAIL}    ${CR_PHONE}`)
  y += 6

  // Section 3 — Agent
  doc.save().font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
    .text('Section 3 — Managing Agent', MARGIN, y).restore()
  y += 14

  labelField('3.1  Agent:', 'Capital Rooms')
  labelField('3.2  Address:', `${CR_ADDRESS_LINE1}, ${CR_ADDRESS_LINE2}`)
  labelField('3.3  Contact:', `${CR_EMAIL}    ${CR_PHONE}`)
  y += 8

  rule(doc, MARGIN, y, COL_W)
  y += 12

  // ─ SECTION 4: RENT ──────────────────────────────────────────────────────────

  doc.save().font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
    .text('Section 4 — The rent', MARGIN, y).restore()
  y += 14

  // 4.1
  labelField('4.1', `${fmtMoney(d.currentRent)} per month`)

  // 4.2 — tenancy start
  labelField('4.2', fmtDateShort(d.tenancyStartDate))

  // 4.3 — date of last increase (blank if none)
  labelField('4.3', d.lastS13Date ? fmtDateShort(d.lastS13Date) : '—  (no prior Section 13 increase)')

  // 4.4 — first increase date after 11 Feb 2023
  // Per NRLA notes: leave blank if no increase since that date or renewed at higher rent
  labelField('4.4', d.lastS13Date ? fmtDateShort(d.lastS13Date) : '—')

  // 4.5 — proposed new rent
  labelField('4.5', `${fmtMoney(d.proposedRent)} per month`)

  // 4.6 — effective date
  labelField('4.6', fmtDateShort(d.effectiveDate))

  y += 8

  // 4.7 — Charges table
  doc.save().font('Helvetica-Bold').fontSize(8.5).fillColor(BLACK)
    .text('4.7  Charges included in rent:', MARGIN, y).restore()
  y += 14

  const CHARGES = [
    'Council tax',
    'Water charges',
    'Internet',
    'Utility bills',
    'Monthly cleaning',
  ]

  // Table header
  const c0x = MARGIN + 12
  const c1x = MARGIN + COL_W * 0.46
  const c2x = MARGIN + COL_W * 0.73
  const cW0 = COL_W * 0.44
  const cW1 = COL_W * 0.25
  const cW2 = COL_W * 0.25

  // Header row
  doc.save().fillColor('#1a1a1a').rect(MARGIN, y, COL_W, 18).fill().restore()
  doc.save().font('Helvetica-Bold').fontSize(7.5).fillColor('#fff')
    .text('Charge', c0x, y + 5, { width: cW0, lineBreak: false })
    .text('In existing rent', c1x, y + 5, { width: cW1, align: 'center', lineBreak: false })
    .text('In proposed new rent', c2x, y + 5, { width: cW2, align: 'center', lineBreak: false })
    .restore()
  y += 18

  for (let i = 0; i < CHARGES.length; i++) {
    const bg = i % 2 === 1 ? LIGHT : undefined
    if (bg) doc.save().fillColor(bg).rect(MARGIN, y, COL_W, 16).fill().restore()
    doc.save().font('Helvetica').fontSize(7.5).fillColor(BLACK)
      .text(CHARGES[i], c0x, y + 4, { width: cW0, lineBreak: false })
      .text('Included', c1x, y + 4, { width: cW1, align: 'center', lineBreak: false })
      .text('Included', c2x, y + 4, { width: cW2, align: 'center', lineBreak: false })
      .restore()
    rule(doc, MARGIN, y + 16, COL_W, '#ececec')
    y += 16
  }
  y += 14

  // Para 6 — what to do
  const p6 = `If you accept the proposed new rent, please update your standing order to ${fmtMoney(d.proposedRent)} per month before the starting date above. ` +
    `If you do not accept it, you may refer this notice to the First-tier Tribunal before the starting date — ` +
    `see the notes on page 2 for how to do this.`
  y = para(doc, p6, y, { size: 8.5 })

  // Signature block
  y += 6
  rule(doc, MARGIN, y, COL_W, '#bbb')
  y += 10

  doc.save().font('Helvetica').fontSize(8.5).fillColor(BLACK)
    .text('Signed: …………………………………………………………', MARGIN, y,   { continued: true })
    .text('  Landlord\'s Agent', { lineBreak: false })
    .restore()
  y += 20

  doc.save().font('Helvetica').fontSize(8.5).fillColor(BLACK)
    .text(`Date: ${ordinalDate(d.noticeServedDate)}`, MARGIN, y)
    .restore()
  y += 30

  drawFooter(doc, footerImg)

  // ─ PAGE 2: Statutory guidance notes ─────────────────────────────────────────
  doc.addPage()
  y = MARGIN

  function guidanceHeading(text: string) {
    doc.save().font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text(text, MARGIN, y).restore()
    y += 14
  }

  function guidanceNote(num: number, text: string) {
    const numStr = `${num}`
    const indent = 20
    doc.save().font('Helvetica-Bold').fontSize(7.5).fillColor(BLACK)
      .text(numStr, MARGIN, y, { width: indent - 4, lineBreak: false }).restore()
    const h = doc.heightOfString(text, { width: COL_W - indent, align: 'left' })
    doc.save().font('Helvetica').fontSize(7.5).fillColor(BLACK)
      .text(text, MARGIN + indent, y, { width: COL_W - indent, lineGap: 2 }).restore()
    y += Math.max(h, 10) + 6
  }

  doc.save().font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
    .text('Guidance notes — please read carefully', MARGIN, y, { width: COL_W }).restore()
  y += 20

  guidanceHeading('Guidance for tenants')
  guidanceNote(1, 'This notice proposes that you should pay a new rent from the date in Section 4.6. If you are in any doubt, seek advice from a citizens\' advice bureau, housing advice centre, law centre, or solicitor.')
  guidanceNote(2, 'If you accept the proposed new rent, please update your standing order. Also notify your local authority if you receive Housing Benefit, or the DWP if you claim Universal Credit.')
  guidanceNote(3, 'If you do not accept the proposed new rent, you may refer this notice to the First-tier Tribunal before the starting date. You must do this before the starting date in Section 4.6. You should notify your landlord or agent that you are doing so.')
  guidanceNote(4, 'To refer the notice to the tribunal, use form "Application referring a notice proposing a new rent under an Assured Periodic Tenancy" (available from the tribunal or a legal stationer). The fee is currently £47.')
  guidanceNote(5, 'The tribunal will consider your application and determine a market rent. It will take into account the condition and facilities of the property. The tribunal may set a rent that is higher, lower, or the same as the proposed new rent.')
  guidanceNote(6, 'You and the landlord/agent may also negotiate a lower rent in writing at any point after this notice is served. Any agreed figure must be lower than the amount in Section 4.5 and must be confirmed in writing.')

  y += 4
  rule(doc, MARGIN, y, COL_W)
  y += 10

  guidanceHeading('Guidance for landlords — completing this notice')
  guidanceNote(7, 'From 1 May 2026, a Section 13 notice is the only lawful way to increase rent during an assured periodic tenancy. Any rent review clause in a tenancy agreement no longer has effect.')
  guidanceNote(8, 'Use Form 4A for assured periodic tenancies of premises situated in England. Do not use this form if the property is in Wales, or for non-assured tenancies.')
  guidanceNote(9, 'The proposed new rent must not exceed the open market rent for the property. If the tenant refers the notice to the tribunal, the tribunal will cap the rent at the lower of your proposed figure or local market rate.')

  guidanceHeading('When the proposed new rent can start')
  guidanceNote(10, 'The starting date (Section 4.6) must meet three requirements:')

  const reqs = [
    'Minimum notice: at least two calendar months\' notice must be given before the proposed new rent takes effect.',
    '52-week gap: the start date must be at least 52 weeks after the start of the current tenancy (Section 4.2) and at least 52 weeks after the date of any last rent increase (Section 4.3).',
    'Start of period: the proposed new rent must start at the beginning of a period of the tenancy — i.e. on the same day of the month as the tenancy began (Mooney v Whiteland [2023] EWCA Civ 67). This may differ from the day on which rent is actually paid.',
  ]
  for (const req of reqs) {
    doc.save().font('Helvetica').fontSize(7.5).fillColor(BLACK)
      .text(`—  ${req}`, MARGIN + 16, y, { width: COL_W - 16, lineGap: 2 })
      .restore()
    y += doc.heightOfString(req, { width: COL_W - 32 }) + 8
  }

  guidanceNote(11, 'For periodic tenancies with a rental period of less than one month (e.g. weekly), the 53-week rule may apply — see the NRLA completion notes for details. This form is unlikely to apply to such tenancies in Capital Rooms\' portfolio.')
  guidanceNote(12, 'Section 4.7: enter the amount of each fixed charge payable by the tenant that is included in the rent. If the tenant pays bills directly, enter "Nil". If no charges are included, enter "Nil" in all boxes.')
  guidanceNote(13, 'The notice must be signed by the landlord, a joint landlord acting on behalf of all, or the landlord\'s authorised agent. If the landlord is a company, the signatory should state their position within the company.')

  drawFooter(doc, b64(FOOTER_STRIP_B64))
  return finish()
}

// ── Date validation helpers (exported for use in API/UI) ──────────────────────

export interface ValidationResult {
  valid: boolean
  errors: string[]
  earliestValidDate: string   // ISO date — earliest date that passes all three checks
}

/**
 * Validates a proposed effective date for a Section 13 notice.
 *
 * Rules (Housing Act 1988 s.13(2), post-Renters' Rights Act 2025):
 *   1. At least 2 calendar months from serveDate
 *   2. At least 52 weeks (364 days) from tenancyStartDate AND lastS13EffectiveDate
 *   3. Day-of-month must equal day(tenancyStartDate) — start of rental period
 */
export function validateEffectiveDate(opts: {
  proposedDate:       string        // ISO date — what admin entered
  serveDate:          string        // ISO date — today / date of service
  tenancyStartDate:   string        // ISO date
  lastS13EffectiveDate: string | null  // ISO date or null
}): ValidationResult {
  const { proposedDate, serveDate, tenancyStartDate, lastS13EffectiveDate } = opts
  const errors: string[] = []

  const proposed   = new Date(proposedDate   + 'T00:00:00')
  const served     = new Date(serveDate       + 'T00:00:00')
  const started    = new Date(tenancyStartDate + 'T00:00:00')
  const lastS13    = lastS13EffectiveDate ? new Date(lastS13EffectiveDate + 'T00:00:00') : null

  const periodDay  = started.getDate()   // day of month that each period starts

  // ── Rule 1: 2-month minimum notice ──
  const twoMonthsLater = new Date(served)
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2)
  if (proposed < twoMonthsLater) {
    errors.push(
      `Minimum 2 months' notice required. Earliest notice-period end: ${twoMonthsLater.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    )
  }

  // ── Rule 2: 52-week gap ──
  const ms52w = 364 * 24 * 60 * 60 * 1000
  const earliest52FromStart = new Date(started.getTime() + ms52w)
  if (proposed < earliest52FromStart) {
    errors.push(
      `The new rent cannot start until at least 52 weeks after the tenancy start date (${tenancyStartDate}). ` +
      `Earliest: ${earliest52FromStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    )
  }
  if (lastS13) {
    const earliest52FromLast = new Date(lastS13.getTime() + ms52w)
    if (proposed < earliest52FromLast) {
      errors.push(
        `The new rent cannot start until at least 52 weeks after the last Section 13 increase (${lastS13EffectiveDate}). ` +
        `Earliest: ${earliest52FromLast.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
      )
    }
  }

  // ── Rule 3: Must be start of a rental period ──
  if (proposed.getDate() !== periodDay) {
    errors.push(
      `The new rent must start at the beginning of a rental period — the ${periodDay}${periodDay === 1 ? 'st' : periodDay === 2 ? 'nd' : periodDay === 3 ? 'rd' : 'th'} of the month ` +
      `(the same day as the tenancy began). You entered the ${proposed.getDate()}${proposed.getDate() === 1 ? 'st' : proposed.getDate() === 2 ? 'nd' : proposed.getDate() === 3 ? 'rd' : 'th'}.`
    )
  }

  // ── Compute earliest valid date ──
  // Start from the later of (served + 2 months) and (tenancyStart + 52 weeks) and (lastS13 + 52 weeks)
  let earliest = twoMonthsLater
  if (earliest52FromStart > earliest) earliest = earliest52FromStart
  if (lastS13) {
    const e = new Date(lastS13.getTime() + ms52w)
    if (e > earliest) earliest = e
  }
  // Round up to next occurrence of periodDay
  let ev = new Date(earliest)
  if (ev.getDate() > periodDay) {
    // Roll forward to next month
    ev.setMonth(ev.getMonth() + 1)
  }
  ev.setDate(periodDay)
  // If that month doesn't have that day (e.g. 31 in a 30-day month), roll forward
  if (ev.getDate() !== periodDay) {
    ev = new Date(earliest)
    ev.setMonth(ev.getMonth() + 2, periodDay)
  }

  const earliestValidDate = ev.toISOString().slice(0, 10)

  return { valid: errors.length === 0, errors, earliestValidDate }
}

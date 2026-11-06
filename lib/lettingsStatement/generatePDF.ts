// Capital Rooms — Lettings Statement PDF Generator
// Redesigned 4 Nov 2026 (Harry: "lettings statement is very boring compared to what we have been making") in the
// modern statement's style (lib/statements/modernPdf): one big figure for what's due to the landlord, the new tenant on a
// card (age, occupation, contact — what landlords like Nigel ask for), the money as tiles and one "how it adds up" line,
// then where it's paid. Same sums as before: deposit + rent in advance − letting fee; the holding deposit is part of the deposit.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

import {
  loadPDFLetterheadAssets,
  PAGE_W, PAGE_H, MARGIN,
  FOOTER_BAND_H, LOGO_W, LOGO_H,

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
  tenantDob?: string         // ISO — shown as their age
  tenantOccupation?: string
  tenantEmployer?: string
  unitCode?: string          // 095ROS01 — on the statement and in its file name

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
  paidOn?: string            // ISO — the landlord has been paid (initial monies, migration 231)

  // Statement date
  statementDate?: string    // ISO, defaults to today

  bizSettings?: PDFBizSettings
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtGBP(n: number | null | undefined) {
  return `£${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

// two colours and their neutrals (4 Nov 2026, Harry: "too many colours … i like two or three"): Forest for the figures
// and headings, brand gold only for the small labels and one rule; everything else ink, grey and hairlines
const INK = '#132219', MUTED = '#5C6B62', LINE = '#DCE2DC', TINT = '#F3F5F2', FOREST = '#1F3B2E', GOLD = '#B8862A'

function ageOf(iso?: string): number | null {
  if (!iso) return null
  const b = new Date(`${iso.slice(0, 10)}T12:00:00Z`), n = new Date()
  if (isNaN(b.getTime())) return null
  let a = n.getUTCFullYear() - b.getUTCFullYear()
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--
  return a > 0 && a < 120 ? a : null
}

/** "095ROS01 - Lettings Statement - Mr Ziqing Wang.pdf" — the way Capital Rooms files them */
export function lettingsStatementFileName(d: Pick<LettingsStatementData, 'unitCode' | 'paymentReference' | 'tenantSalutation' | 'tenantFirstName' | 'tenantLastName'>): string {
  const who = [d.tenantSalutation, d.tenantFirstName, d.tenantLastName].filter(Boolean).join(' ')
  const code = d.paymentReference || d.unitCode || ''   // the reference the landlord sees on the payment, as Capital Rooms files them
  return [code, 'Lettings Statement', who].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() + '.pdf'
}

/** The statement's sums — the PDF and the landlord's email (lib/landlordUpdates/email) show the same figures. */
export function lettingsSums(data: Pick<LettingsStatementData, 'depositWeeks' | 'rentInAdvance' | 'lettingFeeFlat' | 'lettingFeePct' | 'lettingFeeLabel' | 'rentAmount' | 'depositAmount' | 'holdingDepositReceived'>) {
  const depositWeeks = data.depositWeeks ?? 5
  const rentMonths = data.rentInAdvance ?? 1
  let feeAmount = 0, feeLabel = ''
  if (data.lettingFeeFlat) { feeAmount = data.lettingFeeFlat; feeLabel = `Flat fee` }
  else if (data.lettingFeePct) {
    feeAmount = Math.round((data.rentAmount * data.lettingFeePct / 100) * 100) / 100
    feeLabel = `${data.lettingFeeLabel ?? `${pctToFraction(data.lettingFeePct)} of the monthly rent`}`
  }
  // Harry, 17 Oct 2026: "all we take from Nigel is a fee off the rent, the holding deposit is part of the deposit"
  const rentIn = data.rentAmount * rentMonths
  const holdingPaid = data.holdingDepositReceived ?? 0
  const due = data.depositAmount + rentIn - feeAmount
  return { depositWeeks, rentMonths, feeAmount, feeLabel, rentIn, holdingPaid, due }
}

export async function generateLettingsStatementPDF(data: LettingsStatementData): Promise<Buffer> {
  const assets = await loadPDFLetterheadAssets()
  const R = assets.fontReg, B = assets.fontBold, D = assets.fontDisplay
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: lettingsStatementFileName(data).replace(/\.pdf$/, ''), Author: 'Capital Rooms' } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const COL_W = PAGE_W - MARGIN * 2
  const decorate = () => {
    if (assets.logoImg.length) doc.image(assets.logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
    drawPDFFooter(doc, assets.footerImg, data.bizSettings, R)
  }
  decorate()
  doc.on('pageAdded', decorate)
  const bottom = PAGE_H - FOOTER_BAND_H - 30

  // ── the sums (unchanged — lettingsSums, shared with the landlord's email) ─
  const { depositWeeks, rentMonths, feeAmount, feeLabel, rentIn, holdingPaid, due } = lettingsSums(data)
  const paid = data.paidOn ? fmtDate(`${data.paidOn}T12:00:00`) : null

  // ── heading: the room and street, then the statement's particulars in one quiet line ──────────────
  const start = fmtDate(`${data.startDate.slice(0, 10)}T12:00:00`)
  const ref = data.paymentReference || data.unitCode
  let y = MARGIN + 4
  doc.font(B).fontSize(8.5).fillColor(GOLD).text('LETTINGS STATEMENT', MARGIN, y, { characterSpacing: 1.4 })
  y = doc.y + 6
  const [street, ...rest] = data.propertyAddress.split(/,\s*/)
  const place = /^whole/i.test(data.roomName) || !data.roomName ? street : `${data.roomName}, ${street}`
  doc.font(D).fontSize(24).fillColor(FOREST).text(place, MARGIN, y, { width: COL_W - LOGO_W - 30 })
  y = doc.y + 1
  if (rest.length) { doc.font(R).fontSize(11).fillColor(INK).text(rest.join(', '), MARGIN, y, { width: COL_W - LOGO_W - 30 }); y = doc.y + 8 }
  doc.font(R).fontSize(8.5).fillColor(MUTED).text([`Statement date ${fmtDate(data.statementDate)}`, ref ? `Reference ${ref}` : null].filter(Boolean).join('   ·   '), MARGIN, y, { width: COL_W - LOGO_W - 30 })
  y = doc.y + 12
  doc.font(R).fontSize(9.5).fillColor(INK).text([data.landlordName, ...data.landlordAddress.split('\n').filter(Boolean)].join('\n'), MARGIN, y, { width: 260, lineGap: 1.5 })
  y = Math.max(doc.y, MARGIN + LOGO_H) + 16

  // ── the balance ──────────────────────────────────────────────────────────
  const heroH = 64
  doc.save().roundedRect(MARGIN, y, COL_W, heroH, 10).fill(FOREST).restore()
  doc.font(B).fontSize(8.5).fillColor('#C9D6CD').text(paid ? 'AMOUNT PAID TO YOU' : 'BALANCE DUE TO YOU', MARGIN + 22, y + 15, { characterSpacing: 1.2 })
  doc.font(D).fontSize(26).fillColor('#FFFFFF').text(fmtGBP(due), MARGIN + 22, y + 27)
  const digits = String(data.bankAccountNumber ?? '').replace(/\D/g, '')   // only real digits — never a garbled value
  const acct = digits.length >= 6 ? digits.slice(-4) : ''
  const lines = [paid ? `Paid on ${paid}` : 'To be paid by bank transfer', acct ? `To the account ending ${acct}` : null].filter(Boolean) as string[]
  doc.font(R).fontSize(9).fillColor('#E3EAE5').text(lines.join('\n'), MARGIN + COL_W - 232, y + 21, { width: 210, align: 'right', lineGap: 3 })
  y += heroH + 18

  const heading = (t: string) => {
    doc.font(B).fontSize(8.5).fillColor(GOLD).text(t.toUpperCase(), MARGIN, y, { characterSpacing: 1.2 })
    y = doc.y + 6
    doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.8).strokeColor(FOREST).stroke().restore()
    y += 4
  }
  const row = (k: string, v: string, o: { sub?: string; bold?: boolean; last?: boolean } = {}) => {
    const h = o.sub ? 32 : 22
    doc.font(o.bold ? B : R).fontSize(10).fillColor(INK).text(k, MARGIN, y + 7, { width: COL_W - 160 })
    if (o.sub) doc.font(R).fontSize(8.5).fillColor(MUTED).text(o.sub, MARGIN, y + 19, { width: COL_W - 160 })
    doc.font(o.bold ? D : R).fontSize(o.bold ? 12 : 10).fillColor(o.bold ? FOREST : INK).text(v, MARGIN + COL_W - 150, y + (o.bold ? 5 : 7), { width: 150, align: 'right' })
    y += h
    if (!o.last) doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.5).strokeColor(LINE).stroke().restore()
  }

  // ── statement: money in, the fee, the balance ────────────────────────────
  heading('Statement')
  row('Deposit received', fmtGBP(data.depositAmount), { sub: `${depositWeeks} weeks’ rent${holdingPaid > 0 ? ` · includes the ${fmtGBP(holdingPaid)} holding deposit paid to reserve the ${/^whole/i.test(data.roomName) ? 'property' : 'room'}` : ''}` })
  row('Rent received', fmtGBP(rentIn), { sub: rentMonths === 1 ? 'One month in advance' : `${rentMonths} months in advance` })
  if (feeAmount > 0) row('Less letting fee', `−${fmtGBP(feeAmount)}`, { sub: feeLabel })
  doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.8).strokeColor(FOREST).stroke().restore()
  row(paid ? 'Amount paid to you' : 'Balance due to you', fmtGBP(due), { bold: true, last: true })
  y += 14

  // ── tenant details ────────────────────────────────────────────────────────
  const tenantName = [data.tenantSalutation, data.tenantFirstName, data.tenantLastName].filter(Boolean).join(' ')
  const age = ageOf(data.tenantDob)
  const work = [data.tenantOccupation, data.tenantEmployer ? `at ${data.tenantEmployer}` : null].filter(Boolean).join(' ')
  const facts: [string, string][] = [
    ['Tenant', tenantName || '—'],
    ...(age ? [['Age', String(age)] as [string, string]] : []),
    ...(work ? [['Occupation', work] as [string, string]] : []),
    ...(data.tenantPhone ? [['Telephone', data.tenantPhone] as [string, string]] : []),
    ...(data.tenantEmail ? [['Email', data.tenantEmail] as [string, string]] : []),
    ['Tenancy start date', start],
    ['Rent', `${fmtGBP(data.rentAmount)} per month`],
  ]
  if (y > bottom - (facts.length / 2) * 27 - 30) { doc.addPage(); y = MARGIN + LOGO_H + 20 }
  heading('Tenant details')
  const half = COL_W / 2
  const fy = y
  facts.forEach(([k, v], i) => {
    const x = MARGIN + (i % 2) * half, yy = fy + Math.floor(i / 2) * 27 + 5
    doc.font(R).fontSize(8).fillColor(MUTED).text(k, x, yy)
    doc.font(B).fontSize(10).fillColor(INK).text(v, x, yy + 11, { width: half - 16, lineBreak: false, ellipsis: true })
  })
  y = fy + Math.ceil(facts.length / 2) * 27 + 14

  // ── payment details ──────────────────────────────────────────────────────
  const bank: [string, string][] = [
    ['Account name', data.bankAccountName],
    ...(data.bankName ? [['Bank', data.bankName] as [string, string]] : []),
    ...(data.bankSortCode ? [['Sort code', String(data.bankSortCode)] as [string, string]] : []),
    ...(data.bankAccountNumber ? [['Account number', String(data.bankAccountNumber)] as [string, string]] : []),
    ...(data.paymentReference ? [['Payment reference', data.paymentReference] as [string, string]] : []),
  ]
  if (y > bottom - bank.length * 22 - 40) { doc.addPage(); y = MARGIN + LOGO_H + 20 }
  heading(paid ? `Payment made ${paid}` : 'Payment details')
  doc.save().roundedRect(MARGIN, y + 4, COL_W, bank.length * 22 + 12, 8).fill(TINT).restore()
  y += 10
  for (const [k, v] of bank) {
    doc.font(R).fontSize(9.5).fillColor(MUTED).text(k, MARGIN + 16, y + 5, { width: 140 })
    doc.font(B).fontSize(10).fillColor(INK).text(v, MARGIN + 170, y + 5, { width: COL_W - 186 })
    y += 22
  }

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.font(R).fontSize(7.5).fillColor(MUTED).text(`${lettingsStatementFileName(data).replace(/\.pdf$/, '')} · page ${i + 1} of ${range.count}`, MARGIN, PAGE_H - FOOTER_BAND_H - 16, { width: COL_W, align: 'right', lineBreak: false })
  }
  doc.end()
  return new Promise<Buffer>(resolve => { doc.on('end', () => resolve(Buffer.concat(chunks))) })
}

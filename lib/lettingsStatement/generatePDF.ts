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

const INK = '#132219', MUTED = '#5C6B62', LINE = '#E1E6E0', TILE = '#F1F3EF', FOREST = '#1F3B2E', GOLD = '#C4922A'

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
  const code = d.unitCode || d.paymentReference || ''
  return [code, 'Lettings Statement', who].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() + '.pdf'
}

export async function generateLettingsStatementPDF(data: LettingsStatementData): Promise<Buffer> {
  const assets = await loadPDFLetterheadAssets()
  const R = assets.fontReg, B = assets.fontBold
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

  // ── the sums (unchanged) ─────────────────────────────────────────────────
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
  const totalIn = data.depositAmount + rentIn
  const holdingPaid = data.holdingDepositReceived ?? 0
  const due = totalIn - feeAmount
  const paid = data.paidOn ? fmtDate(`${data.paidOn}T12:00:00`) : null

  // ── heading: the room and street lead ───────────────────────────────────
  let y = MARGIN + 4
  doc.font(B).fontSize(8.5).fillColor(MUTED).text(`LETTINGS STATEMENT  ·  ${fmtDate(data.statementDate).toUpperCase()}`, MARGIN, y, { characterSpacing: 1.2 })
  y = doc.y + 6
  const [street, ...rest] = data.propertyAddress.split(/,\s*/)
  const place = /^whole/i.test(data.roomName) || !data.roomName ? street : `${data.roomName}, ${street}`
  doc.font(B).fontSize(24).fillColor(INK).text(place, MARGIN, y, { width: COL_W - LOGO_W - 30 })
  y = doc.y + 1
  if (rest.length) { doc.font(R).fontSize(12).fillColor(INK).text(rest.join(', '), MARGIN, y, { width: COL_W - LOGO_W - 30 }); y = doc.y + 6 }
  const chips = [data.unitCode, `New tenancy from ${fmtDate(`${data.startDate.slice(0, 10)}T12:00:00`)}`].filter(Boolean) as string[]
  let cx = MARGIN
  for (const c of chips) {
    doc.font(B).fontSize(8)
    const w = doc.widthOfString(c) + 14
    doc.save().roundedRect(cx, y, w, 16, 8).fill(TILE).restore()
    doc.font(B).fontSize(8).fillColor(INK).text(c, cx + 7, y + 4.5, { lineBreak: false })
    cx += w + 6
  }
  y += 26
  doc.font(R).fontSize(9).fillColor(MUTED).text([data.landlordName, ...data.landlordAddress.split('\n').filter(Boolean)].join('\n'), MARGIN, y, { width: 260, lineGap: 1 })
  y = Math.max(doc.y, MARGIN + LOGO_H) + 18

  // ── hero: what's due to the landlord ────────────────────────────────────
  const heroH = 80
  doc.save().roundedRect(MARGIN, y, COL_W, heroH, 12).fill(FOREST).restore()
  doc.font(R).fontSize(9.5).fillColor('#C9D6CD').text(paid ? 'Paid to you' : 'Due to you', MARGIN + 22, y + 16)
  doc.font(B).fontSize(30).fillColor('#FFFFFF').text(fmtGBP(due), MARGIN + 22, y + 30)
  const acct = data.bankAccountNumber ? String(data.bankAccountNumber).replace(/\s/g, '').slice(-4) : ''
  const lines = [paid ? `Paid on ${paid}` : 'To be paid to you', acct ? `To account ending ${acct}` : null, data.paymentReference ? `Reference ${data.paymentReference}` : null].filter(Boolean) as string[]
  doc.font(R).fontSize(9).fillColor('#E8EEE9').text(lines.join('\n'), MARGIN + COL_W - 232, y + 21, { width: 210, align: 'right', lineGap: 3 })
  y += heroH + 14

  // ── your new tenant ─────────────────────────────────────────────────────
  const tenantName = [data.tenantSalutation, data.tenantFirstName, data.tenantLastName].filter(Boolean).join(' ')
  const age = ageOf(data.tenantDob)
  const about = [age ? `Age ${age}` : null, data.tenantOccupation, data.tenantEmployer ? `at ${data.tenantEmployer}` : null].filter(Boolean).join(' · ')
  const facts: [string, string][] = [
    ...(data.tenantPhone ? [['Phone', data.tenantPhone] as [string, string]] : []),
    ...(data.tenantEmail ? [['Email', data.tenantEmail] as [string, string]] : []),
    ['Moves in', fmtDate(`${data.startDate.slice(0, 10)}T12:00:00`)],
    ['Rent', `${fmtGBP(data.rentAmount)} a month`],
    ['Deposit', `${fmtGBP(data.depositAmount)} (${depositWeeks} weeks)`],
  ]
  const cardH = 30 + (about ? 16 : 0) + Math.ceil(facts.length / 2) * 30 + 12
  doc.save().roundedRect(MARGIN, y, COL_W, cardH, 12).fill(TILE).restore()
  doc.font(B).fontSize(8).fillColor(MUTED).text('YOUR NEW TENANT', MARGIN + 20, y + 14, { characterSpacing: 1 })
  doc.font(B).fontSize(15).fillColor(INK).text(tenantName || 'Tenant', MARGIN + 20, y + 26)
  let fy = y + 46
  if (about) { doc.font(R).fontSize(10).fillColor(INK).text(about, MARGIN + 20, fy - 1); fy += 16 }
  const half = (COL_W - 40) / 2
  facts.forEach(([k, v], i) => {
    const x = MARGIN + 20 + (i % 2) * half, yy = fy + Math.floor(i / 2) * 30 + 4
    doc.font(R).fontSize(8).fillColor(MUTED).text(k, x, yy)
    doc.font(B).fontSize(10).fillColor(INK).text(v, x, yy + 11, { width: half - 12, lineBreak: false, ellipsis: true })
  })
  y += cardH + 14

  // ── the money as tiles ──────────────────────────────────────────────────
  const tiles: [string, string, string, string][] = [
    ['Deposit received', `${depositWeeks} weeks`, fmtGBP(data.depositAmount), INK],
    ['Rent received', rentMonths === 1 ? 'One month in advance' : `${rentMonths} months in advance`, fmtGBP(rentIn), INK],
    ...(feeAmount > 0 ? [['Our letting fee', feeLabel, `−${fmtGBP(feeAmount)}`, '#A3301F'] as [string, string, string, string]] : []),
  ]
  const gap = 8, tw = (COL_W - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach(([label, sub, v, col], i) => {
    const x = MARGIN + i * (tw + gap)
    doc.save().roundedRect(x, y, tw, 62, 10).lineWidth(0.8).strokeColor(LINE).stroke().restore()
    doc.font(R).fontSize(8.5).fillColor(MUTED).text(label, x + 12, y + 10, { width: tw - 24 })
    doc.font(B).fontSize(15).fillColor(col).text(v, x + 12, y + 23, { width: tw - 24 })
    doc.font(R).fontSize(8).fillColor(MUTED).text(sub, x + 12, y + 44, { width: tw - 24, lineBreak: false, ellipsis: true })
  })
  y += 62 + 12

  // ── how it adds up ──────────────────────────────────────────────────────
  const parts = [`${fmtGBP(data.depositAmount)} deposit`, `+ ${fmtGBP(rentIn)} rent`, ...(feeAmount > 0 ? [`− ${fmtGBP(feeAmount)} letting fee`] : [])]
  doc.save().roundedRect(MARGIN, y, COL_W, holdingPaid > 0 ? 50 : 38, 10).fill(TILE).restore()
  doc.font(R).fontSize(10).fillColor(INK).text(`${parts.join('  ')}  =  `, MARGIN + 16, y + 13, { continued: true }).font(B).fillColor(GOLD).text(`${fmtGBP(due)} ${paid ? 'paid' : 'due'} to you`)
  if (holdingPaid > 0) doc.font(R).fontSize(8.5).fillColor(MUTED).text(`The ${fmtGBP(holdingPaid)} holding deposit ${data.tenantFirstName || 'the tenant'} paid to reserve the ${/^whole/i.test(data.roomName) ? 'property' : 'room'} is part of the deposit above.`, MARGIN + 16, y + 31, { width: COL_W - 32 })
  y += (holdingPaid > 0 ? 50 : 38) + 18

  // ── where it's paid ─────────────────────────────────────────────────────
  if (y > bottom - 110) { doc.addPage(); y = MARGIN + LOGO_H + 20 }
  doc.font(B).fontSize(13).fillColor(INK).text(paid ? `Paid on ${paid} to` : 'Paid to', MARGIN, y)
  y = doc.y + 8
  const bank: [string, string][] = [
    ['Name', data.bankAccountName],
    ...(data.bankName ? [['Bank', data.bankName] as [string, string]] : []),
    ...(data.bankAccountNumber ? [['Account', String(data.bankAccountNumber)] as [string, string]] : []),
    ...(data.bankSortCode ? [['Sort code', String(data.bankSortCode)] as [string, string]] : []),
    ...(data.paymentReference ? [['Reference', data.paymentReference] as [string, string]] : []),
  ]
  for (const [k, v] of bank) {
    doc.font(R).fontSize(9.5).fillColor(MUTED).text(k, MARGIN, y + 4, { width: 110 })
    doc.font(B).fontSize(9.5).fillColor(INK).text(v, MARGIN + 110, y + 4, { width: COL_W - 110 })
    y += 20
    doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.5).strokeColor(LINE).stroke().restore()
  }

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.font(R).fontSize(7.5).fillColor(MUTED).text(`${lettingsStatementFileName(data).replace(/\.pdf$/, '')} · page ${i + 1} of ${range.count}`, MARGIN, PAGE_H - FOOTER_BAND_H - 16, { width: COL_W, align: 'right', lineBreak: false })
  }
  doc.end()
  return new Promise<Buffer>(resolve => { doc.on('end', () => resolve(Buffer.concat(chunks))) })
}

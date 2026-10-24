/**
 * Check-in balance — the spruced-up design (15 Oct 2026, Harry: "a bit boring maybe you could show it spruced up
 * slightly? then we use as the default"). Same house look as every money document (Lato, logo top right, black and
 * greys, accreditation footer) with the essentials first: one black "amount to pay" panel with the pay-by date and
 * reference, an at-a-glance row, how the figure is made up, how to pay, and what happens next.
 * Same figures as before — the first rent comes from lib/tenancy/firstRent, so it always matches the agreement.
 */
import {
  loadPDFLetterheadAssets, drawPDFFooter, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H, BLACK, GREY,
  PDF_BIZ_DEFAULTS,
} from '@/lib/pdfLetterhead'
import { money } from '@/lib/invoices/invoiceDocument'
import { firstRentPayment } from '@/lib/tenancy/firstRent'
import type { CheckInBalanceData } from '@/lib/checkInBalance/generatePDF'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

const W = PAGE_W - MARGIN * 2
const LIGHT = '#8a8a8a', RULE = '#dedede', PANEL = '#f4f4f4'
const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const dayShort = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
const parseDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const joinNames = (n: string[]) => n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`

export async function generateMoveInStatement(data: CheckInBalanceData): Promise<Buffer> {
  // ── figures (unchanged from the previous design) ──
  const start = parseDate(data.startDate)
  const dueDay = data.rentDueDay ?? (data.rentMode === 'prorata' ? 1 : start.getDate())
  const first = firstRentPayment(start, data.rentMonthly, dueDay)
  const proRata = !!first && !first.full && (data.rentMode === 'prorata' || data.rentDueDay != null)
  const rentAmount = proRata ? (data.proRataAmount ?? first!.amount) : data.rentMonthly
  const periodEnd = first?.to ?? new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1)
  const nextDue = first?.nextDue ?? new Date(periodEnd.getTime() + 86_400_000)
  const subtotal = rentAmount + data.depositAmount
  const amountDue = subtotal - data.holdingDeposit
  const payBy = new Date(start.getTime() - 86_400_000)
  const biz = data.bizSettings ?? PDF_BIZ_DEFAULTS

  const assets = loadPDFLetterheadAssets()
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN }, info: { Title: `Check-in balance — ${data.propertyAddress}`, Author: 'Capital Rooms Ltd' } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej) })
  const R = assets.fontReg, B = assets.fontBold
  const label = (t: string, x: number, y: number, w: number, color = LIGHT, align: 'left' | 'right' | 'center' = 'left') =>
    doc.font(B).fontSize(7).fillColor(color).text(t.toUpperCase(), x, y, { width: w, characterSpacing: 1.3, align })

  // ── header ──
  if (assets.logoImg.length) doc.image(assets.logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN - 6, { width: LOGO_W, height: LOGO_H })
  let y = MARGIN + 2
  label('Check-in balance', MARGIN, y, W * 0.6, GREY)
  doc.font(B).fontSize(21).fillColor(BLACK).text('Your move-in balance', MARGIN, y + 14, { width: W * 0.62 })
  y = doc.y + 6
  doc.font(B).fontSize(10.5).fillColor(BLACK).text(data.propertyAddress, MARGIN, y, { width: W * 0.62, lineGap: 1 })
  y = doc.y + 3
  doc.font(R).fontSize(9).fillColor(GREY).text(`Prepared for ${joinNames(data.tenantNames)} · ${day(new Date())}`, MARGIN, y, { width: W * 0.62 })
  y = Math.max(doc.y, MARGIN + LOGO_H) + 22

  // ── the black panel: what to pay, by when, with which reference ──
  const heroH = 84
  doc.save().roundedRect(MARGIN, y, W, heroH, 6).fill(BLACK).restore()
  label('Amount to pay', MARGIN + 20, y + 18, 200, '#bdbdbd')
  doc.font(B).fontSize(30).fillColor('#ffffff').text(money(amountDue), MARGIN + 20, y + 32, { width: W * 0.5 })
  const hx = MARGIN + W * 0.56
  doc.save().strokeColor('#4a4a4a').lineWidth(0.8).moveTo(hx - 18, y + 16).lineTo(hx - 18, y + heroH - 16).stroke().restore()
  label('Pay by', hx, y + 18, W * 0.4, '#bdbdbd')
  doc.font(B).fontSize(12).fillColor('#ffffff').text(day(payBy), hx, y + 29, { width: W * 0.42 })
  label('Quote this reference', hx, y + 50, W * 0.4, '#bdbdbd')
  doc.font(B).fontSize(12).fillColor('#ffffff').text(data.paymentRef, hx, y + 61, { width: W * 0.42, characterSpacing: 0.6 })
  y += heroH + 18

  // ── at a glance ──
  const cells: [string, string, string?][] = [
    ['Move-in', day(start)],
    ['Monthly rent', money(data.rentMonthly)],
    ['Rent day', `${ordinal(dueDay)} of each month`],
    ['Deposit', money(data.depositAmount), 'Protected with the DPS'],
  ]
  const cw = W / cells.length
  doc.save().strokeColor(RULE).lineWidth(0.6).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke()
    .moveTo(MARGIN, y + 54).lineTo(PAGE_W - MARGIN, y + 54).stroke().restore()
  cells.forEach(([k, v, sub], i) => {
    const x = MARGIN + i * cw + (i ? 14 : 0)
    if (i) doc.save().strokeColor(RULE).lineWidth(0.6).moveTo(MARGIN + i * cw, y + 10).lineTo(MARGIN + i * cw, y + 44).stroke().restore()
    label(k, x, y + 11, cw - 16)
    doc.font(B).fontSize(11).fillColor(BLACK).text(v, x, y + 23, { width: cw - 16 })
    if (sub) doc.font(R).fontSize(7.5).fillColor(GREY).text(sub, x, y + 38, { width: cw - 16 })
  })
  y += 54 + 22

  // ── how the figure is made up ──
  doc.font(B).fontSize(10.5).fillColor(BLACK).text('How it’s made up', MARGIN, y)
  y = doc.y + 8
  const row = (desc: string, detail: string | null, amount: string, o: { bold?: boolean; muted?: boolean; rule?: 'thin' | 'thick' } = {}) => {
    const h = detail ? 34 : 24
    if (o.rule) doc.save().strokeColor(o.rule === 'thick' ? BLACK : RULE).lineWidth(o.rule === 'thick' ? 1.1 : 0.6).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore()
    doc.font(o.bold ? B : R).fontSize(9.5).fillColor(o.muted ? GREY : BLACK).text(desc, MARGIN, y + 7, { width: W * 0.7 })
    if (detail) doc.font(R).fontSize(8).fillColor(GREY).text(detail, MARGIN, y + 20, { width: W * 0.7 })
    doc.font(o.bold ? B : R).fontSize(9.5).fillColor(o.muted ? GREY : BLACK).text(amount, MARGIN + W * 0.7, y + 7, { width: W * 0.3, align: 'right' })
    y += h
  }
  row(proRata ? 'First rent — part month' : 'First month’s rent', `${day(start)} to ${day(periodEnd)}${proRata ? ` · ${first!.days} days at ${money(first!.dailyRate)} a day` : ''}`, money(rentAmount), { rule: 'thin' })
  row('Security deposit', 'Held by Capital Rooms and protected with the Deposit Protection Service', money(data.depositAmount), { rule: 'thin' })
  if (data.holdingDeposit > 0) {
    row('Holding deposit already paid', 'Counted towards your first payment', `– ${money(data.holdingDeposit)}`, { rule: 'thin', muted: true })
  }
  row('Amount to pay', null, money(amountDue), { bold: true, rule: 'thick' })
  y += 18

  // ── how to pay (left) · what happens next (right) ──
  const colGap = 18, lw = W * 0.5 - colGap / 2, rx = MARGIN + lw + colGap, rw = W - lw - colGap
  const bank: [string, string][] = [
    ['Account name', data.bankName], ['Sort code', data.sortCode], ['Account number', data.accountNo],
    ['Reference', data.paymentRef], ...(data.iban ? [['IBAN', data.iban] as [string, string]] : []), ...(data.swift ? [['SWIFT / BIC', data.swift] as [string, string]] : []),
  ]
  const boxH = 40 + bank.length * 15 + 34
  doc.save().roundedRect(MARGIN, y, lw, boxH, 5).fill(PANEL).restore()
  doc.font(B).fontSize(10.5).fillColor(BLACK).text('How to pay', MARGIN + 16, y + 14)
  bank.forEach(([k, v], i) => {
    const ry = y + 36 + i * 15
    doc.font(R).fontSize(8.5).fillColor(GREY).text(k, MARGIN + 16, ry, { width: 78 })
    doc.font(B).fontSize(8.5).fillColor(BLACK).text(v, MARGIN + 96, ry, { width: lw - 108, lineBreak: false })
  })
  doc.font(R).fontSize(7.8).fillColor(GREY).text('One bank transfer for the full amount, quoting the reference.', MARGIN + 16, y + 40 + bank.length * 15, { width: lw - 32, lineGap: 1 })

  doc.font(B).fontSize(10.5).fillColor(BLACK).text('What happens next', rx, y + 14)
  const steps: [string, string][] = [
    [`Pay by ${dayShort(payBy)}`, `${money(amountDue)} in cleared funds, at least 24 hours before you move in.`],
    [`Move in ${dayShort(start)}`, 'Collect your keys and check the inventory with us.'],
    [`Rent from ${dayShort(nextDue)}`, `${money(data.rentMonthly)} on the ${ordinal(dueDay)} of each month — same account, same reference.`],
  ]
  let sy = y + 38
  steps.forEach(([t, s], i) => {
    const cx = rx + 9, cy = sy + 8
    if (i < steps.length - 1) doc.save().strokeColor(RULE).lineWidth(1).moveTo(cx, cy + 9).lineTo(cx, cy + 40).stroke().restore()
    doc.save().circle(cx, cy, 8.5).fill(BLACK).restore()
    doc.font(B).fontSize(8.5).fillColor('#ffffff').text(String(i + 1), cx - 8.5, cy - 4.6, { width: 17, align: 'center' })
    doc.font(B).fontSize(9.5).fillColor(BLACK).text(t, rx + 26, sy, { width: rw - 26 })
    doc.font(R).fontSize(8.3).fillColor(GREY).text(s, rx + 26, doc.y + 1.5, { width: rw - 26, lineGap: 1 })
    sy += 44
  })

  // ── footer ──
  doc.font(R).fontSize(7.5).fillColor(LIGHT).text('Questions about this balance? Reply to our email or call us on ' + biz.phone + '.', MARGIN, PAGE_H - FOOTER_BAND_H - 26, { width: W, align: 'center' })
  const footer = (assets.footerImg.length ? Object.assign(doc.openImage(assets.footerImg), { length: assets.footerImg.length }) : assets.footerImg) as unknown as Buffer
  drawPDFFooter(doc, footer, biz, R)
  doc.end()
  return done
}

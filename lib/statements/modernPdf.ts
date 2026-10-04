// The landlord statement, redesigned (proposal, 29 Sep 2026): Capital Rooms letterhead with a clean, "bank app" layout —
// one big figure (what's paid to the landlord), a summary strip, then rent by room, fees and expenses, and a one-line
// "how it adds up". Built on the same letterhead assets as every other document (lib/pdfLetterhead).
import {
  loadPDFLetterheadAssets, drawPDFFooter, fetchPDFBizSettings, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H,
} from '@/lib/pdfLetterhead'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

export interface ModernStatement {
  reference: string; statementDate: string; periodLabel: string; paymentNo?: string | null; feeNo?: string | null
  landlordName: string; landlordAddress: string[]; property: string; propertyCode?: string | null; roomsCount?: number
  paidOn?: string | null; accountEnding?: string | null; paymentRef?: string | null
  rooms: { room: string; tenant: string; forPeriod: string; rent: number; fee: number; feeLabel: string; lettingFee?: number; note?: string }[]
  expenses: { number: string | null; date: string; description: string; supplier: string | null; amount: number; invoiceAttached?: boolean }[]
  floatRetained?: number; floatUsed?: number; floatBalance?: number
  stillOwed?: { room: string; tenant: string; amount: number }[]
  practice?: boolean   // a practice statement (XLS…, migration 209): marked on every page so it can't pass for a real one
}

const INK = '#141414', MUTED = '#6B6B6B', LINE = '#E4E2DE', TILE = '#F4F3F0', ACCENT = '#1F6F4A'
const COL_W = PAGE_W - MARGIN * 2
const gbp = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function renderModernStatement(d: ModernStatement): Promise<Buffer> {
  const assets = loadPDFLetterheadAssets()
  const biz = await fetchPDFBizSettings()
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN }, info: { Title: `Statement ${d.reference}`, Author: biz.company_name } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej) })
  const R = assets.fontReg, B = assets.fontBold
  const logo = assets.logoImg.length ? doc.openImage(assets.logoImg) : null
  const footer = (assets.footerImg.length ? Object.assign(doc.openImage(assets.footerImg), { length: assets.footerImg.length }) : assets.footerImg) as unknown as Buffer
  const bottom = PAGE_H - FOOTER_BAND_H - 36
  const decorate = () => { if (logo) doc.image(logo as never, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H }); drawPDFFooter(doc, footer, biz, R) }
  decorate()

  const rent = r2(d.rooms.reduce((t, r) => t + r.rent, 0))
  const fees = r2(d.rooms.reduce((t, r) => t + r.fee + (r.lettingFee ?? 0), 0))
  const exp = r2(d.expenses.reduce((t, e) => t + e.amount, 0))
  const fret = r2(d.floatRetained ?? 0), fuse = r2(d.floatUsed ?? 0)
  const net = r2(rent + fuse - fees - exp - fret)

  // ── Heading ─────────────────────────────────────────────────────────────
  // the property is the subject of the statement: it leads, big
  let y = MARGIN + 4
  doc.font(B).fontSize(8.5).fillColor(MUTED).text(`LANDLORD STATEMENT  ·  ${d.periodLabel.toUpperCase()}`, MARGIN, y, { characterSpacing: 1.2 })
  y = doc.y + 6
  const [street, ...restAddr] = d.property.split(/,\s*/)
  doc.font(B).fontSize(24).fillColor(INK).text(street, MARGIN, y, { width: COL_W - LOGO_W - 30 })
  y = doc.y + 1
  if (restAddr.length) { doc.font(R).fontSize(12).fillColor(INK).text(restAddr.join(', '), MARGIN, y, { width: COL_W - LOGO_W - 30 }); y = doc.y + 6 }
  const chips = [d.propertyCode, d.roomsCount ? `${d.roomsCount} room${d.roomsCount === 1 ? '' : 's'} let` : null].filter(Boolean) as string[]
  let cx = MARGIN
  for (const c of chips) {
    doc.font(B).fontSize(8).fillColor(INK)
    const w = doc.widthOfString(c) + 14
    doc.save().roundedRect(cx, y, w, 16, 8).fill(TILE).restore()
    doc.font(B).fontSize(8).fillColor(INK).text(c, cx + 7, y + 4.5, { lineBreak: false })
    cx += w + 6
  }
  if (chips.length) y += 24
  doc.font(R).fontSize(9).fillColor(MUTED).text([d.landlordName, ...d.landlordAddress].join('\n'), MARGIN, y, { width: 240, lineGap: 1 })
  // meta, right, under the logo
  const metaX = PAGE_W - MARGIN - 190
  let my = MARGIN + LOGO_H + 16
  for (const [k, v] of [['Statement', d.reference], ['Date', d.statementDate], ...(d.paymentNo ? [['Payment', d.paymentNo]] : []), ...(d.feeNo ? [['Fee invoice', d.feeNo]] : [])] as [string, string][]) {
    doc.font(R).fontSize(8.5).fillColor(MUTED).text(k, metaX, my, { width: 80 })
    doc.font(B).fontSize(8.5).fillColor(INK).text(v, metaX + 80, my, { width: 110, align: 'right' })
    my += 13
  }
  y = Math.max(doc.y, my) + 16

  // ── Hero: what's paid to the landlord ───────────────────────────────────
  const heroH = 78
  doc.save().roundedRect(MARGIN, y, COL_W, heroH, 10).fill(INK).restore()
  doc.font(R).fontSize(9.5).fillColor('#BDBDBD').text('Paid to you', MARGIN + 20, y + 16)
  doc.font(B).fontSize(30).fillColor('#FFFFFF').text(gbp(net), MARGIN + 20, y + 30)
  const payLines = [d.paidOn ? `Paid on ${d.paidOn}` : 'To be paid', d.accountEnding ? `To account ending ${d.accountEnding}` : null, d.paymentRef ? `Reference ${d.paymentRef}` : null].filter(Boolean) as string[]
  doc.font(R).fontSize(9).fillColor('#E6E6E6').text(payLines.join('\n'), MARGIN + COL_W - 220, y + 20, { width: 200, align: 'right', lineGap: 3 })
  y += heroH + 12

  // ── Summary strip ───────────────────────────────────────────────────────
  const tiles: [string, number][] = [['Rent received', rent], ['Our fees', -fees], ['Expenses', -exp], ...(fret ? [['Kept in float', -fret] as [string, number]] : []), ...(fuse ? [['From float', fuse] as [string, number]] : [])]
  const gap = 8, tw = (COL_W - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach(([label, v], i) => {
    const x = MARGIN + i * (tw + gap)
    doc.save().roundedRect(x, y, tw, 50, 8).fill(TILE).restore()
    doc.font(R).fontSize(8.5).fillColor(MUTED).text(label, x + 12, y + 10, { width: tw - 24 })
    doc.font(B).fontSize(14).fillColor(INK).text(gbp(v), x + 12, y + 24, { width: tw - 24 })
  })
  y += 50 + 22

  // ── Tables ──────────────────────────────────────────────────────────────
  const section = (title: string, sub?: string) => {
    if (y > bottom - 80) { doc.addPage(); decorate(); y = MARGIN + LOGO_H + 20 }
    doc.font(B).fontSize(13).fillColor(INK).text(title, MARGIN, y)
    if (sub) doc.font(R).fontSize(8.5).fillColor(MUTED).text(sub, MARGIN, doc.y + 1)
    y = doc.y + 8
  }
  const table = (cols: { label: string; w: number; align?: 'left' | 'right' }[], rows: string[][], total?: string[]) => {
    const xs = cols.map((_, i) => MARGIN + cols.slice(0, i).reduce((t, c) => t + c.w, 0))
    const head = () => {
      cols.forEach((c, i) => doc.font(B).fontSize(8).fillColor(MUTED).text(c.label.toUpperCase(), xs[i] + 6, y, { width: c.w - 12, align: c.align ?? 'left', characterSpacing: 0.6 }))
      y += 14; doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.8).strokeColor(INK).stroke().restore(); y += 6
    }
    head()
    const row = (cells: string[], bold = false) => {
      doc.font(bold ? B : R).fontSize(9.5)
      const h = Math.max(...cells.map((c, i) => doc.heightOfString(c || ' ', { width: cols[i].w - 12 }))) + 9
      if (y + h > bottom) { doc.addPage(); decorate(); y = MARGIN + LOGO_H + 20; head() }
      cells.forEach((c, i) => doc.font(bold ? B : R).fontSize(9.5).fillColor(INK).text(c, xs[i] + 6, y + 3, { width: cols[i].w - 12, align: cols[i].align ?? 'left' }))
      y += h
      doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.5).strokeColor(LINE).stroke().restore()
    }
    rows.forEach(r => row(r))
    if (total) row(total, true)
    y += 18
  }

  section('Rent received')
  table([{ label: 'Room', w: 62 }, { label: 'Tenant', w: 150 }, { label: 'For', w: 92 }, { label: 'Rent', w: 76, align: 'right' }, { label: 'Our fee', w: COL_W - 380, align: 'right' }],
    d.rooms.map(r => [r.room, r.tenant + (r.note ? `\n${r.note}` : ''), r.forPeriod, gbp(r.rent), `${gbp(r.fee + (r.lettingFee ?? 0))}\n${r.lettingFee ? `${r.feeLabel} + ${gbp(r.lettingFee)} letting` : r.feeLabel}`]),
    ['Total', '', '', gbp(rent), gbp(fees)])

  if (d.expenses.length) {
    section('Expenses')
    // columns only when there's something in them (statements from the previous agent have no numbers or suppliers)
    const hasNo = d.expenses.some(e => e.number), hasDate = d.expenses.some(e => e.date), hasSup = d.expenses.some(e => e.supplier)
    const cols: { label: string; w: number; align?: 'left' | 'right' }[] = []
    if (hasNo) cols.push({ label: 'No.', w: 74 })
    if (hasDate) cols.push({ label: 'Date', w: 70 })
    const fixed = cols.reduce((t, c) => t + c.w, 0) + (hasSup ? 100 : 0) + 76
    cols.push({ label: 'What for', w: COL_W - fixed })
    if (hasSup) cols.push({ label: 'Supplier', w: 100 })
    cols.push({ label: 'Amount', w: 76, align: 'right' })
    const cells = (e: ModernStatement['expenses'][number]) => [...(hasNo ? [e.number ?? ''] : []), ...(hasDate ? [e.date] : []), e.description + (e.invoiceAttached ? '  · invoice attached' : ''), ...(hasSup ? [e.supplier ?? ''] : []), gbp(e.amount)]
    table(cols, d.expenses.map(cells), ['Total', ...Array(cols.length - 2).fill(''), gbp(exp)])
  }

  if (d.stillOwed?.length) {
    section('Still owed by tenants')
    table([{ label: 'Room', w: 90 }, { label: 'Tenant', w: 260 }, { label: 'Owed', w: COL_W - 350, align: 'right' }], d.stillOwed.map(o => [o.room, o.tenant, gbp(o.amount)]))
  }

  // ── How it adds up ──────────────────────────────────────────────────────
  // the summary never starts a page on its own (that left an almost empty page 2): a boxed line if it fits,
  // a plain line if only that fits, a new page only when neither does
  const parts = [`${gbp(rent)} rent`, `− ${gbp(fees)} fees`, `− ${gbp(exp)} expenses`, ...(fret ? [`− ${gbp(fret)} kept in float`] : []), ...(fuse ? [`+ ${gbp(fuse)} from float`] : [])]
  if (y + 40 <= bottom) {
    doc.save().roundedRect(MARGIN, y, COL_W, 40, 8).fill(TILE).restore()
    doc.font(R).fontSize(9.5).fillColor(INK).text(`${parts.join('  ')}  =  `, MARGIN + 14, y + 14, { continued: true }).font(B).fillColor(ACCENT).text(`${gbp(net)} paid to you`)
    y += 52
  } else if (y - 6 + 12 <= PAGE_H - FOOTER_BAND_H - 20) {   // room above the page number for one plain line
    doc.font(R).fontSize(9).fillColor(INK).text(`${parts.join('  ')}  =  `, MARGIN, y - 6, { continued: true, lineBreak: false }).font(B).fillColor(ACCENT).text(`${gbp(net)} paid to you`, { lineBreak: false })
    y += 18
  } else {
    doc.addPage(); decorate(); y = MARGIN + LOGO_H + 20
    doc.save().roundedRect(MARGIN, y, COL_W, 40, 8).fill(TILE).restore()
    doc.font(R).fontSize(9.5).fillColor(INK).text(`${parts.join('  ')}  =  `, MARGIN + 14, y + 14, { continued: true }).font(B).fillColor(ACCENT).text(`${gbp(net)} paid to you`)
    y += 52
  }
  if (d.floatBalance != null && (d.floatBalance > 0 || fret || fuse)) doc.font(R).fontSize(8.5).fillColor(MUTED).text(`Float held for this property: ${gbp(d.floatBalance)}.`, MARGIN, y)

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.font(R).fontSize(7.5).fillColor(MUTED).text(`${d.reference} · page ${i + 1} of ${range.count}`, MARGIN, PAGE_H - FOOTER_BAND_H - 16, { width: COL_W, align: 'right', lineBreak: false })
    if (d.practice) {
      doc.save().rotate(-35, { origin: [PAGE_W / 2, PAGE_H / 2] }).fillColor('#C8372D').opacity(0.14).font(B).fontSize(54)
        .text('PRACTICE — NOT A REAL STATEMENT', 0, PAGE_H / 2 - 30, { width: PAGE_W, align: 'center', lineBreak: false }).restore()
      doc.save().font(B).fontSize(8).fillColor('#C8372D').text('PRACTICE MODE — demo house, not real money. Never send.', MARGIN, MARGIN - 18, { width: COL_W, lineBreak: false }).restore()
    }
  }
  doc.end()
  return done
}

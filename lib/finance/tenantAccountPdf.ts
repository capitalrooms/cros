// The tenant's statement of account as a PDF (22 Oct 2026, Harry: "a little messy … does not have the full official
// address and is all a bit bunched up"). Same look as the landlord statement (lib/statements/modernPdf): letterhead,
// one big figure (the balance), a summary strip, rent month by month with the date it reached our bank and how late,
// a rent punctuality rating, then every charge and payment with a running balance.
import { loadPDFLetterheadAssets, drawPDFFooter, fetchPDFBizSettings, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H } from '@/lib/pdfLetterhead'
import type { TenantAccount, RentMonth } from '@/lib/finance/tenantAccount'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

const INK = '#141414', MUTED = '#6B6B6B', LINE = '#E4E2DE', TILE = '#F4F3F0', GOOD = '#1F6F4A', BAD = '#B42318', WARN = '#B54708'
const COL_W = PAGE_W - MARGIN * 2
const gbp = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ukDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`

function monthStatus(m: RentMonth, today: string): { text: string; color: string } {
  if (m.how === 'bank') return m.daysLate ? { text: `${m.daysLate} day${m.daysLate === 1 ? '' : 's'} late`, color: m.daysLate > 5 ? BAD : WARN } : { text: 'On time', color: GOOD }
  if (m.how === 'statement' || (m.how === 'recorded' && m.statementRef)) return { text: `Paid · ${m.statementRef ?? 'statement'}`, color: GOOD }
  if (m.how === 'recorded') return { text: 'Paid', color: GOOD }
  if (m.due > today) return { text: 'Not due yet', color: MUTED }
  return { text: m.how === 'part' ? 'Part paid' : 'Unpaid', color: BAD }
}

export async function renderTenantAccountPdf(a: TenantAccount, opts: { asAt?: string } = {}): Promise<Buffer> {
  const assets = loadPDFLetterheadAssets()
  const biz = await fetchPDFBizSettings()
  const today = opts.asAt ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN }, info: { Title: `Statement of account — ${a.tenant}`, Author: biz.company_name } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej) })
  const R = assets.fontReg, B = assets.fontBold
  const logo = assets.logoImg.length ? doc.openImage(assets.logoImg) : null
  const footer = (assets.footerImg.length ? Object.assign(doc.openImage(assets.footerImg), { length: assets.footerImg.length }) : assets.footerImg) as unknown as Buffer
  const bottom = PAGE_H - FOOTER_BAND_H - 36
  const decorate = () => { if (logo) doc.image(logo as never, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H }); drawPDFFooter(doc, footer, biz, R) }
  decorate()

  // ── Heading: who and where ───────────────────────────────────────────────
  let y = MARGIN + 4
  doc.font(B).fontSize(8.5).fillColor(MUTED).text(`STATEMENT OF ACCOUNT  ·  AS AT ${ukDate(today).toUpperCase()}`, MARGIN, y, { characterSpacing: 1.2 })
  y = doc.y + 6
  const headW = COL_W - LOGO_W - 30
  doc.font(B).fontSize(22).fillColor(INK).text(a.tenant, MARGIN, y, { width: headW })
  y = doc.y + 2
  // the full postal address, the room first
  const addr = [a.room, a.address].filter(Boolean).join(', ')
  doc.font(R).fontSize(11).fillColor(INK).text(addr, MARGIN, y, { width: headW, lineGap: 1 })
  y = doc.y + 8
  const chips = [
    a.paymentRef ? `Payment reference ${a.paymentRef}` : null,
    a.rent ? `Rent ${gbp(a.rent)} a month, due on the ${ordinal(a.dueDay)}` : null,
    a.start ? `Tenant since ${ukDate(a.start)}` : null,
  ].filter(Boolean) as string[]
  let cx = MARGIN
  for (const c of chips) {
    doc.font(B).fontSize(8)
    const w = doc.widthOfString(c) + 14
    if (cx + w > MARGIN + headW) { cx = MARGIN; y += 22 }
    doc.save().roundedRect(cx, y, w, 16, 8).fill(TILE).restore()
    doc.font(B).fontSize(8).fillColor(INK).text(c, cx + 7, y + 4.5, { lineBreak: false })
    cx += w + 6
  }
  if (chips.length) y += 26
  // meta, right, under the logo
  const metaX = PAGE_W - MARGIN - 190
  let my = MARGIN + LOGO_H + 16
  for (const [k, v] of [['Date', ukDate(today)], ['Tenancy', 'Periodic (rolling)'], ...(a.paymentRef ? [['Reference', a.paymentRef]] : [])] as [string, string][]) {
    doc.font(R).fontSize(8.5).fillColor(MUTED).text(k, metaX, my, { width: 80 })
    doc.font(B).fontSize(8.5).fillColor(INK).text(v, metaX + 80, my, { width: 110, align: 'right' })
    my += 13
  }
  y = Math.max(y, my) + 12

  // ── Hero: the balance ────────────────────────────────────────────────────
  const owed = a.balance > 0.004, credit = a.balance < -0.004
  const heroH = 74
  doc.save().roundedRect(MARGIN, y, COL_W, heroH, 10).fill(INK).restore()
  doc.font(R).fontSize(9.5).fillColor('#BDBDBD').text(owed ? 'Balance owed' : credit ? 'In credit' : 'Balance', MARGIN + 20, y + 15)
  doc.font(B).fontSize(28).fillColor('#FFFFFF').text(owed || credit ? gbp(Math.abs(a.balance)) : 'Nothing owed', MARGIN + 20, y + 29)
  const p = a.punctuality
  doc.font(R).fontSize(9).fillColor('#E6E6E6').text(
    [`Rent punctuality: ${p.rating ?? 'not rated yet'}`, p.known ? `${p.onTime} of ${p.known} on time` : null, owed && a.paymentRef ? `Pay with reference ${a.paymentRef}` : null].filter(Boolean).join('\n'),
    MARGIN + COL_W - 240, y + 20, { width: 220, align: 'right', lineGap: 3 })
  y += heroH + 12

  // ── Summary strip ────────────────────────────────────────────────────────
  const tiles: [string, string][] = [['Rent charged', gbp(a.charged)], ['Paid', gbp(a.paid)], ['Balance', gbp(a.balance)], ['Average days late', p.averageDaysLate == null ? '—' : `${p.averageDaysLate} day${p.averageDaysLate === 1 ? '' : 's'}`]]
  const gap = 8, tw = (COL_W - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach(([label, v], i) => {
    const x = MARGIN + i * (tw + gap)
    doc.save().roundedRect(x, y, tw, 50, 8).fill(TILE).restore()
    doc.font(R).fontSize(8.5).fillColor(MUTED).text(label, x + 12, y + 10, { width: tw - 24 })
    doc.font(B).fontSize(14).fillColor(INK).text(v, x + 12, y + 24, { width: tw - 24 })
  })
  y += 50 + 20

  // ── tables ───────────────────────────────────────────────────────────────
  const section = (title: string, sub?: string) => {
    if (y > bottom - 90) { doc.addPage(); decorate(); y = MARGIN + LOGO_H + 20 }
    doc.font(B).fontSize(13).fillColor(INK).text(title, MARGIN, y)
    if (sub) doc.font(R).fontSize(8.5).fillColor(MUTED).text(sub, MARGIN, doc.y + 1, { width: COL_W })
    y = doc.y + 8
  }
  type Col = { label: string; w: number; align?: 'left' | 'right' }
  const table = (cols: Col[], rows: { cells: string[]; colors?: (string | undefined)[] }[], total?: string[]) => {
    const xs = cols.map((_, i) => MARGIN + cols.slice(0, i).reduce((t, c) => t + c.w, 0))
    const head = () => {
      cols.forEach((c, i) => doc.font(B).fontSize(7.5).fillColor(MUTED).text(c.label.toUpperCase(), xs[i] + 5, y, { width: c.w - 10, align: c.align ?? 'left', characterSpacing: 0.5 }))
      y += 13; doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.8).strokeColor(INK).stroke().restore(); y += 5
    }
    head()
    const row = (cells: string[], colors: (string | undefined)[] = [], bold = false) => {
      doc.font(bold ? B : R).fontSize(9)
      const h = Math.max(...cells.map((c, i) => doc.heightOfString(c || ' ', { width: cols[i].w - 10 }))) + 8
      if (y + h > bottom) { doc.addPage(); decorate(); y = MARGIN + LOGO_H + 20; head() }
      cells.forEach((c, i) => doc.font(bold || colors[i] ? B : R).fontSize(9).fillColor(colors[i] ?? INK).text(c, xs[i] + 5, y + 3, { width: cols[i].w - 10, align: cols[i].align ?? 'left' }))
      y += h
      doc.save().moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.5).strokeColor(LINE).stroke().restore()
    }
    rows.forEach(r => row(r.cells, r.colors))
    if (total) row(total, [], true)
    y += 16
  }

  if (a.months.length) {
    section('Rent month by month', `${p.sentence}${a.months.some(m => `${m.month}-01` < a.ledgerStart) ? ` Months before ${monthLabel(a.ledgerStart.slice(0, 7))} were collected before CROS matched payments to the bank, so they show the landlord statement they appear on instead of a bank date.` : ''}`)
    table(
      [{ label: 'Month', w: 110 }, { label: 'Due', w: 78 }, { label: 'Rent', w: 72, align: 'right' }, { label: 'Reached our bank', w: 104 }, { label: '', w: COL_W - 364 }],
      a.months.map(m => { const st = monthStatus(m, today); return { cells: [monthLabel(m.month), ukDate(m.due), gbp(m.amount), m.paidIn ? ukDate(m.paidIn) : '—', st.text], colors: [undefined, undefined, undefined, undefined, st.color] } }),
    )
  }

  section('Every charge and payment', 'Oldest first, with the running balance (a positive balance is owed to us).')
  table(
    [{ label: 'Date', w: 72 }, { label: 'Details', w: COL_W - 72 - 72 - 64 - 64 - 70 }, { label: 'Ref', w: 72 }, { label: 'Charged', w: 64, align: 'right' }, { label: 'Paid', w: 64, align: 'right' }, { label: 'Balance', w: 70, align: 'right' }],
    a.lines.map(l => ({ cells: [l.date, l.details, l.reference, l.charged != null ? gbp(l.charged) : '', l.paid != null ? gbp(l.paid) : '', gbp(l.balance)] })),
    ['', 'Totals', '', gbp(a.charged), gbp(a.paid), gbp(a.balance)],
  )

  if (y + 40 > bottom) { doc.addPage(); decorate(); y = MARGIN + LOGO_H + 20 }
  doc.font(R).fontSize(8.5).fillColor(MUTED).text(
    `Questions about this statement? Contact ${biz.company_name}${biz.phone ? ` on ${biz.phone}` : ''}${biz.email ? ` or ${biz.email}` : ''}. Rent is due monthly in advance on the ${ordinal(a.dueDay)}${a.paymentRef ? `; please always use your payment reference ${a.paymentRef}` : ''}.`,
    MARGIN, y, { width: COL_W })

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.font(R).fontSize(7.5).fillColor(MUTED).text(`Statement of account · ${a.tenant} · page ${i + 1} of ${range.count}`, MARGIN, PAGE_H - FOOTER_BAND_H - 16, { width: COL_W, align: 'right', lineBreak: false })
  }
  doc.end()
  return done
}

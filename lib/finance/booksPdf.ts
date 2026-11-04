// The Books as a PDF (4 Nov 2026, Harry: "all possible types can easily be viewed, date range selected … then results
// made into csv or pdf"). Exactly the rows on screen — the dates, property, landlord and type chosen — on the letterhead:
// what was chosen, totals by type and by category, then every row. Landscape A4 so the columns fit. Server only.
import { loadPDFLetterheadAssets, drawPDFFooter, fetchPDFBizSettings, FOOTER_BAND_H, LOGO_W, LOGO_H } from '@/lib/pdfLetterhead'
import type { BookRow, BookKind } from '@/lib/finance/books'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

const INK = '#132219', MUTED = '#5C6B62', LINE = '#E1E6E0', TILE = '#F1F3EF', FOREST = '#1F3B2E', GOLD = '#C4922A'
const W = 841.89, H = 595.28, M = 40
const gbp = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const KIND: Record<BookKind, string> = { rent: 'Rent received', fee: 'Agency fees', expense: 'Property expenses', payout: 'Landlord payments', deposit: 'Tenancy deposits' }
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function renderBooksPdf(o: { title: string; chosen: string[]; rows: BookRow[]; vat: boolean }): Promise<Buffer> {
  const assets = loadPDFLetterheadAssets()
  const biz = await fetchPDFBizSettings()
  const D = assets.fontDisplay, R = assets.fontReg, B = assets.fontBold
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true, info: { Title: o.title, Author: biz.company_name } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))))
  const COL = W - M * 2
  const bottom = H - 34
  const logoW = LOGO_W * 0.7, logoH = LOGO_H * 0.7
  const decorate = () => { if (assets.logoImg.length) doc.image(assets.logoImg, W - M - logoW, 26, { width: logoW, height: logoH }) }
  decorate()
  void drawPDFFooter; void FOOTER_BAND_H   // landscape pages keep a slim footer line instead of the portrait band

  // ── what was chosen ──
  let y = 30
  doc.font(B).fontSize(8.5).fillColor(GOLD).text('CAPITAL ROOMS · TRANSACTIONS', M, y, { characterSpacing: 1.2 })
  doc.font(D).fontSize(22).fillColor(FOREST).text(o.title, M, y + 13, { width: COL - logoW - 20 })
  y = doc.y + 3
  doc.font(R).fontSize(9.5).fillColor(MUTED).text(o.chosen.join('  ·  '), M, y, { width: COL - logoW - 20 })
  y = Math.max(doc.y, 26 + logoH) + 12

  // ── totals by type, then by category ──
  const kinds = (['rent', 'fee', 'expense', 'payout', 'deposit'] as BookKind[]).filter(k => o.rows.some(r => r.kind === k))
  const tiles = kinds.map(k => [KIND[k], r2(o.rows.filter(r => r.kind === k).reduce((t, r) => t + r.amount, 0))] as [string, number])
  if (tiles.length) {
    const tw = Math.min(150, (COL - 8 * (tiles.length - 1)) / tiles.length)
    tiles.forEach(([l, v], i) => {
      const x = M + i * (tw + 8)
      doc.save().roundedRect(x, y, tw, 44, 8).fill(i === 0 ? FOREST : TILE).restore()
      doc.font(R).fontSize(8).fillColor(i === 0 ? '#C9D6CD' : MUTED).text(l, x + 10, y + 8, { width: tw - 20 })
      doc.font(D).fontSize(14).fillColor(i === 0 ? '#FFFFFF' : INK).text(gbp(v), x + 10, y + 21, { width: tw - 20 })
    })
    y += 54
  }
  const cats = Object.entries(o.rows.reduce((m: Record<string, number>, r) => (m[`${KIND[r.kind]} — ${r.category}`] = r2((m[`${KIND[r.kind]} — ${r.category}`] ?? 0) + r.amount), m), {}))
  if (cats.length > 1) {
    doc.font(B).fontSize(8).fillColor(MUTED).text('BY TYPE', M, y, { characterSpacing: 0.8 }); y += 12
    const colW = COL / 3
    cats.forEach(([k, v], i) => {
      const x = M + (i % 3) * colW, yy = y + Math.floor(i / 3) * 13
      doc.font(R).fontSize(8.5).fillColor(INK).text(k, x, yy, { width: colW - 80, lineBreak: false, ellipsis: true })
      doc.font(B).fontSize(8.5).fillColor(INK).text(gbp(v), x + colW - 80, yy, { width: 70, align: 'right' })
    })
    y += Math.ceil(cats.length / 3) * 13 + 10
  }

  // ── the rows ──
  const cols: { label: string; w: number; align?: 'right'; get: (r: BookRow) => string }[] = [
    { label: 'Date', w: 66, get: r => day(r.date) },
    { label: 'Type', w: 92, get: r => `${KIND[r.kind]}\n${r.category}` },
    { label: 'Property', w: 130, get: r => `${r.property}\n${r.landlord}` },
    { label: 'Details', w: 0, get: r => [r.description, r.room, r.tenant].filter((x, i, a) => x && (i === 0 || !String(a[0]).includes(String(x)))).join(' · ') },
    ...(o.vat ? [{ label: 'Net', w: 62, align: 'right' as const, get: (r: BookRow) => r.net != null ? gbp(r.net) : '' }, { label: 'VAT', w: 54, align: 'right' as const, get: (r: BookRow) => r.vat != null ? gbp(r.vat) : '' }] : []),
    { label: 'Amount', w: 70, align: 'right', get: r => gbp(r.amount) },
    { label: 'Reference', w: 92, get: r => r.reference ?? '' },
  ]
  const fixed = cols.reduce((t, c) => t + c.w, 0)
  cols.find(c => c.w === 0)!.w = COL - fixed
  const xs = cols.map((_, i) => M + cols.slice(0, i).reduce((t, c) => t + c.w, 0))
  const head = () => {
    doc.save().rect(M, y, COL, 16).fill(FOREST).restore()
    cols.forEach((c, i) => doc.font(B).fontSize(7.5).fillColor('#FFFFFF').text(c.label.toUpperCase(), xs[i] + 5, y + 5, { width: c.w - 10, align: c.align ?? 'left', characterSpacing: 0.5 }))
    y += 18
  }
  head()
  o.rows.forEach((r, n) => {
    const cells = cols.map(c => c.get(r))
    doc.font(R).fontSize(8)
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t || ' ', { width: cols[i].w - 10 }))) + 6
    if (y + h > bottom) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 }); decorate(); y = 30 + logoH * 0.4; head() }
    if (n % 2) doc.save().rect(M, y - 1, COL, h).fill('#F8FAF7').restore()
    cells.forEach((t, i) => doc.font(i === cols.length - 2 ? B : R).fontSize(8).fillColor(INK).text(t, xs[i] + 5, y + 2, { width: cols[i].w - 10, align: cols[i].align ?? 'left' }))
    y += h
    doc.save().moveTo(M, y).lineTo(M + COL, y).lineWidth(0.4).strokeColor(LINE).stroke().restore()
  })
  if (!o.rows.length) doc.font(R).fontSize(10).fillColor(MUTED).text('Nothing for these choices.', M, y + 6)

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc.font(R).fontSize(7.5).fillColor(MUTED).text(`${biz.company_name} · ${o.title} · page ${i + 1} of ${range.count} · made ${day(new Date().toISOString().slice(0, 10))}`, M, H - 22, { width: COL, align: 'right', lineBreak: false })
  }
  doc.end()
  return done
}

// A contractor's or cleaner's invoice (migration 205) — deliberately NOT on the Capital Rooms letterhead:
// a clean, professional layout under their own name, with their own logo or a generated monogram.
import path from 'node:path'
import fs from 'node:fs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

export interface SupplierInvoicePdf {
  supplier: { name: string; address?: string | null; phone?: string | null; email?: string | null; vatNumber?: string | null; logo?: Buffer | null; colour: string }
  number: number
  issueDate: string; dueDate: string
  client: { name: string; address?: string | null; email?: string | null }
  property?: string | null
  period?: string | null
  lines: { description: string; where?: string | null; labour: number; parts: number }[]
  labourTotal: number; partsTotal: number; vat: number; total: number
  bank?: { name?: string | null; sortCode?: string | null; accountNo?: string | null } | null
  notes?: string | null
}

const PALETTE = ['#1F4E79', '#2E6B4F', '#7A3E2E', '#4B3F72', '#2F5D62', '#8A5A00', '#5B4636', '#3D5A80']
/** A colour that stays the same for a name. */
export const colourFor = (name: string) => PALETTE[Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % PALETTE.length]
const initials = (name: string) => name.replace(/\b(ltd|limited|services|plc|llp)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '•'
const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export async function renderSupplierInvoice(d: SupplierInvoicePdf): Promise<Buffer> {
  const pub = path.join(process.cwd(), 'public', 'fonts')
  const font = (n: string, fb: string) => { const p = path.join(pub, n); try { fs.accessSync(p); return p } catch { return fb } }
  const REG = font('Lato-Regular.ttf', 'Helvetica'), BOLD = font('Lato-Bold.ttf', 'Helvetica-Bold')
  const INK = '#1C1917', MUTED = '#6B6460', RULE = '#E7E2DC', ACCENT = d.supplier.colour
  const M = 48, W = 595.28, CW = W - M * 2

  const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M }, info: { Title: `Invoice ${d.number} — ${d.supplier.name}`, Author: d.supplier.name } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))))

  // ── header: logo + supplier | INVOICE + number/dates ──
  let y = M
  if (d.supplier.logo?.length) {
    try { doc.image(d.supplier.logo, M, y, { fit: [64, 64] }) } catch { /* unreadable logo: fall back below */ }
  } else {
    doc.save().circle(M + 28, y + 28, 28).fill(ACCENT).restore()
    doc.font(BOLD).fontSize(20).fillColor('#ffffff').text(initials(d.supplier.name), M, y + 16, { width: 56, align: 'center' })
  }
  const sx = M + 78
  doc.font(BOLD).fontSize(15).fillColor(INK).text(d.supplier.name, sx, y + 4, { width: 250 })
  doc.font(REG).fontSize(9).fillColor(MUTED)
  const sLines = [String(d.supplier.address ?? '').replace(/\n/g, ', '), [d.supplier.phone, d.supplier.email].filter(Boolean).join('  ·  '), d.supplier.vatNumber ? `VAT no. ${d.supplier.vatNumber}` : ''].filter(Boolean)
  doc.text(sLines.join('\n'), sx, doc.y + 2, { width: 250, lineGap: 1.5 })

  doc.font(BOLD).fontSize(26).fillColor(ACCENT).text('INVOICE', M, y, { width: CW, align: 'right' })
  doc.font(REG).fontSize(9.5).fillColor(INK)
  const meta: [string, string][] = [['Invoice no.', String(d.number)], ['Date', day(d.issueDate)], ['Due', day(d.dueDate)]]
  let my = y + 34
  for (const [k, v] of meta) {
    doc.fillColor(MUTED).text(k, W - M - 200, my, { width: 90, align: 'right' })
    doc.fillColor(INK).font(BOLD).text(v, W - M - 105, my, { width: 105, align: 'right' }).font(REG)
    my += 14
  }

  y = Math.max(doc.y, my) + 26
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor(RULE).stroke()
  y += 14

  // ── bill to / property ──
  doc.font(BOLD).fontSize(8).fillColor(MUTED).text('BILL TO', M, y, { characterSpacing: 1 })
  doc.font(BOLD).fontSize(11).fillColor(INK).text(d.client.name, M, y + 12, { width: 250 })
  doc.font(REG).fontSize(9.5).fillColor(INK).text([String(d.client.address ?? '').replace(/\n/g, ', '), d.client.email].filter(Boolean).join('\n'), M, doc.y + 1, { width: 250 })
  const leftEnd = doc.y
  if (d.property || d.period) {
    doc.font(BOLD).fontSize(8).fillColor(MUTED).text(d.property ? 'PROPERTY' : 'PERIOD', M + 280, y, { characterSpacing: 1 })
    doc.font(REG).fontSize(10).fillColor(INK).text([d.property, d.property && d.period ? `Period: ${d.period}` : d.period].filter(Boolean).join('\n'), M + 280, y + 12, { width: CW - 280 })
  }
  y = Math.max(leftEnd, doc.y) + 22

  // ── lines ──
  const cols = { desc: M + 8, labour: M + CW - 216, parts: M + CW - 144, amount: M + CW - 72 }
  doc.save().roundedRect(M, y, CW, 22, 4).fill(INK).restore()
  doc.font(BOLD).fontSize(8.5).fillColor('#ffffff')
  doc.text('DESCRIPTION', cols.desc, y + 7, { width: 260 })
  doc.text('LABOUR', cols.labour, y + 7, { width: 64, align: 'right' })
  doc.text('PARTS', cols.parts, y + 7, { width: 64, align: 'right' })
  doc.text('AMOUNT', cols.amount, y + 7, { width: 64, align: 'right' })
  y += 28
  d.lines.forEach((l, i) => {
    const descH = doc.font(REG).fontSize(9.5).heightOfString(l.description, { width: cols.labour - cols.desc - 12 }) + (l.where ? 12 : 0)
    const h = Math.max(20, descH + 8)
    if (y + h > 760) { doc.addPage(); y = M }
    if (i % 2 === 1) doc.save().rect(M, y - 4, CW, h).fill('#F7F5F2').restore()
    doc.font(REG).fontSize(9.5).fillColor(INK).text(l.description, cols.desc, y, { width: cols.labour - cols.desc - 12 })
    if (l.where) doc.font(REG).fontSize(8.5).fillColor(MUTED).text(l.where, cols.desc, doc.y + 1, { width: cols.labour - cols.desc - 12 })
    doc.font(REG).fontSize(9.5).fillColor(INK)
    doc.text(l.labour ? money(l.labour) : '—', cols.labour, y, { width: 64, align: 'right' })
    doc.text(l.parts ? money(l.parts) : '—', cols.parts, y, { width: 64, align: 'right' })
    doc.font(BOLD).text(money(l.labour + l.parts), cols.amount, y, { width: 64, align: 'right' })
    y += h
  })

  // ── totals ──
  y += 6
  doc.moveTo(M + CW - 260, y).lineTo(W - M, y).lineWidth(0.8).strokeColor(RULE).stroke()
  y += 8
  const tot: [string, string][] = [['Labour', money(d.labourTotal)], ['Parts and materials', money(d.partsTotal)], ...(d.vat ? [['VAT (20%)', money(d.vat)] as [string, string]] : [])]
  doc.font(REG).fontSize(9.5)
  for (const [k, v] of tot) { doc.fillColor(MUTED).text(k, M + CW - 260, y, { width: 180 }); doc.fillColor(INK).text(v, W - M - 80, y, { width: 80, align: 'right' }); y += 15 }
  doc.save().roundedRect(M + CW - 260, y + 2, 260, 30, 4).fill(ACCENT).restore()
  doc.font(BOLD).fontSize(11).fillColor('#ffffff').text('Total due', M + CW - 248, y + 12, { width: 120 }).text(money(d.total), W - M - 140, y + 12, { width: 128, align: 'right' })
  y += 50

  // ── how to pay ──
  if (y > 680) { doc.addPage(); y = M }
  doc.save().roundedRect(M, y, CW, 70, 6).fill('#F4F1EC').restore()
  doc.font(BOLD).fontSize(9).fillColor(INK).text('How to pay', M + 14, y + 12)
  doc.font(REG).fontSize(9).fillColor(INK)
  const b = d.bank
  const pay = b?.accountNo
    ? `Bank transfer to ${b.name || d.supplier.name}, sort code ${b.sortCode ?? ''}, account ${b.accountNo}. Please use reference ${d.number}.`
    : `Please quote invoice ${d.number} with your payment.`
  doc.text(`${pay}\nPayment due by ${day(d.dueDate)}.${d.vat ? '' : ' No VAT has been charged.'}`, M + 14, y + 26, { width: CW - 28, lineGap: 2 })
  y += 82
  if (d.notes) doc.font(REG).fontSize(9).fillColor(MUTED).text(d.notes, M, y, { width: CW })

  doc.end()
  return done
}

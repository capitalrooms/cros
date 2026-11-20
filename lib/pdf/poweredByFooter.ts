// The one 'Powered by' footer for documents made in CROS that go outside it (cleaner and contractor invoices, and
// quotes). Its wording and logo come only from here, so every document says the same thing (Nov 2026).
// Design: a soft green panel, dark text, the dark Capital Rooms logo, 'Powered by' above it.
import path from 'node:path'
import fs from 'node:fs'

export const POWERED_LINE = 'Looking for a London letting agent? Independent London lettings & management: a real team who answer, backed by our own app. Get in touch!'
export const POWERED_PHONE = '0207 112 9163'
export const POWERED_SITE = 'capitalrooms.co.uk'

let logo: Buffer | null | undefined
const logoBytes = () => {
  if (logo !== undefined) return logo
  try { logo = fs.readFileSync(path.join(process.cwd(), 'public', 'brand', 'logo-ink.png')) } catch { logo = null }
  return logo
}

/** Draws the footer panel across `width` at `top`. Returns its height so callers can keep clear of it. */
export function drawPoweredByFooter(doc: any, o: { x: number; width: number; top: number; bold: string; regular: string; ink: string; body: string }): number {
  const H = 62, pad = 16
  doc.save().roundedRect(o.x, o.top, o.width, H, 8).fill('#E9EFEB').restore()
  doc.font(o.regular).fontSize(7.5).fillColor(o.body)
    .text(POWERED_LINE, o.x + pad, o.top + 11, { width: o.width * 0.6, lineGap: 1, lineBreak: true })
  doc.font(o.bold).fontSize(7.5).fillColor(o.ink)
    .text(`Tel ${POWERED_PHONE} · ${POWERED_SITE}`, o.x + pad, o.top + H - 19, { width: o.width * 0.6, lineBreak: false })
  const right = o.x + o.width - pad
  doc.font(o.regular).fontSize(6.5).fillColor(o.body)
    .text('POWERED BY', right - 110, o.top + 13, { width: 110, align: 'right', characterSpacing: 0.8, lineBreak: false })
  const img = logoBytes()
  if (img) doc.image(img, right - 96, o.top + 23, { fit: [96, 28], align: 'right' })
  return H
}

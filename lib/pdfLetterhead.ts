/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Capital Rooms — THE single PDF letterhead/footer component                 ║
 * ║                                                                              ║
 * ║  ▸ EVERY PDF generator MUST import from here — never recreate inline.       ║
 * ║  ▸ Footer contact details come from business_settings DB table — change      ║
 * ║    once → every PDF updates automatically.                                  ║
 * ║  ▸ Letterhead assets live in public/ as files:                              ║
 * ║      public/letterhead-logo.png   — Capital Rooms stacked logo (top-right)  ║
 * ║      public/letterhead-footer.png — accreditation banner strip (footer)     ║
 * ║      public/letterhead-pen.jpg    — hand/pen silhouette (sign-off icon)     ║
 * ║    To update a banner: replace the file. All PDFs auto-update. No code.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   import { loadPDFLetterheadAssets, drawPDFLogo, drawPDFFooter, drawPDFSignOff,
 *            fetchPDFBizSettings, PAGE_W, PAGE_H, MARGIN,
 *            FOOTER_BAND_H, LOGO_W, LOGO_H, GREY_BAND } from '@/lib/pdfLetterhead'
 */

import fs   from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// ── Shared page geometry (A4 in PDF points) ───────────────────────────────────

export const PAGE_W        = 595.28
export const PAGE_H        = 841.89
export const MARGIN        = 52
export const COL_W         = PAGE_W - MARGIN * 2

// Banner image is 2000 × 278 px.
// Natural height at full page width: 278 / 2000 × 595.28 ≈ 82.75 → 83 pt.
export const FOOTER_BAND_H = 83

export const LOGO_W        = 90
export const LOGO_H        = (849 / 910) * LOGO_W   // source 910 × 849 px
export const GREY_BAND     = '#939598'
export const BLACK         = '#1a1a1a'
export const GREY          = '#555555'

// ── File-based asset loader ────────────────────────────────────────────────────

export interface PDFLetterheadAssets {
  /** public/letterhead-logo.png — Capital Rooms stacked logo */
  logoImg:   Buffer
  /** public/letterhead-footer.png — accreditation banner strip */
  footerImg: Buffer
  /** public/letterhead-pen.jpg — hand/pen silhouette (optional; falls back to vector) */
  penImg?:   Buffer
  /** Absolute path to Lato-Regular.ttf, or 'Helvetica' fallback */
  fontReg:   string
  /** Absolute path to Lato-Bold.ttf, or 'Helvetica-Bold' fallback */
  fontBold:  string
}

/**
 * Load letterhead assets from the public/ directory at runtime.
 * Replace any file and every PDF automatically picks it up — no code change needed.
 * Falls back gracefully to empty buffers (generators skip the image).
 */
export function loadPDFLetterheadAssets(): PDFLetterheadAssets {
  const pub = path.join(process.cwd(), 'public')

  function tryRead(name: string): Buffer | undefined {
    try { return fs.readFileSync(path.join(pub, name)) } catch { return undefined }
  }

  function fontPath(name: string, fallback: string): string {
    const p = path.join(pub, 'fonts', name)
    try { fs.accessSync(p); return p } catch { return fallback }
  }

  return {
    logoImg:   tryRead('letterhead-logo.png') ?? tryRead('logo.png') ?? Buffer.alloc(0),
    footerImg: tryRead('letterhead-footer.png') ?? Buffer.alloc(0),
    penImg:    tryRead('letterhead-pen.jpg') ?? tryRead('letterhead-pen.png'),
    fontReg:   fontPath('Lato-Regular.ttf', 'Helvetica'),
    fontBold:  fontPath('Lato-Bold.ttf', 'Helvetica-Bold'),
  }
}

// ── Business settings type ─────────────────────────────────────────────────────

export interface PDFBizSettings {
  company_name:  string
  address_line1: string
  city:          string
  postcode:      string
  email:         string
  phone:         string
}

/**
 * Correct defaults as shown in the reference document.
 * These are the values used when business_settings has no row or is missing fields.
 */
export const PDF_BIZ_DEFAULTS: PDFBizSettings = {
  company_name:  'Capital Rooms',
  address_line1: 'Hoxton Mix, 66 Paul Street',
  city:          'London',
  postcode:      'EC2A 4NA',
  email:         'info@capitalrooms.co.uk',
  phone:         '0207 112 9163',
}

// ── DB fetch (service role — PDF generators run on the server) ─────────────────

/** Fetch business settings from DB; falls back to PDF_BIZ_DEFAULTS on any error. */
export async function fetchPDFBizSettings(): Promise<PDFBizSettings> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return PDF_BIZ_DEFAULTS

    const supa = createClient(url, key, { auth: { persistSession: false } })
    const { data } = await supa
      .from('business_settings')
      .select('company_name, address_line1, city, postcode, email, phone')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle()

    if (!data) return PDF_BIZ_DEFAULTS

    return {
      company_name:  data.company_name  || PDF_BIZ_DEFAULTS.company_name,
      address_line1: data.address_line1 || PDF_BIZ_DEFAULTS.address_line1,
      city:          data.city          || PDF_BIZ_DEFAULTS.city,
      postcode:      data.postcode      || PDF_BIZ_DEFAULTS.postcode,
      email:         data.email         || PDF_BIZ_DEFAULTS.email,
      phone:         data.phone         || PDF_BIZ_DEFAULTS.phone,
    }
  } catch {
    return PDF_BIZ_DEFAULTS
  }
}

// ── Drawing helpers ────────────────────────────────────────────────────────────

/**
 * Draw the "Dear [Name]," salutation with correct spacing for a Capital Rooms letter.
 *
 * Gap after salutation (14pt visual) is intentionally larger than the 12pt
 * between body paragraphs — standard letter convention.
 * Returns the new y to continue body text from.
 *
 * Usage:
 *   y = drawPDFSalutation(doc, y, 'Sarah', fontReg)
 *   // then draw first body paragraph at y
 */
export function drawPDFSalutation(
  doc:     any,
  y:       number,
  name:    string,
  fontReg: string = 'Helvetica',
): number {
  doc.save()
    .font(fontReg).fontSize(9.5).fillColor(BLACK)
    .text(`Dear ${name},`, MARGIN, y)
    .restore()
  return y + 24   // 9.5pt text + ~14.5pt visual gap = consistent with para spacing
}

/**
 * Draw the standard thin rule used under subject lines in all Capital Rooms letters.
 * Call immediately after drawing the "Re: Subject" line, passing the current y.
 * Returns the new y to continue from.
 *
 * Pattern:
 *   doc.save().font(fontReg).fontSize(9.5).fillColor(BLACK)
 *     .text('Re: ', MARGIN, y, { continued: true }).font(fontBold).text(subject).restore()
 *   y = drawPDFLetterRule(doc, y + 10)
 */
export function drawPDFLetterRule(doc: any, y: number): number {
  doc.save()
    .strokeColor('#d0d0d0').lineWidth(0.5)
    .moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y)
    .stroke()
    .restore()
  return y + 16
}

/** Draw the Capital Rooms logo top-right corner of the current page. */
export function drawPDFLogo(doc: any, logoImg: Buffer): void {
  if (!logoImg.length) return
  doc.image(logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
}

/**
 * Draw the footer band at the bottom of the current page.
 *
 * The banner image (public/letterhead-footer.png) is stretched to the full page
 * width. It already contains the dark background and all accreditation logos.
 * DB-driven contact details are overlaid as white text positioned beside the
 * pin/@ icon placeholders in the banner's top-left region.
 *
 * Icon pixel positions in the 2000 × 278 banner, scaled to PDF pts:
 *   pin icon centre ≈ row 26 px  →  26 / 278 × 83 ≈ 7.8 pt from banner top
 *   @   icon centre ≈ row 82 px  →  82 / 278 × 83 ≈ 24.5 pt from banner top
 *
 * Text starts at x = 30 pt (clears the ~24 pt icon column on the left).
 */
export function drawPDFFooter(
  doc:       any,
  footerImg: Buffer,
  biz:       PDFBizSettings = PDF_BIZ_DEFAULTS,
  fontReg:   string = 'Helvetica',
): void {
  const footerY = PAGE_H - FOOTER_BAND_H

  // ── Banner image — full width, natural aspect ratio ──────────────────────────
  // Dark background first — covers any sub-pixel gap the image might leave at edges
  doc.save().fillColor('#1D1D1D').rect(-1, footerY, PAGE_W + 2, FOOTER_BAND_H + 1).fill().restore()

  if (footerImg.length > 0) {
    // Bleed 1pt past each edge so no white sliver appears at left/right
    doc.image(footerImg, -1, footerY, { width: PAGE_W + 2 })
  }

  // ── Overlay DB-driven contact details ────────────────────────────────────────
  // Banner pixel scan (2000 × 278 source → 595.28 × 83 pt rendered):
  //   pin   icon: x=147-181px → 43.8-53.9pt, y-centre 15.2pt from banner top
  //   @     icon: x=146-175px → 43.5-52.1pt, y-centre 32.8pt from banner top
  //   phone icon: x=635-670px → 189.0-199.4pt, same y-row as @ icon
  //
  // Text starts 2pt right of each icon's right edge.
  // The footer zone sits below PDFKit's content boundary — suppress bottom margin
  // temporarily so text draws at absolute coordinates without creating a new page.
  const TEXT_X      = 60     // right of pin/@ icon (right-edge ≈ 54pt + 6pt gap)
  const PHONE_X     = 207    // right of phone icon (right-edge ≈ 199pt + 8pt gap)
  const ADDR_W      = 256    // address column — stops before logo strip
  // Phone icon left-edge ≈ 189pt; EMAIL_W stops at TEXT_X+122=182pt, giving 7pt
  // clear of the icon so the email never collides with it regardless of length.
  const EMAIL_W     = 122    // email column — clear of phone icon at x≈189pt
  const PHONE_W     = 100    // phone number column
  const FONT_SZ     = 6.5   // slightly reduced to keep longer emails within EMAIL_W

  const addressStr = [
    biz.company_name.toUpperCase(),
    biz.address_line1.toUpperCase(),
    `${biz.city.toUpperCase()} ${biz.postcode.toUpperCase()}`,
  ].join(', ')

  // Temporarily zero out the bottom margin so pdfkit doesn't create a new page
  const savedBottom = doc.page.margins.bottom
  doc.page.margins.bottom = 0

  // Shrink (never wrap) text that is wider than its column, e.g. a long business email.
  const fitSize = (text: string, maxW: number) => {
    let size = FONT_SZ
    doc.font(fontReg).fontSize(size)
    while (size > 4.5 && doc.widthOfString(text) > maxW) doc.fontSize(size -= 0.1)
    return size
  }
  const emailStr = biz.email.toUpperCase()
  const addrSize = fitSize(addressStr, ADDR_W)
  const emailSize = fitSize(emailStr, EMAIL_W)

  // Row 1 — address, beside pin icon (icon centre = footerY+15.2pt; cap-height/2 ≈ 2.4pt → text top ≈ 12.8)
  doc.save()
    .font(fontReg).fontSize(addrSize).fillColor('#ffffff')
    .text(addressStr, TEXT_X, footerY + 11 + (FONT_SZ - addrSize) / 2, { lineBreak: false })
    .restore()

  // Row 2 — email beside @ icon, phone number beside phone icon (same Y row)
  // @ icon centre = 32.8pt, phone icon centre = 31.5pt → average ≈ footerY+29
  doc.save()
    .font(fontReg).fontSize(emailSize).fillColor('#ffffff')
    .text(emailStr, TEXT_X, footerY + 27 + (FONT_SZ - emailSize) / 2, { lineBreak: false })
    .restore()

  doc.save()
    .font(fontReg).fontSize(FONT_SZ).fillColor('#ffffff')
    .text(biz.phone, PHONE_X, footerY + 27, { width: PHONE_W, lineBreak: false })
    .restore()

  // Restore margin (no further text should follow, but tidy regardless)
  doc.page.margins.bottom = savedBottom
}

// ── Sign-off ───────────────────────────────────────────────────────────────────

export interface PDFSender {
  /** Full name, e.g. "Harry Buchanan" */
  name:         string
  /** e.g. "Lettings Manager" or "Director" — from people.job_title */
  jobTitle?:    string | null
  /** Direct line shown below job title — from people.direct_phone */
  directPhone?: string | null
}

/**
 * Draw a small decorative pen icon using pdfkit vector primitives.
 * Used as fallback when public/letterhead-pen.jpg is absent.
 */
function drawDecorativePen(doc: any, x: number, y: number): void {
  const BARREL = '#4A5568'
  const GRIP   = '#2D3748'
  const NIB    = '#B8860B'
  const HILIT  = '#9CA3AF'

  const cx = x + 11

  doc.save()
  doc.roundedRect(cx - 3.5, y,      7, 4, 2).fillColor(BARREL).fill()
  doc.rect(       cx - 3.5, y + 3,  7, 22)  .fillColor(BARREL).fill()
  doc.rect(       cx + 3,   y,      2, 24)   .fillColor(GRIP)  .fill()
  doc.rect(       cx - 4,   y + 22, 8, 5)    .fillColor(GRIP)  .fill()
  doc.moveTo(cx - 4, y + 27).lineTo(cx + 4, y + 27).lineTo(cx, y + 38)
    .closePath().fillColor(NIB).fill()
  doc.moveTo(cx - 1.5, y + 5).lineTo(cx - 1.5, y + 20)
    .lineWidth(0.8).strokeColor(HILIT).stroke()
  doc.restore()
}

/** Height the vector pen occupies in the sign-off block (icon 38 pt + 8 pt gap). */
const PEN_BLOCK_H = 46

/**
 * Draw the "Yours sincerely" sign-off block.
 *
 * If `penImg` is supplied (public/letterhead-pen.jpg), it is drawn as the icon.
 * Otherwise the vector pen fallback is used. Identical icon on every document.
 *
 * Returns the new `y` position after the block.
 */
export function drawPDFSignOff(
  doc:      any,
  y:        number,
  sender:   PDFSender,
  penImg?:  Buffer,
  fontReg:  string = 'Helvetica',
  fontBold: string = 'Helvetica-Bold',
): number {
  doc.save().font(fontReg).fontSize(9.5).fillColor(BLACK)
    .text('Yours sincerely,', MARGIN, y)
    .restore()

  y += 12

  if (penImg && penImg.length > 0) {
    // Hand/pen silhouette image — square source (980 × 980 px), draw at 40 × 40 pt
    const PEN_SIZE = 40
    doc.image(penImg, MARGIN, y, { width: PEN_SIZE, height: PEN_SIZE })
    y += PEN_SIZE + 6
  } else {
    drawDecorativePen(doc, MARGIN, y)
    y += PEN_BLOCK_H
  }

  doc.save().font(fontBold).fontSize(9.5).fillColor(BLACK)
    .text(sender.name, MARGIN, y)
    .restore()
  y += 14

  if (sender.jobTitle) {
    doc.save().font(fontReg).fontSize(9).fillColor(GREY)
      .text(sender.jobTitle, MARGIN, y)
      .restore()
    y += 13
  }

  if (sender.directPhone) {
    doc.save().font(fontReg).fontSize(9).fillColor(GREY)
      .text(sender.directPhone, MARGIN, y)
      .restore()
    y += 13
  }

  return y + 6
}

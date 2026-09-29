// Quote requests: load everything a contractor needs to price a job, and render the PDF we email them.
// The PDF is for contractors who may not be on the app — so it must stand on its own: what, where, photos,
// notes, how to reply. Never includes tenant names or contact details, and never the key safe code
// (that is only given once a contractor is booked).
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadPDFLetterheadAssets, drawPDFFooter, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H, BLACK, GREY,
  type PDFBizSettings,
} from '@/lib/pdfLetterhead'
import { isCommunal } from '@/lib/booking'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

export interface QuoteJob {
  id: string
  reference: string
  title: string
  description: string
  notes: string
  category: string
  location: string
  priority: string
  propertyName: string
  propertyAddress: string
  roomName: string
  photoUrls: string[]
}

export async function loadQuoteJob(s: SupabaseClient, ticketId: string): Promise<QuoteJob | null> {
  const { data: t } = await s.from('maintenance_tickets')
    .select('id, reference, title, description, notes, category, location, priority, before_photo, properties(name, address, postcode), rooms(name)')
    .eq('id', ticketId).maybeSingle()
  if (!t) return null
  const { data: files } = await s.from('attachments').select('storage_url, attachment_type').eq('ticket_id', ticketId)
  const p = (t as any).properties, r = (t as any).rooms
  const photos = [
    ...((files ?? []) as any[]).filter(f => f.attachment_type === 'photo' && f.storage_url).map(f => f.storage_url as string),
    ...(t.before_photo ? [t.before_photo as string] : []),
  ]
  return {
    id: t.id,
    reference: t.reference || t.id.slice(0, 8).toUpperCase(),
    title: t.title || 'Maintenance job',
    description: t.description || '',
    notes: t.notes || '',
    category: t.category || '',
    location: t.location || '',
    priority: t.priority || 'medium',
    propertyName: p?.name || '',
    propertyAddress: fullAddress(p?.name, p?.address, p?.postcode),
    roomName: r?.name || '',
    photoUrls: [...new Set(photos)].slice(0, 6),
  }
}

const squash = (v: string) => v.replace(/\s+/g, '').toLowerCase()

/** "12 Saltwell Street, Poplar, London, E14 0DX" — name leads when the address doesn't already start with it; postcode once. */
export function fullAddress(name?: string | null, address?: string | null, postcode?: string | null): string {
  const parts = String(address || '').split(',').map(x => x.trim()).filter(Boolean)
  if (name && !squash(parts[0] || '').startsWith(squash(name))) parts.unshift(name)
  const seen = new Set<string>()
  const out = parts.filter(x => { const k = squash(x); if (seen.has(k)) return false; seen.add(k); return true })
  if (postcode && !out.some(x => squash(x).includes(squash(postcode)))) out.push(postcode)
  return out.join(', ')
}

/** When we'd like the price back: next day for urgent work, otherwise three working days. */
export function replyByDate(priority: string, from = new Date()): Date {
  const d = new Date(from)
  let days = priority === 'urgent' || priority === 'high' || priority === 'emergency' ? 1 : 3
  while (days > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) days-- }
  return d
}

export const ukDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })

export function accessNote(job: Pick<QuoteJob, 'location' | 'roomName'>): string {
  return isCommunal(job.location)
    ? 'Communal area — house access is by key safe. The code is given once the job is booked.'
    : `Inside a tenant's room${job.roomName ? ` (${job.roomName})` : ''} — access is arranged with the tenant when the job is booked (24 hours' notice).`
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    // Phone photos are several MB each — shrink so six of them still make an email-sized PDF,
    // and apply the EXIF rotation so nothing arrives sideways.
    try {
      const sharp = (await import('sharp')).default
      return await sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()
    } catch { /* sharp unavailable or unreadable format — fall through to the original */ }
    // pdfkit reads JPEG and PNG only — skip anything else (e.g. HEIC) rather than failing the whole PDF
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8
    const png = buf[0] === 0x89 && buf[1] === 0x50
    return jpeg || png ? buf : null
  } catch { return null }
}

export interface QuoteRequestPdfInput {
  job: QuoteJob
  contractorName: string
  message?: string | null
  reply: { link?: string | null; email: string; phone?: string | null; viaApp?: boolean }
  requestedAt?: Date
  biz: PDFBizSettings
}

export async function renderQuoteRequestPdf(d: QuoteRequestPdfInput): Promise<Buffer> {
  const { job } = d
  const assets = loadPDFLetterheadAssets()
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN }, info: { Title: `Quote request ${job.reference}`, Author: d.biz.company_name } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej) })
  const R = assets.fontReg, B = assets.fontBold
  const COL_W = PAGE_W - MARGIN * 2
  const BOTTOM = PAGE_H - FOOTER_BAND_H - 16
  const logo = assets.logoImg.length ? doc.openImage(assets.logoImg) : null
  const footer = (assets.footerImg.length ? Object.assign(doc.openImage(assets.footerImg), { length: assets.footerImg.length }) : assets.footerImg) as unknown as Buffer
  const decorate = () => {
    if (logo) doc.image(logo as never, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
    drawPDFFooter(doc, footer, d.biz, R)
  }
  const newPage = () => { doc.addPage(); decorate(); return MARGIN + LOGO_H + 20 }
  decorate()

  // ── Recipient ─────────────────────────────────────────────────────────
  let y = MARGIN + 2
  doc.font(B).fontSize(9.5).fillColor(BLACK).text(d.contractorName, MARGIN, y, { width: COL_W - LOGO_W - 20 })
  y = Math.max(doc.y + 24, MARGIN + LOGO_H + 24)

  // ── Title + meta ──────────────────────────────────────────────────────
  const requested = d.requestedAt ?? new Date()
  doc.font(B).fontSize(20).fillColor(BLACK).text('Quote request', MARGIN, y, { width: COL_W * 0.55 })
  let ty = doc.y + 2
  doc.font(R).fontSize(9.5).fillColor(GREY).text('Please price the work below.', MARGIN, ty, { width: COL_W * 0.55 }); ty = doc.y + 2
  doc.font(B).fontSize(9.5).fillColor(BLACK).text(job.propertyAddress || job.propertyName, MARGIN, ty, { width: COL_W * 0.55 }); ty = doc.y
  const meta: [string, string][] = [
    ['Reference', job.reference],
    ['Date', ukDate(requested)],
    ['Priority', job.priority.charAt(0).toUpperCase() + job.priority.slice(1)],
    ['Price by', ukDate(replyByDate(job.priority, requested))],
  ]
  const metaX = MARGIN + COL_W * 0.6, metaW = COL_W * 0.4
  meta.forEach(([k, v], i) => {
    doc.font(R).fontSize(8.5).fillColor(GREY).text(k, metaX, y + 4 + i * 16, { width: metaW * 0.45 })
    doc.font(B).fontSize(8.5).fillColor(BLACK).text(v, metaX + metaW * 0.45, y + 4 + i * 16, { width: metaW * 0.55, align: 'right' })
  })
  y = Math.max(ty, y + 4 + meta.length * 16) + 18

  // ── Sections ──────────────────────────────────────────────────────────
  const section = (label: string, body: string) => {
    if (!body.trim()) return
    doc.font(R).fontSize(10)
    const h = doc.heightOfString(body, { width: COL_W - 20, lineGap: 2 }) + 34
    if (y + Math.min(h, 120) > BOTTOM) y = newPage()
    doc.save().rect(MARGIN, y, COL_W, 20).fill('#1a1a1a').restore()
    doc.font(B).fontSize(8.5).fillColor('#ffffff').text(label.toUpperCase(), MARGIN + 10, y + 6.5, { characterSpacing: 0.4 })
    y += 28
    doc.font(R).fontSize(10).fillColor(BLACK).text(body, MARGIN + 10, y, { width: COL_W - 20, lineGap: 2 })
    y = doc.y + 16
  }
  const where = [job.roomName && !isCommunal(job.location) ? job.roomName : job.location, job.propertyName].filter(Boolean).join(' · ')
  section('The job', [job.title, [job.category, where].filter(Boolean).join(' · ')].filter(Boolean).join('\n'))
  section("What the tenant reported", job.description)
  section('Notes', job.notes)
  if (d.message?.trim()) section('From the office', d.message.trim())
  section('Access', accessNote(job))

  // ── Photos (two per row) ──────────────────────────────────────────────
  const images = (await Promise.all(job.photoUrls.map(fetchImage))).filter((b): b is Buffer => !!b)
  if (images.length) {
    const gap = 12, w = (COL_W - gap) / 2, h = w * 0.75
    if (y + 28 + h > BOTTOM) y = newPage()
    doc.save().rect(MARGIN, y, COL_W, 20).fill('#1a1a1a').restore()
    doc.font(B).fontSize(8.5).fillColor('#ffffff').text(`PHOTOS (${images.length})`, MARGIN + 10, y + 6.5, { characterSpacing: 0.4 })
    y += 28
    for (let i = 0; i < images.length; i += 2) {
      if (y + h > BOTTOM) y = newPage()
      for (let j = 0; j < 2 && i + j < images.length; j++) {
        const x = MARGIN + j * (w + gap)
        doc.save().rect(x, y, w, h).fill('#f3f3f3').restore()
        try { doc.image(images[i + j], x, y, { fit: [w, h], align: 'center', valign: 'center' }) } catch { /* unreadable image — leave the grey tile */ }
      }
      y += h + gap
    }
    y += 4
  }

  // ── How to reply ──────────────────────────────────────────────────────
  const rows: [string, string][] = []
  if (d.reply.viaApp) rows.push(['In the app', 'Capital Rooms app → Quotes'])
  if (d.reply.link) rows.push(['Online', d.reply.link])
  rows.push(['By email', d.reply.email])
  if (d.reply.phone) rows.push(['By phone', d.reply.phone])
  const boxH = rows.length * 16 + 58
  if (y + boxH > BOTTOM) y = newPage()
  doc.save().roundedRect(MARGIN, y, COL_W, boxH, 4).fill('#f3f3f3').restore()
  doc.font(B).fontSize(9.5).fillColor(BLACK).text('How to send your price', MARGIN + 14, y + 12)
  rows.forEach(([k, v], i) => {
    doc.font(R).fontSize(9).fillColor(GREY).text(k, MARGIN + 14, y + 32 + i * 16, { width: 90 })
    doc.font(B).fontSize(9).fillColor(BLACK).text(v, MARGIN + 104, y + 32 + i * 16, { width: COL_W - 118, link: v.startsWith('http') ? v : undefined, lineBreak: false, ellipsis: true })
  })
  doc.font(R).fontSize(8.5).fillColor(GREY).text(
    `Quote reference ${job.reference}. If you need to see it first, say so and suggest a date for a site visit.`,
    MARGIN + 14, y + 32 + rows.length * 16 + 4, { width: COL_W - 28 })

  doc.end()
  return done
}

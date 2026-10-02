// A formal letter on the Capital Rooms letterhead, from the Document Generator (app/admin/document-generator).
// The body is plain text so it can be edited in a textarea:
//   blank line        → new paragraph
//   "## Heading"      → sub-heading
//   "- item"          → bullet
//   "| a | b |" lines → table (first row is the header; a "|---|" row is ignored)
//   **bold**          → bold words inside a paragraph, bullet or table cell

import { createClient } from '@supabase/supabase-js'
import {
  loadPDFLetterheadAssets, fetchPDFBizSettings,
  drawPDFLogo, drawPDFFooter, drawPDFSignOff, drawPDFLetterRule, type PDFSender,
  PAGE_H, MARGIN, COL_W, LOGO_H, FOOTER_BAND_H, BLACK, GREY,
} from '@/lib/pdfLetterhead'

export interface FormalLetter {
  recipientName: string
  recipientAddress: string        // one line per address line
  date: string                    // ISO yyyy-mm-dd
  reference?: string              // "Our ref"
  subject: string
  salutation: string              // "Dear Mr Smith"
  body: string
  closing: string                 // "Yours sincerely"
}

export interface LetterSigner {
  name: string
  jobTitle?: string | null
  directPhone?: string | null
  includeSignature?: boolean
}

export const CLOSINGS = ['Yours sincerely', 'Yours faithfully', 'Kind regards', 'With best wishes'] as const

export function letterFileName(l: Pick<FormalLetter, 'subject' | 'recipientName'>): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9 '&,-]/g, '').replace(/\s+/g, ' ').trim()
  return `${clean(l.subject) || 'Letter'}${l.recipientName ? ` - ${clean(l.recipientName)}` : ''}.pdf`
}

// ── Body parsing ────────────────────────────────────────────────────────────

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

export function parseBody(body: string): Block[] {
  const out: Block[] = []
  for (const chunk of body.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map(l => l.trimEnd()).filter(l => l.trim())
    let para: string[] = []
    const flush = () => { if (para.length) out.push({ kind: 'p', text: para.join(' ') }); para = [] }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (/^#{1,3}\s+/.test(line)) { flush(); out.push({ kind: 'h', text: line.replace(/^#+\s+/, '') }); continue }
      if (/^[-•*]\s+/.test(line)) {
        flush()
        const last = out[out.length - 1]
        const item = line.replace(/^[-•*]\s+/, '')
        if (last?.kind === 'ul') last.items.push(item); else out.push({ kind: 'ul', items: [item] })
        continue
      }
      if (line.startsWith('|')) {
        flush()
        const rows: string[][] = []
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          const r = cells(lines[i])
          if (!r.every(c => /^:?-{2,}:?$/.test(c))) rows.push(r)
          i++
        }
        i--
        if (rows.length) out.push({ kind: 'table', header: rows[0], rows: rows.slice(1) })
        continue
      }
      para.push(line)
    }
    flush()
  }
  return out
}

// "a **b** c" → [{text:'a ',bold:false},{text:'b',bold:true},{text:' c',bold:false}]
function spans(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    .map(s => (s.startsWith('**') && s.endsWith('**') ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false }))
}

const ukDate = (iso: string) => {
  const d = new Date(`${(iso || '').slice(0, 10)}T12:00:00Z`)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// ── Signer ──────────────────────────────────────────────────────────────────

/** The signed-in staff member's sign-off details, with their uploaded signature when they have one. */
export async function signerFromProfile(email: string): Promise<LetterSigner & { signatureImg: Buffer | null }> {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const base = 'first_name, last_name, full_name, job_title, direct_phone'
  let { data, error } = await svc.from('people').select(`${base}, signature_url`).ilike('email', email).order('created_at').limit(1).maybeSingle() as { data: any; error: any }
  if (error?.code === '42703') ({ data } = await svc.from('people').select(base).ilike('email', email).order('created_at').limit(1).maybeSingle() as { data: any; error: any })
  let signatureImg: Buffer | null = null
  if (data?.signature_url) {
    const { data: file } = await svc.storage.from('inbox-docs').download(data.signature_url)
    const buf = file ? Buffer.from(await file.arrayBuffer()) : null
    // pdfkit draws PNG and JPEG only
    const isPng = buf && buf[0] === 0x89 && buf[1] === 0x50
    const isJpg = buf && buf[0] === 0xff && buf[1] === 0xd8
    if (isPng || isJpg) signatureImg = buf
  }
  return {
    name: [data?.first_name, data?.last_name].filter(Boolean).join(' ') || data?.full_name || '',
    jobTitle: data?.job_title ?? null,
    directPhone: data?.direct_phone ?? null,
    signatureImg,
  }
}

// ── Rendering ───────────────────────────────────────────────────────────────

export async function renderFormalLetter(letter: FormalLetter, signer: LetterSigner & { signatureImg?: Buffer | null }): Promise<Buffer> {
  const [assets, biz] = await Promise.all([Promise.resolve(loadPDFLetterheadAssets()), fetchPDFBizSettings()])
  const { logoImg, footerImg, penImg, fontReg, fontBold } = assets
  const BOTTOM = PAGE_H - FOOTER_BAND_H - 24

  const PDFDocument = (await import('pdfkit')).default
  const doc = new PDFDocument({
    size: 'A4', bufferPages: true,
    margins: { top: MARGIN, bottom: PAGE_H - BOTTOM, left: MARGIN, right: MARGIN },
    info: { Title: letter.subject || 'Letter', Author: biz.company_name },
  })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })

  drawPDFLogo(doc, logoImg)

  // Recipient block, top left beside the logo
  let y = MARGIN
  const addrW = COL_W - 120
  if (letter.recipientName.trim()) {
    doc.font(fontBold).fontSize(9.5).fillColor(BLACK).text(letter.recipientName.trim(), MARGIN, y, { width: addrW })
    y = doc.y + 1
  }
  for (const line of letter.recipientAddress.split('\n').map(l => l.trim()).filter(Boolean)) {
    doc.font(fontReg).fontSize(9).fillColor(GREY).text(line, MARGIN, y, { width: addrW })
    y = doc.y + 1
  }

  y = Math.max(y + 14, MARGIN + LOGO_H + 20)
  doc.font(fontReg).fontSize(9).fillColor(GREY).text(ukDate(letter.date), MARGIN, y)
  y = doc.y + 2
  if (letter.reference?.trim()) {
    doc.font(fontReg).fontSize(9).fillColor(GREY).text(`Our ref: ${letter.reference.trim()}`, MARGIN, y)
    y = doc.y + 2
  }
  y += 14

  if (letter.subject.trim()) {
    doc.font(fontReg).fontSize(9.5).fillColor(BLACK)
      .text('Re:  ', MARGIN, y, { continued: true, width: COL_W })
      .font(fontBold).text(letter.subject.trim())
    y = drawPDFLetterRule(doc, doc.y + 6)
  }

  doc.font(fontReg).fontSize(9.5).fillColor(BLACK).text(`${letter.salutation.trim().replace(/,$/, '') || 'Dear Sir or Madam'},`, MARGIN, y, { width: COL_W })
  y = doc.y + 12

  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = MARGIN } }

  // Rich text (with **bold**) at x, wrapping in width; continues onto new pages via pdfkit's flow.
  const rich = (text: string, x: number, width: number, size = 9.5) => {
    const parts = spans(text)
    doc.fillColor(BLACK).fontSize(size)
    parts.forEach((s, i) => {
      doc.font(s.bold ? fontBold : fontReg)
      if (i === 0) doc.text(s.text, x, y, { width, lineGap: 2, continued: i < parts.length - 1 })
      else doc.text(s.text, { continued: i < parts.length - 1 })
    })
    y = doc.y
  }

  for (const b of parseBody(letter.body)) {
    if (b.kind === 'h') {
      ensure(40)
      doc.font(fontBold).fontSize(10).fillColor(BLACK).text(b.text, MARGIN, y, { width: COL_W })
      y = doc.y + 6
    } else if (b.kind === 'p') {
      ensure(28)
      rich(b.text, MARGIN, COL_W)
      y += 10
    } else if (b.kind === 'ul') {
      for (const item of b.items) {
        ensure(16)
        doc.font(fontReg).fontSize(9.5).fillColor(BLACK).text('•', MARGIN + 4, y)
        rich(item, MARGIN + 16, COL_W - 16)
        y += 4
      }
      y += 6
    } else {
      const cols = Math.max(b.header.length, ...b.rows.map(r => r.length))
      // First column gets the extra room (descriptions); the rest share the remainder (amounts etc.)
      const first = cols > 1 ? COL_W * (cols > 2 ? 0.46 : 0.62) : COL_W
      const widths = [first, ...Array(cols - 1).fill((COL_W - first) / Math.max(1, cols - 1))]
      const drawRow = (row: string[], header: boolean) => {
        const hts = widths.map((w, i) => {
          doc.font(header ? fontBold : fontReg).fontSize(9)
          return doc.heightOfString((row[i] ?? '').replace(/\*\*/g, ''), { width: w - 12, lineGap: 1 })
        })
        const h = Math.max(...hts) + 10
        ensure(h)
        let x = MARGIN
        widths.forEach((w, i) => {
          if (header) doc.save().rect(x, y, w, h).fill('#F2F2F2').restore()
          doc.save().lineWidth(0.5).rect(x, y, w, h).stroke('#D0D0D0').restore()
          const cell = row[i] ?? ''
          const bold = header || /^\*\*.*\*\*$/.test(cell)
          doc.font(bold ? fontBold : fontReg).fontSize(9).fillColor(BLACK)
            .text(cell.replace(/\*\*/g, ''), x + 6, y + 5, { width: w - 12, lineGap: 1 })
          x += w
        })
        y += h
      }
      ensure(60)
      if (b.header.length) drawRow(b.header, true)
      b.rows.forEach(r => drawRow(r, false))
      y += 14
    }
  }

  // Keep the sign-off block in one piece
  ensure(110)
  y += 4
  drawPDFSignOff(doc, y, {
    name: signer.name, jobTitle: signer.jobTitle, directPhone: signer.directPhone,
    signatureImg: signer.includeSignature === false ? null : signer.signatureImg,
  }, penImg, fontReg, fontBold, `${(letter.closing || 'Yours sincerely').replace(/,$/, '')},`)

  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    drawPDFFooter(doc, footerImg, biz, fontReg)
    if (range.count > 1) {
      doc.page.margins.bottom = 0
      doc.font(fontReg).fontSize(8).fillColor('#78716c')
        .text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, PAGE_H - FOOTER_BAND_H - 14, { width: COL_W, align: 'right', lineBreak: false })
    }
  }
  doc.end()
  return done
}

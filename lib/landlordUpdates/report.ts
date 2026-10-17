// The new-tenant report as ONE PDF (17 Oct 2026, Harry: "can they download a full report into one file"): a cover on
// our letterhead (the details we sent, then a contents list with page numbers), followed by every shared document —
// PDFs page by page, photos and scans one to a page. Adobe Sign agreements are locked (encrypted) PDFs, which the usual
// PDF library can't open; @cantoo/pdf-lib unlocks them (no password is needed to read them) so they merge like any other.
// A file that can't be merged is still listed on the contents, marked "open it on the page".
import { PDFDocument as Merger, StandardFonts, rgb } from '@cantoo/pdf-lib'
import { readStoredFile } from '@/lib/files/server'
import {
  loadPDFLetterheadAssets, fetchPDFBizSettings, drawPDFLogo, drawPDFFooter, drawPDFLetterRule,
  PAGE_W, PAGE_H, MARGIN, COL_W, LOGO_H, FOOTER_BAND_H, BLACK, GREY,
} from '@/lib/pdfLetterhead'

export interface ReportDoc { label: string; fileName: string; url: string | null }
export interface ReportInput { title: string; place: string; facts: { label: string; value: string }[]; docs: ReportDoc[]; sentOn: string }

const A4: [number, number] = [PAGE_W, PAGE_H]

/** each document's pages (null when it can't be merged) — read once, used for the page count and the merge */
async function loadDoc(d: ReportDoc): Promise<{ kind: 'pdf'; pdf: Merger } | { kind: 'image'; bytes: Uint8Array; png: boolean } | null> {
  if (!d.url) return null
  try {
    const { bytes, contentType } = await readStoredFile(d.url)
    const name = d.fileName.toLowerCase()
    if (/pdf/.test(contentType) || name.endsWith('.pdf') || bytes.subarray(0, 5).toString() === '%PDF-') {
      return { kind: 'pdf', pdf: await Merger.load(bytes, { password: '', ignoreEncryption: false } as any) }
    }
    if (/png/.test(contentType) || name.endsWith('.png')) return { kind: 'image', bytes, png: true }
    if (/jpe?g/.test(contentType) || /\.jpe?g$/.test(name)) return { kind: 'image', bytes, png: false }
  } catch (e) { console.warn('[landlord report] could not include', d.fileName, e) }
  return null
}

/** The cover on our letterhead: title, the place, the details table, then the contents list. */
async function cover(o: ReportInput, contents: { label: string; fileName: string; page: number | null }[]): Promise<Buffer> {
  const [{ logoImg, footerImg, fontReg, fontBold }, biz] = await Promise.all([Promise.resolve(loadPDFLetterheadAssets()), fetchPDFBizSettings()])
  const PDFKit = (await import('pdfkit')).default
  const doc = new PDFKit({ size: 'A4', margin: MARGIN, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const bottom = PAGE_H - FOOTER_BAND_H - 24
  const newPage = () => { doc.addPage(); drawPDFLogo(doc, logoImg); return MARGIN + LOGO_H + 20 }

  drawPDFLogo(doc, logoImg)
  doc.font(fontReg).fontSize(9).fillColor(GREY).text(o.sentOn, MARGIN, MARGIN)
  doc.font(fontBold).fontSize(20).fillColor(BLACK).text(o.title, MARGIN, MARGIN + 30, { width: COL_W - 110 })
  doc.font(fontReg).fontSize(10.5).fillColor(GREY).text(o.place, MARGIN, doc.y + 4, { width: COL_W - 110 })
  let y = drawPDFLetterRule(doc, Math.max(doc.y + 14, MARGIN + LOGO_H + 14))

  // the details, label | value
  for (const f of o.facts) {
    doc.font(fontBold).fontSize(9.5)
    const h = Math.max(doc.heightOfString(f.value, { width: COL_W - 150 }), 12)
    if (y + h + 10 > bottom) y = newPage()
    doc.font(fontReg).fontSize(8.5).fillColor(GREY).text(f.label.toUpperCase(), MARGIN, y + 1, { width: 140, characterSpacing: 0.6 })
    doc.font(fontBold).fontSize(9.5).fillColor(BLACK).text(f.value, MARGIN + 150, y, { width: COL_W - 150, lineGap: 1.5 })
    y += h + 7
    doc.save().strokeColor('#E4E0D8').lineWidth(0.5).moveTo(MARGIN, y - 3).lineTo(PAGE_W - MARGIN, y - 3).stroke().restore()
  }

  // contents
  if (contents.length) {
    if (y + 60 > bottom) y = newPage()
    y += 14
    doc.font(fontBold).fontSize(12).fillColor(BLACK).text('Documents in this report', MARGIN, y); y = doc.y + 8
    for (const c of contents) {
      if (y + 16 > bottom) y = newPage()
      doc.font(fontReg).fontSize(9.5).fillColor(BLACK).text(c.label, MARGIN, y, { width: COL_W - 120, continued: false })
      doc.font(fontReg).fontSize(8.5).fillColor(GREY).text(c.page ? `page ${c.page}` : 'view it on the web page', PAGE_W - MARGIN - 110, y + 1, { width: 110, align: 'right' })
      doc.font(fontReg).fontSize(8).fillColor(GREY).text(c.fileName, MARGIN, y + 12, { width: COL_W - 120, lineBreak: false, ellipsis: true })
      y += 28
    }
  }
  doc.font(fontReg).fontSize(8).fillColor(GREY)
    .text('These are personal documents. Please keep them safely and use them only for managing the tenancy, as data-protection law requires.', MARGIN, Math.min(y + 10, bottom - 20), { width: COL_W })

  const range = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); drawPDFFooter(doc, footerImg, biz, fontReg) }
  doc.end()
  return new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))
}

export async function buildTenantReport(o: ReportInput): Promise<Uint8Array> {
  const loaded = await Promise.all(o.docs.map(loadDoc))
  const pagesOf = (l: Awaited<ReturnType<typeof loadDoc>>) => !l ? 0 : l.kind === 'pdf' ? l.pdf.getPageCount() : 1

  // the cover's own length decides where the documents start: draw it once to count, then again with page numbers
  const draft = await Merger.load(await cover(o, o.docs.map(d => ({ label: d.label, fileName: d.fileName, page: 1 }))))
  let next = draft.getPageCount() + 1
  const contents = o.docs.map((d, i) => { const n = pagesOf(loaded[i]); const page = n ? next : null; next += n; return { label: d.label, fileName: d.fileName, page } })
  const out = await Merger.create()
  out.setTitle(`${o.title} — ${o.place}`); out.setAuthor('Capital Rooms')
  const front = await Merger.load(await cover(o, contents))
  for (const p of await out.copyPages(front, front.getPageIndices())) out.addPage(p)

  const font = await out.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < loaded.length; i++) {
    const l = loaded[i]
    if (!l) continue
    if (l.kind === 'pdf') {
      for (const p of await out.copyPages(l.pdf, l.pdf.getPageIndices())) out.addPage(p)
    } else {
      // a photo or scan: fitted on an A4 page, its name at the top
      const img = l.png ? await out.embedPng(l.bytes) : await out.embedJpg(l.bytes)
      const page = out.addPage(A4)
      const caption = o.docs[i].label.replace(/[^\x20-\x7E£]/g, '')
      page.drawText(caption, { x: MARGIN, y: PAGE_H - MARGIN + 10, size: 10, font, color: rgb(0.33, 0.33, 0.33) })
      const maxW = PAGE_W - MARGIN * 2, maxH = PAGE_H - MARGIN * 2 - 20
      const k = Math.min(maxW / img.width, maxH / img.height, 1.5)
      const w = img.width * k, h = img.height * k
      page.drawImage(img, { x: (PAGE_W - w) / 2, y: PAGE_H - MARGIN - 20 - h, width: w, height: h })
    }
  }
  return out.save()
}

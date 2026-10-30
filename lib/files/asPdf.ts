// Make sure a document is a real PDF before it goes in a signing download (30 Oct 2026): certificates are often
// uploaded as phone photos (JPEG/PNG) under a .pdf name, which Adobe Sign rejects. Images become a one-page A4 PDF;
// PDFs are re-saved plain (no owner password / odd structure) so Adobe can take them.
import { PDFDocument } from 'pdf-lib'

const isPdf = (b: Buffer) => b.subarray(0, 1024).includes(Buffer.from('%PDF'))
const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8
const isPng = (b: Buffer) => b.subarray(1, 4).toString('latin1') === 'PNG'

export async function asPdf(bytes: Buffer): Promise<Buffer | null> {
  if (isPdf(bytes)) {
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const out = await PDFDocument.create()
      const pages = await out.copyPages(doc, doc.getPageIndices())
      pages.forEach(p => out.addPage(p))
      return Buffer.from(await out.save())
    } catch { return bytes }   // can't rebuild it — send as uploaded
  }
  if (isJpeg(bytes) || isPng(bytes)) {
    const doc = await PDFDocument.create()
    const img = isJpeg(bytes) ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
    const W = 595.28, H = 841.89, M = 24
    const k = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height)
    const page = doc.addPage([W, H])
    page.drawImage(img, { x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k })
    return Buffer.from(await doc.save())
  }
  return null   // Word, HEIC, etc. — not something Adobe will take as a PDF
}

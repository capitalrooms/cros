// The DPS's own prescribed information form, filled in for one tenancy (24 Oct 2026, Harry: "you need to add this to
// tenancy packs"). The blank form is public/tenancy-pack/deposit-prescribed-information.pdf (DPS 11R6MG P13, as Harry
// supplied it); this writes the tenancy's details on its dotted lines — the deposit, the property, the landlord (care of
// us as agent), each tenant, no third party, and the deposit clause of the agreement — and leaves the signature and
// date boxes empty, for signing in Adobe Sign. Its note 1 requires the DPS Terms and Conditions to go with it: the pack
// always includes them (lib/movein/pack, dps_terms). Same facts as the letter version (lib/deposits/prescribedInfo).
import fs from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { PIContext } from '@/lib/deposits/prescribedInfo'

const FORM = 'tenancy-pack/deposit-prescribed-information.pdf'
const H = 841.89
const INK = rgb(0.05, 0.12, 0.35)   // filled-in details in dark blue, so they read as entries on the form
// the form's printed font runs a little wider than Helvetica: "Address including postcode:" is 126.3pt at 10pt on the form, 125.1pt in Helvetica
const LABEL_SCALE = 126.3 / 125.06

const money = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Split text into lines no wider than `width` at `size`. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of String(text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) line = next
      else { if (line) out.push(line); line = word }
    }
    if (line) out.push(line)
  }
  return out
}

export async function renderDpsForm(c: PIContext): Promise<Buffer> {
  const bytes = await fs.readFile(path.join(process.cwd(), 'public', FORM))
  const doc = await PDFDocument.load(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const [p1, p2, p3, p4] = doc.getPages()

  /** White out a dotted line (from just after its printed label) and write the entry on it. */
  const fill = (page: PDFPage, x0: number, top: number, bot: number, x1: number, label: string, text: string, opts: { size?: number; f?: PDFFont; pad?: number } = {}) => {
    const start = x0 + (label ? font.widthOfTextAtSize(label, 10) * LABEL_SCALE - 1.5 - (opts.pad ?? 0) : 0)
    page.drawRectangle({ x: start, y: H - bot - 1.5, width: x1 + 3 - start, height: bot - top + 3, color: rgb(1, 1, 1) })
    const size = opts.size ?? 10.5
    let t = text
    while (t.length > 1 && (opts.f ?? font).widthOfTextAtSize(t, size) > x1 - start - 2) t = t.slice(0, -2) + '…'
    page.drawText(t, { x: start + 1, y: H - bot + 2.2, size, font: opts.f ?? font, color: INK })
  }
  /** Several dotted lines in a row (an address block): wrap the text across them. */
  const block = (page: PDFPage, tops: number[], text: string, x0 = 124.7, x1 = 511.1) => {
    const lines = wrap(font, text, 10.5, x1 - x0 - 4)
    tops.forEach((top, i) => fill(page, x0, top, top + 10, x1, '', lines[i] ?? ''))
  }

  const tenantNames = c.tenants.map(t => t.name).join(', ')
  // the landlord's own address and contact details; c/o us only when we don't hold them
  const landlordAddress = c.landlordAddress || `c/o ${c.agentAddress.replace(/^Capital Rooms Ltd,\s*/, 'Capital Rooms Ltd (managing agent), ')}`
  const landlordLine = c.landlord

  // page 1 — "To:" every tenant (and anyone paying for them)
  wrap(bold, tenantNames, 11, 455).slice(0, 3).forEach((l, i) => p1.drawText(l, { x: 79.4, y: H - 244 - i * 15, size: 11, font: bold, color: INK }))

  // page 2 — 7(a) deposit, (b) property, (c) landlord, (d) tenants 1–2
  fill(p2, 117.7, 79.5, 89.5, 220.9, '', money(c.deposit), { size: 11, f: bold })
  block(p2, [133.2, 148.0, 162.9, 177.7], c.property)
  fill(p2, 124.7, 216.5, 226.5, 511.1, 'Name: ', landlordLine)
  block(p2, [246.2, 261.0, 275.9, 290.7], landlordAddress)
  fill(p2, 124.7, 306.9, 316.9, 510.8, 'Telephone Number: ', c.landlordPhone || c.agentPhone || '—')
  fill(p2, 124.7, 323.2, 333.2, 512.7, 'Email address (if any): ', c.landlordEmail || c.agentEmail || '—')
  fill(p2, 124.7, 339.5, 349.5, 511.7, 'Fax Number (if any): ', 'None')

  // each tenant's block: name, address (the property), phone, email, fax, address for the end of the tenancy
  const slots: { page: PDFPage; nameTop: number; label: string }[] = [
    { page: p2, nameTop: 399.5, label: '(1) Name: ' }, { page: p2, nameTop: 586.6, label: '(2) Name: ' },
    { page: p3, nameTop: 28.2, label: '(3) Name: ' }, { page: p3, nameTop: 215.4, label: '(4) Name: ' }, { page: p3, nameTop: 402.6, label: '(5) Name: ' },
  ]
  c.tenants.slice(0, 5).forEach((t, i) => {
    const { page, nameTop: n, label } = slots[i]
    fill(page, 124.7, n, n + 10, 511.8, label, t.name, { f: bold, pad: 2.5 })
    block(page, [n + 29.6, n + 44.5, n + 59.3], c.property)
    fill(page, 124.7, n + 74.1, n + 84.1, 511.6, 'Telephone number(s): ', t.phone || '—')
    fill(page, 124.7, n + 89.0, n + 99.0, 512.1, 'Email address(es): ', t.email || '—')
    fill(page, 124.7, n + 103.8, n + 113.8, 510.6, 'Fax Number(s): ', 'None')
    block(page, [n + 133.5, n + 148.3, n + 163.1], `By email to ${t.email || 'the address above'}, and the forwarding address the tenant gives us at check-out.`)
  })

  // page 3 — (e) third party
  // (the label is italic and runs wider than the plain labels)
  p3.drawRectangle({ x: 392, y: H - 635.8 - 1.5, width: 122, height: 13, color: rgb(1, 1, 1) })
  p3.drawText('None', { x: 394, y: H - 635.8 + 2.2, size: 10.5, font: bold, color: INK })

  // page 4 — (f) the deposit clause; the landlord's (agent's) and tenants' names. Signatures and dates are left for
  // signing (Adobe Sign).
  p4.drawRectangle({ x: 100, y: H - 80.1, width: 428, height: 13.1, color: rgb(1, 1, 1) })
  p4.drawText('Refer to Clause(s) [', { x: 102, y: H - 76.4, size: 10, font, color: rgb(0, 0, 0) })
  const at = 102 + font.widthOfTextAtSize('Refer to Clause(s) [ ', 10)
  p4.drawText('5 (The deposit)', { x: at, y: H - 76.4, size: 10, font: bold, color: INK })
  p4.drawText('] of the Tenancy Agreement.', { x: at + bold.widthOfTextAtSize('5 (The deposit) ', 10), y: H - 76.4, size: 10, font, color: rgb(0, 0, 0) })
  // let-only: the landlord signs it themselves; managed: we sign as their agent
  if (c.letOnly) fill(p4, 57.7, 210.5, 220.5, 227.9, 'Landlord(s): ', c.landlord, { size: 8.5 })
  else {
    fill(p4, 57.7, 210.5, 220.5, 227.9, 'Landlord(s): ', 'Capital Rooms Ltd, as agent', { size: 8.5 })
    // the second line has no signature box beside it, so the landlord's name can run on
    fill(p4, 124.7, 226.8, 236.8, 420, '', `for ${c.landlord}`, { size: 8.5 })
  }
  const tenantTops = [373.0, 389.3, 405.5, 421.8]
  c.tenants.slice(0, 4).forEach((t, i) => fill(p4, i === 0 ? 57.7 : 124.7, tenantTops[i], tenantTops[i] + 10, 227.9, i === 0 ? 'Tenant(s): ' : '', t.name, { size: 8.5 }))

  doc.setTitle(`Deposit prescribed information — ${c.property}`)
  doc.setSubject('Prescribed information relating to tenancy deposits (The Deposit Protection Service)')
  return Buffer.from(await doc.save())
}

/** The filled form for one tenancy, read fresh from its records (for the move-in pack). */
export async function renderDpsFormFor(s: import('@supabase/supabase-js').SupabaseClient, tenancyId: string): Promise<Buffer> {
  const [{ loadPI }, { fetchPDFBizSettings }] = await Promise.all([import('@/lib/deposits/prescribedInfo'), import('@/lib/pdfLetterhead')])
  const c = await loadPI(s, tenancyId, await fetchPDFBizSettings())
  if (!c) throw new Error('Tenancy not found')
  if (!(c.deposit > 0)) throw new Error('This tenancy has no deposit')
  return renderDpsForm(c)
}

// Notice of an HMO licence application — the letter telling the people at a property that a licence is being
// applied for. The Licensing and Management of HMOs (Miscellaneous Provisions) (England) Regulations 2006, reg. 7(5)
// sets what it must say: the applicant's and the proposed licence holder's name, address, telephone and email; the
// type of application; the property; the council it's made to; and the date it's submitted.
// Filled from the property, its landlord(s), the signed-in staff member and the council for the postcode; every
// field can be edited before the PDF is made. Drawn on the standard letterhead (lib/pdfLetterhead).
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadPDFLetterheadAssets, fetchPDFBizSettings, drawPDFLogo, drawPDFFooter, drawPDFSignOff, drawPDFLetterRule, drawPDFSalutation,
  MARGIN, COL_W, LOGO_H, BLACK, GREY,
} from '@/lib/pdfLetterhead'
import { LONDON_COUNCILS, councilForPostcode, postcodesIn, type Council } from '@/lib/councils/london'
import type { EmailSender } from '@/lib/email/sender'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

export interface HmoNoticeFields {
  kind: 'new' | 'renewal'
  letterDate: string             // YYYY-MM-DD
  submitBy: string               // YYYY-MM-DD — "on or before"
  recipient: string[]            // address block lines
  salutation: string             // "Tenant" → "Dear Tenant,"
  propertyAddress: string        // one line, as it should read in the letter
  manager: { name: string; title: string; address: string; phone: string; email: string }
  holder: { name: string; address: string; phone: string; emails: string[] }
  council: { name: string; address: string; phone: string; email: string }
  contactPhone: string           // "please contact me at …"
  contactEmail: string
}

export interface HmoNoticeDefaults {
  fields: HmoNoticeFields
  councilDistrict: string | null
  councilChecked: string | null  // date the council's details were confirmed, or null = check them
  warnings: string[]
  councils: { key: string; name: string; checked: boolean }[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const clean = (v: unknown, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const oneLine = (v: string | null | undefined) => String(v || '').split(/\n|,/).map(x => x.trim()).filter(Boolean)

/** "20 Chobham Road, London, E15 1LU" from the property's name / address / postcode, each part once. */
function propertyLine(name: string | null, address: string | null, postcode: string | null) {
  const squash = (v: string) => v.replace(/\s+/g, '').toLowerCase()
  const parts = [...oneLine(address)]
  const n = oneLine(name)[0]
  if (n && !squash(parts[0] || '').startsWith(squash(n))) parts.unshift(n)
  const seen = new Set<string>()
  const out = parts.filter(x => { const k = squash(x); if (seen.has(k)) return false; seen.add(k); return true })
  const pc = postcode ? postcodesIn(postcode)[0] ?? postcode : null
  if (pc && !out.some(x => squash(x).includes(squash(pc)))) out.push(pc)
  return out.join(', ')
}

const personName = (sal?: string | null, first?: string | null, last?: string | null) => [sal, first, last].map(x => (x || '').trim()).filter(Boolean).join(' ')

export async function hmoNoticeDefaults(s: SupabaseClient, propertyId: string, sender: EmailSender): Promise<HmoNoticeDefaults | null> {
  const { data: p } = await s.from('properties').select('id, name, address, postcode, council_name, council_phone, council_email, landlord_id, landlord_id_2, landlord_name, landlord_email, landlord_phone, license_number, license_expiry').eq('id', propertyId).maybeSingle()
  if (!p) return null
  const biz = await fetchPDFBizSettings()
  const office = [biz.address_line1, biz.city, biz.postcode].filter(Boolean).join(', ')
  const warnings: string[] = []

  // the postcode printed in the letter is the one in the address; the separate postcode field is a fallback
  const fromAddress = postcodesIn(`${p.name ?? ''}\n${p.address ?? ''}`)
  const fromField = postcodesIn(p.postcode)
  const postcode = fromAddress[0] ?? fromField[0] ?? null
  if (!postcode) warnings.push('This property has no postcode on record — add it to the address below and pick the council.')
  else if (fromAddress[0] && fromField[0] && fromAddress[0] !== fromField[0]) warnings.push(`The address says ${fromAddress[0]} but the property’s postcode field says ${fromField[0]}. The letter uses ${fromAddress[0]} — correct the property record if that’s wrong.`)

  let district: string | null = null
  let council: Council | null = null
  if (postcode) {
    const found = await councilForPostcode(postcode)
    district = found.district
    council = found.council
    if (found.error) warnings.push(`${found.error} — pick the council yourself.`)
    else if (!council) warnings.push(`${district} isn’t in our council list — enter its details below.`)
  }
  if (p.council_name && district && !String(p.council_name).toLowerCase().includes(district.toLowerCase().split(' ')[0]))
    warnings.push(`The property record says the council is ${p.council_name}, but ${postcode} is in ${district}. The letter uses ${district}.`)
  if (council && !council.checked) warnings.push(`${council.name}’s details are its main office and switchboard — check its licensing team’s address before sending.`)

  // landlord(s) — the proposed licence holder
  const ids = [p.landlord_id, p.landlord_id_2].filter(Boolean) as string[]
  const { data: lls } = ids.length ? await s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, phone, joint_salutation, joint_first_name, joint_last_name, joint_email').in('id', ids) : { data: [] as any[] }
  const names: string[] = []
  const emails: string[] = []
  let phone = ''
  for (const id of ids) {
    const l = (lls ?? []).find((x: any) => x.id === id) as any
    if (!l) continue
    const main = personName(l.salutation, l.first_name, l.last_name)
    const joint = personName(l.joint_salutation, l.joint_first_name, l.joint_last_name)
    if (joint) names.push(main, joint)
    else names.push(l.company || (String(l.full_name || '').includes('&') ? l.full_name : main) || l.full_name)
    for (const e of [l.email, l.joint_email]) if (e && !emails.includes(e)) emails.push(e)
    phone ||= l.phone || ''
  }
  if (!names.length && p.landlord_name) names.push(p.landlord_name)
  if (!names.length) warnings.push('No landlord is linked to this property — enter the proposed licence holder.')

  const today = new Date()
  return {
    fields: {
      kind: p.license_number || p.license_expiry ? 'renewal' : 'new',
      letterDate: iso(today),
      submitBy: iso(new Date(today.getTime() + 10 * 86_400_000)),
      recipient: [],               // filled from the property address on the screen
      salutation: 'Tenant',
      propertyAddress: propertyLine(p.name, p.address, postcode),
      manager: { name: sender.name, title: sender.title === 'Capital Rooms' ? 'Property Manager' : sender.title, address: office, phone: biz.phone, email: sender.email },
      holder: { name: names.filter(Boolean).join(' & '), address: office, phone: formatPhone(phone), emails },
      council: council
        ? { name: council.name, address: council.address.join(', '), phone: council.phone, email: council.email ?? '' }
        : { name: p.council_name || district || '', address: '', phone: p.council_phone || '', email: p.council_email || '' },
      contactPhone: sender.phone,
      contactEmail: sender.email,
    },
    councilDistrict: district,
    councilChecked: council?.checked ?? null,
    warnings,
    councils: Object.entries(LONDON_COUNCILS).map(([key, c]) => ({ key, name: c.name, checked: !!c.checked })).sort((a, b) => a.key.localeCompare(b.key)),
  }
}

/** "07875162756" → "07875 162756"; anything else unchanged. */
function formatPhone(v: string) {
  const d = v.replace(/\s+/g, '')
  if (/^07\d{9}$/.test(d)) return `${d.slice(0, 5)} ${d.slice(5)}`
  if (/^02\d{9}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`
  return v
}

/** Accept edited fields from the screen — trimmed, length-limited, never trusted as-is. */
export function parseHmoNoticeFields(b: any): HmoNoticeFields | null {
  if (!b || typeof b !== 'object') return null
  const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : '')
  const f: HmoNoticeFields = {
    kind: b.kind === 'renewal' ? 'renewal' : 'new',
    letterDate: date(b.letterDate) || iso(new Date()),
    submitBy: date(b.submitBy),
    recipient: (Array.isArray(b.recipient) ? b.recipient : []).map((x: unknown) => clean(x, 120)).filter(Boolean).slice(0, 6),
    salutation: clean(b.salutation, 80) || 'Tenant',
    propertyAddress: clean(b.propertyAddress, 200),
    manager: { name: clean(b.manager?.name, 80), title: clean(b.manager?.title, 80), address: clean(b.manager?.address), phone: clean(b.manager?.phone, 40), email: clean(b.manager?.email, 120) },
    holder: { name: clean(b.holder?.name, 160), address: clean(b.holder?.address), phone: clean(b.holder?.phone, 40), emails: (Array.isArray(b.holder?.emails) ? b.holder.emails : []).map((x: unknown) => clean(x, 120)).filter(Boolean).slice(0, 4) },
    council: { name: clean(b.council?.name, 120), address: clean(b.council?.address), phone: clean(b.council?.phone, 40), email: clean(b.council?.email, 120) },
    contactPhone: clean(b.contactPhone, 40),
    contactEmail: clean(b.contactEmail, 120),
  }
  return f
}

/** What's missing before this can go out (reg. 7(5) particulars). Empty = ready. */
export function hmoNoticeGaps(f: HmoNoticeFields): string[] {
  const gaps: string[] = []
  if (!f.propertyAddress || !postcodesIn(f.propertyAddress).length) gaps.push('the property address with its postcode')
  if (!f.submitBy) gaps.push('the date the application will be submitted')
  if (!f.manager.name || !f.manager.address || !f.manager.phone || !f.manager.email) gaps.push('the applicant’s name, address, phone and email')
  if (!f.holder.name || !f.holder.address) gaps.push('the proposed licence holder’s name and address')
  if (!f.council.name || !f.council.address) gaps.push('the council’s name and address')
  return gaps
}

const longDate = (d: string) => {
  const x = new Date(d + 'T12:00:00')
  const n = x.getDate()
  const suf = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suf} ${x.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`
}

export const hmoNoticeSubject = (f: HmoNoticeFields) => `Notice of HMO licence ${f.kind === 'renewal' ? 'renewal ' : ''}application at your property`

export async function renderHmoNotice(f: HmoNoticeFields): Promise<Buffer> {
  const [{ logoImg, footerImg, penImg, fontReg, fontBold }, biz] = [loadPDFLetterheadAssets(), await fetchPDFBizSettings()]
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: hmoNoticeSubject(f), Author: 'Capital Rooms' } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  drawPDFLogo(doc, logoImg)

  // recipient block, level with the logo
  const lines = f.recipient.length ? f.recipient : f.propertyAddress.split(',').map(x => x.trim()).filter(Boolean)
  let ay = MARGIN
  lines.forEach((l, i) => {
    doc.font(i === 0 ? fontBold : fontReg).fontSize(i === 0 ? 9.5 : 9).fillColor(i === 0 ? BLACK : GREY).text(l, MARGIN, ay, { width: 250 })
    ay = doc.y + 1
  })
  const top = Math.max(ay + 20, MARGIN + LOGO_H + 20)
  doc.font(fontReg).fontSize(9).fillColor(GREY).text(longDate(f.letterDate), MARGIN, top)
  let y = top + 28

  doc.font(fontReg).fontSize(9).fillColor(BLACK).text('Re:  ', MARGIN, y, { continued: true }).font(fontBold).text(hmoNoticeSubject(f))
  y = drawPDFLetterRule(doc, y + 16)
  y = drawPDFSalutation(doc, y, f.salutation, fontReg)

  const para = (text: string, gap = 10) => {
    doc.font(fontReg).fontSize(9.5).fillColor(BLACK).text(text, MARGIN, y, { width: COL_W, lineGap: 3, align: 'justify' })
    y = doc.y + gap
  }
  const paraWithBold = (before: string, bold: string, after: string, gap = 10) => {
    doc.font(fontReg).fontSize(9.5).fillColor(BLACK).text(before, MARGIN, y, { width: COL_W, lineGap: 3, continued: true })
      .font(fontBold).text(bold, { continued: true }).font(fontReg).text(after)
    y = doc.y + gap
  }
  const heading = (text: string) => {
    doc.font(fontBold).fontSize(9.5).fillColor(BLACK).text(text, MARGIN, y)
    y = doc.y + 6
  }
  const INDENT = MARGIN + 18
  const row = (label: string, value: string) => {
    if (!value) return
    doc.font(fontBold).fontSize(9.5).fillColor(BLACK).text(`${label}: `, INDENT, y, { width: COL_W - 18, lineGap: 2, continued: true })
      .font(fontReg).text(value)
    y = doc.y + 1
  }

  paraWithBold(
    `We are writing to let you know that we will be ${f.kind === 'renewal' ? 'applying to renew the House in Multiple Occupation (HMO) licence' : 'applying for a House in Multiple Occupation (HMO) licence'} for the property at `,
    f.propertyAddress, '.')
  para('The application is made under Part 2 of the Housing Act 2004, which requires the local council to license HMOs so that they meet the standards set for shared homes.', 14)

  heading('Details of the application')
  row('Applicant and property manager', f.manager.name)
  row('Address', f.manager.address)
  row('Telephone', f.manager.phone)
  row('Email', f.manager.email)
  y += 8
  row('Proposed licence holder', f.holder.name)
  row('Address', f.holder.address)
  row('Telephone', f.holder.phone)
  row('Email', f.holder.emails.join(', '))
  y += 8
  row('Property', f.propertyAddress)
  row('Type of application', f.kind === 'renewal' ? 'Renewal of an HMO licence' : 'New HMO licence')
  row('Council', f.council.name)
  row('To be submitted', f.submitBy ? `on or before ${longDate(f.submitBy)}` : '')
  y += 12

  heading(`${f.council.name || 'The council'}’s contact details`)
  row('Address', f.council.address)
  row('Telephone', f.council.phone)
  row('Email', f.council.email)
  y += 12

  const contact = [f.contactPhone, f.contactEmail].filter(Boolean)
  if (contact.length) paraWithBold('If you have any questions, please contact me on ', contact.join(' or '), '.')
  para('Thank you for your attention to this matter.', 16)

  drawPDFSignOff(doc, y, { name: f.manager.name || 'Capital Rooms', jobTitle: f.manager.title || null }, penImg, fontReg, fontBold)

  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); drawPDFFooter(doc, footerImg, biz, fontReg) }
  doc.end()
  return new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))
}

export const hmoNoticeFilename = (f: HmoNoticeFields) =>
  `HMO-licence-notice-${(f.propertyAddress.split(',')[0] || 'property').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}-${f.letterDate}.pdf`


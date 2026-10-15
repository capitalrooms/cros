/**
 * Single-let (whole house / flat) tenancy agreement — 15 Oct 2026.
 *
 * Harry: "we will need an agreement on file for single let properties … keep the header page style from [the old
 * Queen of Denmark Court agreement] but then use one of the NRLA agreements". So the document is:
 *   1. a Capital Rooms cover page (the old agreements' cover: the address large in the middle, the term underneath,
 *      faint logo behind, accreditation footer) — drawn here with pdfkit;
 *   2. the NRLA Assured Periodic Tenancy Agreement, "no bills included" version (APNB v1.0, under the Housing Act
 *      1988 as amended by the Renters' Rights Act 2025), filled in through its own form fields and flattened.
 *      public/templates/nrla-apnb.pdf is NRLA's file exactly as published — its wording is never edited; we only
 *      type into the boxes it provides. The tenant pays their own bills on a single let, hence APNB, not JAPT.
 *
 * Who manages it decides the details (Harry, 15 Oct: "either be the landlord who gets contacted for issues or us"):
 *   managed  — rent to the Capital Rooms client account; we are the contact and the address for notices; the deposit
 *              is held by us (the agent) in the DPS; Harry signs as the landlord's agent.
 *   let-only — rent to the landlord's account saved on the property; the landlord is the contact and the address for
 *              notices; the deposit is paid to us and held by the landlord in the DPS; the landlord signs.
 * (The same split as the room agreements: apt-cr managed, apt-ns let-only.) First rent from lib/tenancy/firstRent.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  loadPDFLetterheadAssets, drawPDFFooter, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, BLACK, GREY, PDF_BIZ_DEFAULTS,
  type PDFBizSettings,
} from '@/lib/pdfLetterhead'
import { firstRentPayment, parseTenancyDate } from '@/lib/tenancy/firstRent'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFKit = require('pdfkit') as typeof import('pdfkit')

export interface SingleLetAgreementData {
  tenantNames: string[]             // formal names, one per tenant ("Mr Martin Noives")
  tenantEmails: string[]
  landlordName: string              // "Mr Richard Page" / "Mr Smith and Mrs Smith"
  address: string                   // one line
  startDate: string                 // YYYY-MM-DD
  rentMonthly: number
  rentDueDay: number
  deposit: number
  paymentRef: string
  /** managed = we manage (our account, our contact details); let_only = the landlord manages */
  managedBy: 'managed' | 'let_only'
  /** where the rent goes: the client account (managed) or the landlord's account on the property (let-only) */
  bank: { name: string; bank: string; sortCode: string; accountNo: string; iban?: string; swift?: string }
  /** let-only: the landlord's own contact details — they are the address for notices */
  landlordContact?: { address: string; email: string; phone: string }
  signatory?: string                // managed: who signs as agent — default "Harry Buchanan"
  permittedOccupiers?: string
  sharedFacilities?: string
  parking?: string
  biz?: PDFBizSettings
}

const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')
const longDate = (d: Date) => `${ordinal(d.getDate())} ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`
const pounds = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The NRLA form's own field names (APNB v1.0) — what each box is for. */
const F = {
  landlord: 'This agreement is between us the landlord if there are joint landlords all must be listed',
  tenants: 'and you the tenant if there is more than one you are jointly and severally liable',
  property: 'We will let out the property at',
  startDate: 'From this date you are',
  firstRentAmount: 'is to be paid in advance by',      // the £ box before "is to be paid in advance by"
  firstRentBy: 'undefined_2',
  nextFrom: 'subsequent rent payments of',            // the "From ____" date box
  nextAmount: 'must be paid in advance',               // the £ box
  payOn: 'every',                                      // the "on ____" box
  payEvery: 'This is the first day of the rental',     // the "every ____" box
  payTo: 'Payment must be made in cleared funds to',
  occupiers: 'Text8',
  shared: 'property',
  parking: 'If you are allocated parking it is',
  depositAmount: 'You must pay the deposit of',
  depositTo: 'in full to',
  serviceAddress: 'our address for service in England or Wales is',
  ourEmail: 'Email',
  ourPhone: 'Phone',
  tenantNames: 'Name',
  tenantEmails: 'Email address',
  depositHeldBy: 'undefined_3',
  depositScheme: 'undefined_4',
  signatory: 'Name of',
  signatoryRole: 'Dropdown9',
  tenantSignRows: ['NameRow1_2', 'NameRow2', 'NameRow3', 'NameRow4', 'NameRow5', 'NameRow6'],
} as const

export async function generateSingleLetAgreement(d: SingleLetAgreementData): Promise<Buffer> {
  const biz = d.biz ?? PDF_BIZ_DEFAULTS
  const start = parseTenancyDate(d.startDate)
  if (!start) throw new Error('The tenancy needs a start date')
  const first = firstRentPayment(start, d.rentMonthly, d.rentDueDay)
  if (!first) throw new Error('Could not work out the first rent payment')
  const officeAddress = [biz.company_name === 'Capital Rooms' ? 'Capital Rooms Ltd' : biz.company_name, biz.address_line1, biz.city, biz.postcode].filter(Boolean).join(', ')
  const names = d.tenantNames.filter(Boolean)
  const letOnly = d.managedBy === 'let_only'
  if (letOnly && !d.bank.accountNo) throw new Error('Add the landlord’s bank account to this property first (property › Details › bank account) — the rent goes there on a let-only.')
  if (letOnly && !d.landlordContact?.address) throw new Error('Add the landlord’s home address first — on a let-only they are the address for notices.')
  const lc = d.landlordContact

  // ── 2. the NRLA agreement, filled ──────────────────────────────────────
  const nrla = await PDFDocument.load(fs.readFileSync(path.join(process.cwd(), 'public', 'templates', 'nrla-apnb.pdf')))
  const form = nrla.getForm()
  const helv = await nrla.embedFont(StandardFonts.Helvetica)
  const set = (name: string, value: string, size = 9.5, multiline = false) => {
    const f = form.getTextField(name)
    if (multiline) f.enableMultiline()
    f.setFontSize(size)
    f.setText(value)
  }
  const b = d.bank
  set(F.landlord, letOnly ? `${d.landlordName}, ${lc!.address}` : `${d.landlordName} C/O ${officeAddress}`, 10, true)
  set(F.tenants, names.join('\n'), 10, true)
  set(F.property, d.address, 10, true)
  set(F.startDate, longDate(start))
  set(F.firstRentAmount, pounds(first.amount))
  set(F.firstRentBy, longDate(start))
  set(F.nextFrom, longDate(first.nextDue))
  set(F.nextAmount, pounds(d.rentMonthly))
  set(F.payOn, `the ${ordinal(d.rentDueDay)} day`)
  set(F.payEvery, 'calendar month')
  set(F.payTo, [
    `Account name: ${b.name}   Bank: ${b.bank}   Sort code: ${b.sortCode}   Account number: ${b.accountNo}`,
    `Payment reference: ${d.paymentRef}${b.iban ? `   IBAN: ${b.iban}` : ''}${b.swift ? `   SWIFT: ${b.swift}` : ''}`,
  ].join('\n'), 9, true)
  set(F.occupiers, d.permittedOccupiers || 'None')
  set(F.shared, d.sharedFacilities || 'Any communal entrance, hallways, stairs, lifts and bin store of the building, where provided.', 9.5, true)
  set(F.parking, d.parking || 'not applicable to this tenancy')
  set(F.depositAmount, pounds(d.deposit), 9)
  set(F.depositTo, 'the agent, Capital Rooms Ltd', 9)
  if (letOnly) {
    set(F.serviceAddress, `${d.landlordName}\n${lc!.address}`, 10, true)
    set(F.ourEmail, lc!.email || '—', 9)
    set(F.ourPhone, lc!.phone || '—', 9)
  } else {
    set(F.serviceAddress, `Capital Rooms Ltd (agent for the landlord)\n${[biz.address_line1, biz.city, biz.postcode].filter(Boolean).join(', ')}`, 10, true)
    set(F.ourEmail, biz.email, 9)
    set(F.ourPhone, biz.phone, 9)
  }
  set(F.tenantNames, names.join('\n'), 9.5, true)
  set(F.tenantEmails, d.tenantEmails.filter(Boolean).join('\n'), 9.5, true)
  set(F.depositHeldBy, letOnly ? `the landlord, ${d.landlordName}` : 'the agent, Capital Rooms Ltd')
  set(F.depositScheme, 'The Deposit Protection Service (DPS)')
  if (letOnly) {
    set(F.signatory, d.landlordName, 9)
    form.getDropdown(F.signatoryRole).select('Landlord')
  } else {
    set(F.signatory, `${d.signatory ?? 'Harry Buchanan'}, Capital Rooms Ltd, for and on behalf of ${d.landlordName}`, 8.5)
    form.getDropdown(F.signatoryRole).select("Landlords' agent")
  }
  names.slice(0, F.tenantSignRows.length).forEach((n, i) => set(F.tenantSignRows[i], n, 9, true))
  form.updateFieldAppearances(helv)
  form.flatten()   // typed in for good; the e-signing service adds its own signature boxes

  // ── 1. the cover page ──────────────────────────────────────────────────
  const cover = await coverPage({ address: d.address, start, names, landlord: d.landlordName, letOnly, biz })
  const out = await PDFDocument.create()
  out.setTitle(`Tenancy Agreement — ${d.address}`)
  out.setAuthor('Capital Rooms Ltd')
  const coverDoc = await PDFDocument.load(cover)
  const [c] = await out.copyPages(coverDoc, [0])
  out.addPage(c)
  for (const p of await out.copyPages(nrla, nrla.getPageIndices())) out.addPage(p)
  return Buffer.from(await out.save())
}

/** The cover — the old agreements' title page in the house style: address large and central, term beneath. */
async function coverPage(o: { address: string; start: Date; names: string[]; landlord: string; letOnly: boolean; biz: PDFBizSettings }): Promise<Buffer> {
  const assets = loadPDFLetterheadAssets()
  const doc = new PDFKit({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, info: { Title: `Tenancy Agreement — ${o.address}`, Author: 'Capital Rooms Ltd' } })
  const chunks: Buffer[] = []
  doc.on('data', (ch: Buffer) => chunks.push(ch))
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej) })
  const R = assets.fontReg, B = assets.fontBold
  const W = PAGE_W - MARGIN * 2

  // faint logo behind the page, as on the old agreements
  if (assets.logoImg.length) {
    const lw = PAGE_W * 0.95
    doc.save().opacity(0.035).image(assets.logoImg, (PAGE_W - lw) / 2 - 40, PAGE_H * 0.36, { width: lw }).restore()
    doc.image(assets.logoImg, (PAGE_W - 92) / 2, MARGIN + 20, { width: 92 })
  }

  // the address, big and central — split "Flat 4708, Bagshaw Building, 1 Wards Place, London, E14 9EJ" into two lines
  // the street on top, the town and postcode beneath ("…, LONDON, E14 9EJ")
  const parts = o.address.split(/,\s*/).filter(Boolean)
  const tail = parts.length > 2 && /^(london|[a-z]{1,2}\d)/i.test(parts[parts.length - 2]) ? 2 : parts.length > 1 ? 1 : 0
  const line1 = parts.slice(0, parts.length - tail).join(', ').toUpperCase()
  const line2 = parts.slice(parts.length - tail).join(', ').toUpperCase()

  let y = PAGE_H * 0.40
  doc.font(B).fontSize(9).fillColor(GREY).text('ASSURED PERIODIC TENANCY AGREEMENT', MARGIN, y, { width: W, align: 'center', characterSpacing: 2.2 })
  y = doc.y + 22
  doc.font(B).fontSize(line1.length > 34 ? 21 : 25).fillColor(BLACK).text(line1, MARGIN, y, { width: W, align: 'center', lineGap: 2 })
  if (line2) doc.font(B).fontSize(line1.length > 34 ? 21 : 25).text(line2, MARGIN, doc.y + 2, { width: W, align: 'center', lineGap: 2 })
  y = doc.y + 14
  doc.save().strokeColor(BLACK).lineWidth(1.4).moveTo(PAGE_W / 2 - 34, y).lineTo(PAGE_W / 2 + 34, y).stroke().restore()
  y += 30

  doc.font(R).fontSize(15).fillColor(BLACK).text(`FROM ${longDate(o.start).toUpperCase()}`, MARGIN, y, { width: W, align: 'center' })
  y = doc.y + 10
  doc.font(R).fontSize(10.5).fillColor(GREY).text('(ROLLING MONTHLY — HOUSING ACT 1988 AS AMENDED BY THE RENTERS’ RIGHTS ACT 2025)', MARGIN, y, { width: W, align: 'center' })

  // parties, quietly, above the footer
  let py = PAGE_H - FOOTER_BAND_H - 118
  const col = (label: string, value: string, x: number, w: number) => {
    doc.font(B).fontSize(7.5).fillColor(GREY).text(label, x, py, { width: w, characterSpacing: 1.4 })
    doc.font(R).fontSize(10).fillColor(BLACK).text(value, x, py + 14, { width: w, lineGap: 1.5 })
  }
  const half = (W - 30) / 2
  col(o.names.length > 1 ? 'TENANTS' : 'TENANT', o.names.join('\n'), MARGIN, half)
  col('LANDLORD', o.letOnly ? o.landlord : `${o.landlord}\nC/O Capital Rooms Ltd`, MARGIN + half + 30, half)
  py = PAGE_H - FOOTER_BAND_H - 132
  doc.save().strokeColor('#d6d6d6').lineWidth(0.6).moveTo(MARGIN, py).lineTo(PAGE_W - MARGIN, py).stroke().restore()

  const footer = (assets.footerImg.length ? Object.assign(doc.openImage(assets.footerImg), { length: assets.footerImg.length }) : assets.footerImg) as unknown as Buffer
  drawPDFFooter(doc, footer, o.biz, R)
  doc.end()
  return done
}

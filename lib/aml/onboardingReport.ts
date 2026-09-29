// Customer Due Diligence record for a landlord onboarding, on the Capital Rooms letterhead.
// Kept for inspection by HMRC (MLR 2017 reg 40: records retained for 5 years after the end of the
// business relationship).
import {
  loadPDFLetterheadAssets, drawPDFFooter, PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H, BLACK, GREY,
  type PDFBizSettings,
} from '@/lib/pdfLetterhead'
import type { AutomatedReview, ReviewCheck } from '@/lib/landlordOnboarding/review'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

export interface ReviewerDecision {
  risk_level: 'low' | 'medium' | 'high'
  risk_reason: string
  risk_mitigation?: string
  identity_verified: boolean
  documents_viewed: boolean
  reviewer_name: string
  reviewed_at: string
}

export interface OnboardingReportInput {
  onboardingId: string
  clientName: string
  email: string
  createdAt?: string
  submittedAt?: string
  form: Record<string, unknown> & { documents?: Record<string, string[]> }
  review: AutomatedReview | null
  decision: ReviewerDecision | null
  biz: PDFBizSettings
}

const COL_W = PAGE_W - MARGIN * 2
const TOP = MARGIN + LOGO_H + 14
const BOTTOM = PAGE_H - FOOTER_BAND_H - 16
const RISK_COLOUR: Record<string, string> = { low: '#15803d', medium: '#b45309', high: '#b91c1c' }
const STATUS: Record<ReviewCheck['status'], [string, string]> = { pass: ['PASS', '#15803d'], review: ['CHECK', '#b45309'], fail: ['FAIL', '#b91c1c'] }

const fmt = (iso?: string) => {
  if (!iso) return '—'
  const uk = iso.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const d = new Date(uk ? `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}` : iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
const str = (f: Record<string, unknown>, k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '')

const DOC_LABEL: Record<string, string> = {
  id_document: 'Photo ID — first landlord', proof_of_address: 'Proof of address — first landlord',
  joint_id_document: 'Photo ID — second landlord', joint_proof_of_address: 'Proof of address — second landlord',
  proof_of_ownership: 'Proof of ownership', certificate_of_incorporation: 'Certificate of Incorporation',
  articles_of_association: 'Articles of Association', director_id: 'Director / beneficial owner ID',
  director_address: 'Director proof of address', other_document: 'Other document',
}

export async function generateOnboardingAMLReport(input: OnboardingReportInput): Promise<Buffer> {
  const { form: f, review, decision } = input
  const assets = loadPDFLetterheadAssets()
  const doc = new PDFDocument({ size: 'A4', margins: { top: TOP, bottom: 0, left: MARGIN, right: MARGIN }, info: { Title: `CDD Record — ${input.clientName}`, Author: input.biz.company_name } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej) })

  const logo = assets.logoImg.length ? doc.openImage(assets.logoImg) : null
  const footer = (assets.footerImg.length ? Object.assign(doc.openImage(assets.footerImg), { length: assets.footerImg.length }) : assets.footerImg) as unknown as Buffer
  const R = assets.fontReg, B = assets.fontBold
  const decorate = () => {
    if (logo) doc.image(logo as never, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
    drawPDFFooter(doc, footer, input.biz, R)
  }
  decorate()
  let y = TOP
  const newPage = () => { doc.addPage(); decorate(); y = TOP }
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage() }

  const para = (text: string, o: { bold?: boolean; size?: number; colour?: string; indent?: number } = {}) => {
    const size = o.size ?? 9, w = COL_W - (o.indent ?? 0)
    doc.font(o.bold ? B : R).fontSize(size)
    const h = doc.heightOfString(text, { width: w, lineGap: 2 })
    ensure(h + 4)
    doc.font(o.bold ? B : R).fontSize(size).fillColor(o.colour ?? BLACK).text(text, MARGIN + (o.indent ?? 0), y, { width: w, lineGap: 2 })
    y += h + 5
  }
  const heading = (text: string) => {
    ensure(40)
    y += 6
    doc.font(B).fontSize(10.5).fillColor(BLACK).text(text.toUpperCase(), MARGIN, y, { characterSpacing: 0.4 })
    y += 16
    doc.save().strokeColor('#d0d0d0').lineWidth(0.5).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore()
    y += 8
  }
  const row = (label: string, value: string) => {
    doc.font(R).fontSize(9)
    const h = Math.max(doc.heightOfString(value || '—', { width: COL_W - 170, lineGap: 2 }), 11)
    ensure(h + 4)
    doc.font(B).fontSize(9).fillColor(GREY).text(label, MARGIN, y, { width: 160 })
    doc.font(R).fontSize(9).fillColor(BLACK).text(value || '—', MARGIN + 170, y, { width: COL_W - 170, lineGap: 2 })
    y += h + 5
  }
  const checkRow = (c: ReviewCheck) => {
    const [tag, colour] = STATUS[c.status]
    doc.font(R).fontSize(8.5)
    const h = Math.max(doc.heightOfString(c.detail, { width: COL_W - 230, lineGap: 1.5 }), doc.heightOfString(c.label, { width: 165 })) + 2
    ensure(h + 4)
    doc.save().roundedRect(MARGIN, y - 1, 40, 12, 2).fill(colour).restore()
    doc.font(B).fontSize(7).fillColor('#ffffff').text(tag, MARGIN, y + 1.5, { width: 40, align: 'center' })
    doc.font(B).fontSize(8.5).fillColor(BLACK).text(c.label, MARGIN + 48, y, { width: 165 })
    doc.font(R).fontSize(8.5).fillColor('#333333').text(c.detail, MARGIN + 220, y, { width: COL_W - 220, lineGap: 1.5 })
    y += h + 5
  }

  // ── Title ──────────────────────────────────────────────────────────────
  doc.font(B).fontSize(15).fillColor(BLACK).text('Customer Due Diligence Record', MARGIN, MARGIN + 4, { width: COL_W - LOGO_W - 10 })
  doc.font(R).fontSize(9).fillColor(GREY).text('Anti-money laundering file — landlord client', MARGIN, MARGIN + 26, { width: COL_W - LOGO_W - 10 })
  doc.text(`Prepared ${fmt(new Date().toISOString())}`, MARGIN, MARGIN + 40)

  const level = decision?.risk_level ?? review?.suggested_level
  heading('Client')
  row('Client', input.clientName)
  row('Client type', f.entity_type === 'company' ? 'Company' : f.joint === 'yes' ? 'Individuals — joint landlords' : 'Individual')
  row('Contact email', input.email)
  row('Reference', input.onboardingId)
  row('Relationship', 'Residential property management (letting and management of the client’s property)')
  row('Form submitted', fmt(input.submittedAt))
  if (level) {
    ensure(30)
    doc.save().roundedRect(MARGIN, y, COL_W, 24, 4).fill('#f5f5f5').restore()
    doc.font(B).fontSize(10).fillColor(BLACK).text('Risk classification:', MARGIN + 10, y + 7)
    doc.font(B).fillColor(RISK_COLOUR[level]).text(`${level.toUpperCase()}${decision ? ' — confirmed by reviewer' : ' — automated suggestion, not yet confirmed'}`, MARGIN + 120, y + 7)
    y += 32
  }

  heading('Regulatory basis')
  para('Customer due diligence carried out under the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017: regulation 27 (when CDD is required), regulation 28 (identifying and verifying the customer and any beneficial owner, and understanding the purpose and intended nature of the relationship), regulation 33 (enhanced due diligence where risk is higher) and regulation 35 (politically exposed persons), following HMRC guidance for letting agency businesses (AMLG2300 and AMLG3300). Sanctions screening against the UK Sanctions List maintained under the Sanctions and Anti-Money Laundering Act 2018.', { colour: '#333333' })

  // ── Persons ───────────────────────────────────────────────────────────
  heading('Persons identified')
  if (f.entity_type === 'company') {
    row('Company', `${str(f, 'company_name')} (${str(f, 'company_reg')})`)
    row('Registered office', str(f, 'registered_office').replace(/\n/g, ', '))
    row('Directors / 25%+ owners', str(f, 'directors').replace(/\n/g, '; '))
  } else {
    const people = [
      { role: f.joint === 'yes' ? 'First landlord' : 'Landlord', p: '' },
      ...(f.joint === 'yes' ? [{ role: 'Second landlord', p: 'j_' }] : []),
    ]
    for (const { role, p } of people) {
      row(role, [str(f, p + 'salutation'), str(f, p + 'first_name'), str(f, p + 'last_name')].filter(Boolean).join(' '))
      row('Date of birth', fmt(str(f, p + 'dob')))
      row('Nationality', str(f, p + 'nationality'))
      const addr = p && f.j_same_address === true ? 'Same as first landlord'
        : [str(f, p + 'addr_line1'), str(f, p + 'addr_line2'), str(f, p + 'addr_town'), str(f, p + 'addr_postcode')].filter(Boolean).join(', ')
      row('Residential address', addr)
      row('ID type declared', (str(f, p + 'id_type') || 'passport').replace(/_/g, ' '))
      y += 4
    }
  }
  row('Country of residence', str(f, 'country_of_residence'))

  // ── Automated checks ─────────────────────────────────────────────────
  heading('Verification and screening results')
  if (review) {
    para(`Automated checks run ${fmt(review.generated_at)}. Documents were read automatically and compared with the details the client entered; every result was then reviewed by a member of staff (see sign-off).`, { colour: GREY, size: 8.5 })
    let area = ''
    for (const c of review.checks) {
      if (c.area !== area) {
        area = c.area
        ensure(30)
        y += 4
        doc.font(B).fontSize(8.5).fillColor(GREY).text(area.toUpperCase(), MARGIN, y, { characterSpacing: 0.3 })
        y += 13
      }
      checkRow(c)
    }
    if (review.sanctions_list_date) para(`UK Sanctions List version screened: ${review.sanctions_list_date}.`, { colour: GREY, size: 8.5 })
  } else para('Automated checks have not been run for this file.', { colour: GREY })

  // ── Declarations ─────────────────────────────────────────────────────
  heading('Client declarations')
  row('Politically exposed', f.pep === 'yes' ? `Yes — ${str(f, 'pep_details')}` : f.pep === 'no' ? 'No' : '—')
  if (f.joint === 'yes') row('Second landlord PEP', f.j_pep === 'yes' ? `Yes — ${str(f, 'j_pep_details')}` : f.j_pep === 'no' ? 'No' : '—')
  row('Acting for another', f.acting_for_other === 'yes' ? `Yes — ${str(f, 'acting_for_details')}` : f.acting_for_other === 'no' ? 'No' : '—')
  row('Source of funds', `${str(f, 'source_of_funds').replace(/_/g, ' ')}${str(f, 'source_of_funds_details') ? ` — ${str(f, 'source_of_funds_details')}` : ''}`)
  row('UK tax resident', f.uk_resident === 'no' ? `No — NRL ref ${str(f, 'nrl_ref') || 'not given'}` : 'Yes')
  row('Declaration', f.declaration === true ? 'Signed electronically on submission' : 'Not signed')

  // ── Risk assessment ───────────────────────────────────────────────────
  heading('Risk assessment')
  if (review) {
    row('Automated suggestion', review.suggested_level.toUpperCase())
    if (review.reasons.length) para('Factors identified:\n' + review.reasons.map(r => `•  ${r}`).join('\n'), { size: 8.5 })
    else para('No higher-risk factors identified by the automated checks.', { size: 8.5 })
  }
  if (decision) {
    row('Confirmed risk level', decision.risk_level.toUpperCase())
    row('Reviewer’s reasoning', decision.risk_reason)
    if (decision.risk_mitigation) row('Mitigation / EDD', decision.risk_mitigation)
    row('Identity verified', decision.identity_verified ? 'Yes' : 'No')
    row('Originals viewed', decision.documents_viewed ? 'Reviewer confirms each uploaded document was opened and examined' : 'No')
  } else para('Awaiting reviewer confirmation.', { colour: RISK_COLOUR.medium })

  // ── Document register ─────────────────────────────────────────────────
  heading('Document register')
  const docs = f.documents ?? {}
  const entries = Object.entries(docs).flatMap(([t, paths]) => paths.map((p, i) => ({ t, p, i, n: paths.length })))
  if (!entries.length) para('No documents on file.')
  for (const e of entries) {
    const ts = Number(e.p.split('/').pop()?.split('_').find(x => /^\d{13}$/.test(x)))
    row(`${DOC_LABEL[e.t] ?? e.t.replace(/_/g, ' ')}${e.n > 1 ? ` (${e.i + 1})` : ''}`, `Uploaded ${ts ? fmt(new Date(ts).toISOString()) : '—'} · stored securely (ref …${e.p.slice(-18)})`)
  }

  // ── Sign-off ──────────────────────────────────────────────────────────
  heading('Sign-off and retention')
  row('Reviewed by', decision?.reviewer_name ?? 'Not yet reviewed')
  row('Date of review', fmt(decision?.reviewed_at))
  para('This record and the documents listed above are retained for five years from the end of the business relationship (MLR 2017 regulation 40) and are subject to ongoing monitoring. The client must be re-screened if their circumstances change and at least annually against the UK Sanctions List.', { colour: '#333333', size: 8.5 })

  doc.end()
  return done
}

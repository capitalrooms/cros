// Capital Rooms — Rent Collection & Client Account Agreement PDF.
// The client (usually a property-owning company) manages its properties and tenants; Capital Rooms collects rent,
// pays agreed fixed outgoings, protects and releases deposits, inspects and reports. Same letterhead and layout
// as the full management agreement (generatePDF.ts), which is left untouched.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

import {
  loadPDFLetterheadAssets,
  PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H,
  BLACK, GREY,
  drawPDFFooter,
} from '@/lib/pdfLetterhead'
import type { ManagementAgreementData } from '@/lib/managementAgreement/generatePDF'
import { rentCollectionTermsFrom } from '@/lib/managementAgreement/rentCollectionTerms'
import { durationSentence } from '@/lib/managementAgreement/durationTerms'
import type { AgreementBlock } from '@/lib/managementAgreement/blocks'

const COL_W = PAGE_W - MARGIN * 2
const LIGHT = '#f8f8f8'
const BORDER = '#e0e0e0'

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`

function clientName(d: ManagementAgreementData): string {
  if (d.entityType === 'company') return d.companyName || 'The Client'
  const one = [d.clientTitle, d.clientFirstName, d.clientLastName].filter(Boolean).join(' ')
  const two = [d.client2Title, d.client2FirstName, d.client2LastName].filter(Boolean).join(' ')
  return two ? `${one || 'The Client'} & ${two}` : one || 'The Client'
}

export async function generateRentCollectionAgreementPDF(data: ManagementAgreementData, rec?: AgreementBlock[]): Promise<Buffer> {
  const t = rentCollectionTermsFrom(data.rentCollection)
  return new Promise((resolve, reject) => {
    const { logoImg, footerImg, fontReg, fontBold } = loadPDFLetterheadAssets()
    const biz = data.bizSettings ?? {
      company_name: 'Capital Rooms', address_line1: 'Hoxton Mix, 66 Paul Street', city: 'London',
      postcode: 'EC2A 4NA', email: 'info@capitalrooms.co.uk', phone: '0207 112 9163',
    }
    const props = data.properties.map(s => s.replace(/\n/g, ', '))
    const client = clientName(data)
    const prop = props.length === 1 ? 'the Property' : 'the Properties'
    const Prop = props.length === 1 ? 'The Property' : 'The Properties'

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: FOOTER_BAND_H + 20, left: MARGIN, right: MARGIN },
      info: { Title: `Capital Rooms — Rent Collection Agreement — ${client}`, Author: 'Capital Rooms' },
    })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const decor = () => {
      if (logoImg.length) doc.image(logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
      drawPDFFooter(doc, footerImg, biz, fontReg)
    }
    decor()
    doc.on('pageAdded', decor)

    let y = MARGIN
    const ensureSpace = (needed: number) => {
      if (y + needed > PAGE_H - FOOTER_BAND_H - 24) { doc.addPage(); y = MARGIN + LOGO_H + 12 }
    }
    const rule = (colour = '#c0c0c0', w = COL_W) => {
      doc.save().strokeColor(colour).lineWidth(0.5).moveTo(MARGIN, y).lineTo(MARGIN + w, y).stroke().restore()
    }
    const para = (text: string, o: { bold?: boolean; size?: number; indent?: number; colour?: string; noRecord?: boolean } = {}) => {
      if (!o.noRecord) rec?.push({ kind: 'para', text, bold: o.bold, small: (o.size ?? 9.5) < 9, muted: !!o.colour && o.colour !== BLACK, indent: !!o.indent })
      const size = o.size ?? 9.5, indent = o.indent ?? 0, width = COL_W - indent, font = o.bold ? fontBold : fontReg
      const h = doc.font(font).fontSize(size).heightOfString(text, { width, lineGap: 2 })
      ensureSpace(h + 10)
      doc.save().font(font).fontSize(size).fillColor(o.colour ?? BLACK)
        .text(text, MARGIN + indent, y, { width, lineGap: 2, align: 'justify' }).restore()
      y += h + 10
    }
    const label = (text: string) => {
      rec?.push({ kind: 'label', text })
      ensureSpace(28)
      doc.save().font(fontBold).fontSize(10).fillColor(BLACK).text(text, MARGIN, y).restore()
      y += 16
    }
    const section = (title: string, body: () => void) => {
      label(title); body(); y += 6; rule(); y += 16
    }
    let n = 0
    const clause = (title: string, body: string) => {
      // Keep the heading with its whole paragraph (para() moves a paragraph that doesn't fit to the next page).
      ensureSpace(24 + doc.font(fontReg).fontSize(9.5).heightOfString(body, { width: COL_W - 16, lineGap: 2 }) + 10)
      rec?.push({ kind: 'clause', num: String(n + 1), title, text: body })
      doc.save().font(fontBold).fontSize(9.5).fillColor(BLACK).text(`${++n}.  ${title}`, MARGIN, y).restore()
      y += 14
      para(body, { indent: 16, noRecord: true })
    }
    const bullets = (items: string[], indent = 16) => {
      rec?.push({ kind: 'bullets', items })
      for (const item of items) {
        const h = doc.font(fontReg).fontSize(9.5).heightOfString(item, { width: COL_W - indent - 10, lineGap: 2 })
        ensureSpace(h + 8)
        doc.save().font(fontReg).fontSize(9.5).fillColor(BLACK)
          .text('•', MARGIN + indent - 10, y, { width: 10, lineBreak: false })
          .text(item, MARGIN + indent, y, { width: COL_W - indent - 10, lineGap: 2 }).restore()
        y += h + 8
      }
    }
    const table = (head: [string, string], rows: [string, string][]) => {
      rec?.push({ kind: 'table', head, rows })
      const c1 = COL_W * 0.42, c2 = COL_W - c1
      const rowH = (r: [string, string]) => Math.max(
        doc.font(fontReg).fontSize(8.5).heightOfString(r[0], { width: c1 - 12 }),
        doc.font(fontReg).fontSize(8.5).heightOfString(r[1], { width: c2 - 12 }),
      ) + 14
      ensureSpace(24 + rows.reduce((a, r) => a + rowH(r), 0))
      doc.save().fillColor(BLACK).rect(MARGIN, y, COL_W, 24).fill().restore()
      doc.save().font(fontBold).fontSize(8.5).fillColor('#fff')
        .text(head[0], MARGIN + 6, y + 8, { width: c1 - 12, lineBreak: false })
        .text(head[1], MARGIN + c1 + 6, y + 8, { width: c2 - 12, lineBreak: false }).restore()
      y += 24
      rows.forEach((r, i) => {
        const h = rowH(r)
        ensureSpace(h)
        if (i % 2 === 1) doc.save().fillColor(LIGHT).rect(MARGIN, y, COL_W, h).fill().restore()
        doc.save().font(fontReg).fontSize(8.5).fillColor(BLACK)
          .text(r[0], MARGIN + 6, y + 7, { width: c1 - 12 })
          .text(r[1], MARGIN + c1 + 6, y + 7, { width: c2 - 12 }).restore()
        doc.save().strokeColor('#ececec').lineWidth(0.5).moveTo(MARGIN, y + h).lineTo(MARGIN + COL_W, y + h).stroke().restore()
        y += h
      })
      y += 14
    }

    // ── Header ────────────────────────────────────────────────────────────────
    rec?.push({ kind: 'title', text: 'RENT COLLECTION AGREEMENT', sub: 'Rent Collection & Client Account Administration — Capital Rooms', date: formatDate(data.agreementDate) })
    doc.save().font(fontBold).fontSize(14).fillColor(BLACK).text('RENT COLLECTION AGREEMENT', MARGIN, y).restore()
    y += 20
    doc.save().font(fontReg).fontSize(10).fillColor(GREY)
      .text('Rent Collection & Client Account Administration — Capital Rooms', MARGIN, y, { width: COL_W - LOGO_W - 16 }).restore()
    y += 14
    y = Math.max(y, MARGIN + LOGO_H + 12)
    doc.save().font(fontReg).fontSize(9).fillColor(GREY).text(formatDate(data.agreementDate), MARGIN, y).restore()
    y += 20
    rule(); y += 16

    section('PARTIES', () => {
      para(`Agent: Capital Rooms (a trading name of the managing company), whose registered office is at ${biz.address_line1}, ${biz.city} ${biz.postcode} ("the Agent").`)
      const who = data.entityType === 'company'
        ? `${client}${data.companyReg ? `, registered in ${data.companyCountry || 'England and Wales'} under company number ${data.companyReg}` : ''}, whose registered office is at ${data.clientAddress.join(', ')}${t.signatoryName ? `, acting by its ${t.signatoryRole.toLowerCase()} ${t.signatoryName}` : ''}`
        : `${client}, of ${data.clientAddress.join(', ')}`
      para(`Client: ${who} ("the Client"). The Client is the owner of ${prop}.`)
    })

    section(props.length === 1 ? 'PROPERTY' : 'PROPERTIES', () => {
      if (props.length === 1) para(`This agreement relates to: ${props[0]} ("the Property").`)
      else { para('This agreement relates to the following properties ("the Properties"):'); bullets(props) }
    })

    section('COMMENCEMENT', () => para(`This agreement shall commence on ${formatDate(data.commencementDate)}.`))

    if (data.nominatedAccount) {
      const a = data.nominatedAccount
      section('NOMINATED ACCOUNT', () => para(`Balances due to the Client under this agreement shall be paid to the Client's nominated account: ${[
        `Account name: ${a.accountName}`, a.bankName ? `Bank: ${a.bankName}` : '', `Sort code: ${a.sortCode}`, `Account number: ${a.accountNumber}`,
      ].filter(Boolean).join('; ')}. The Client shall notify the Agent in writing of any change to this account.`))
    }

    // ── Clauses ───────────────────────────────────────────────────────────────
    clause('Appointment and Scope',
      `The Client appoints the Agent to provide the rent collection, client account and administration services set out in Schedule 1 ("the Services") for ${prop} from the commencement date. The Agent is not appointed as managing agent for ${prop}. Anything not listed in Schedule 1 is outside the scope of this agreement unless agreed in writing under clause 12.`)

    clause('The Client Manages ' + Prop.replace('The ', 'the '),
      `The Client remains the manager of ${prop} and the tenants' main point of contact, and is responsible for the matters set out in Schedule 3, including maintenance, repairs, complaints, emergencies, rent queries and arrears, contractors, house rules, notices and all other tenancy and day-to-day management matters. The Client shall present itself to tenants as the manager of ${prop} and shall not hold the Agent out to tenants or third parties as the managing agent.`)

    clause('Duration',
      durationSentence(data))

    clause('Rent Collection',
      `Tenants shall pay rent into the Agent's designated client account. The Agent shall record all rent received against each property and tenancy. The Agent may contact tenants about payment details and the accounting of rent, but shall not chase or recover arrears, which remain the Client's responsibility. The Agent shall tell the Client of any rent not received or short-paid in each monthly statement, and sooner where practicable.`)

    clause('Agreed Fixed Outgoings',
      `The fixed property outgoings listed in Schedule 2 ("the Agreed Fixed Outgoings") are agreed in writing by the parties. The Client gives the Agent standing authority to pay the Agreed Fixed Outgoings from funds held for the Client as they fall due, including by direct debit from the client account. An outgoing may only be added to, removed from or changed in Schedule 2 by written agreement of both parties (email is sufficient). The Agent shall not make any other payment from the client account without the Client's prior written instruction. Contractor invoices, repairs, maintenance and other variable expenditure shall not be paid through the client account unless the Client gives written instruction for a specific payment. The Agent shall obtain and keep the supplier statements and invoices for the Agreed Fixed Outgoings.`)

    clause('Working Float',
      `The Client shall maintain a working float of ${money(t.floatAmount)} in the client account so that the Agreed Fixed Outgoings can be paid as they fall due, and the Agent may retain the float from rent received before paying any balance to the Client. If the funds held for the Client are not enough to pay an Agreed Fixed Outgoing, the Agent shall notify the Client and the Client shall pay the shortfall into the client account within ${t.floatTopUpDays} days. The Agent is never obliged to use its own funds and is not liable for any late payment charge, interruption of supply or other loss caused by insufficient funds.`)

    clause('Monthly Statements and Payment of Balances',
      `Each month the Agent shall provide the Client with a statement for each property showing rent received, Agreed Fixed Outgoings paid, the Agent's fees, the float and the balance, together with copies of the relevant supplier statements. After deducting the Agreed Fixed Outgoings, the Agent's fees and any sum needed to restore the float, the Agent shall pay the balance to the Client's nominated account each month.`)

    clause('Annual Summary',
      `After the end of each tax year the Agent shall provide reasonable assistance by preparing, for each property, a summary of rent collected, Agreed Fixed Outgoings paid, the Agent's fees and deposits held, for use by the Client and its accountant. The Agent does not provide tax or accounting advice.`)

    clause('Tenancy Deposits',
      `Tenant deposits shall be paid to the Agent. The Agent shall protect each deposit with a government-authorised tenancy deposit scheme and give the tenant and any relevant person the prescribed information, in each case within 30 days of receiving the deposit. At the end of each tenancy the Agent shall administer the release of the deposit, repaying it in accordance with any deductions agreed between the Client and the tenant; where deductions are disputed, the Agent shall refer the dispute to the scheme's dispute resolution service using evidence supplied by the Client. As the Client manages ${prop}, the Client shall supply the check-in inventory, check-out report and any other evidence needed to support a deduction. Deposits held by the Client or a previous agent at the commencement date shall be transferred into the Agent's protection; the Client shall arrange the transfer with the current holder and provide the details the Agent requires. The Agent is not responsible for any failure to protect a deposit or to give prescribed information before that deposit is transferred to it.`)

    clause('Inspections',
      `The Agent shall inspect ${props.length === 1 ? 'the Property' : 'each property'} every ${t.inspectionMonths} months and send the Client a written report noting any repair, maintenance or compliance matters observed. Inspections are visual and non-invasive and are not a survey or compliance check. The Client remains responsible for acting on any matter reported, and shall give tenants the notice required for access and arrange access for each inspection.`)

    clause('Communication',
      `The parties shall hold a check-in each month to review the statements and any matters arising. Tenant and day-to-day management communication remains with the Client; the Agent shall deal with the Client's nominated contact on matters within the Services.`)

    clause('Additional Services',
      `Services outside Schedule 1 are only provided if agreed in writing in advance, at the fees in Schedule 4. In particular: (a) any visit to a property other than a scheduled inspection or a visit for a letting is charged at ${money(t.visitFee)} per visit; (b) letting services (marketing, viewings, referencing and tenancy agreements) are charged at a price agreed in writing before each letting; and (c) any request to deal with maintenance, contractors, tenant enquiries, arrears, notices or compliance matters will be quoted separately and is only undertaken once agreed in writing.`)

    clause('Compliance and Safety',
      `The Client is solely responsible for ensuring that ${prop} comply with all applicable legislation, including any HMO licence and its conditions, gas safety, electrical safety (EICR), the Energy Performance Certificate, smoke and carbon monoxide alarms (including testing), fire doors and fire safety measures (including testing and fire risk assessments), the display of any licence and required notices, and Right to Rent checks (other than for a letting the Agent is instructed to carry out). The Agent may keep copies of certificates and documents supplied by the Client but does not accept responsibility for checking, arranging or renewing them.`)

    clause('Matters Arising Before Commencement',
      `Any rent arrears, notices, possession proceedings, disputes, claims or liabilities relating to ${prop} that arose before the commencement date remain the Client's responsibility and the Agent accepts no responsibility for them${t.excludedMatters ? `, including: ${t.excludedMatters.replace(/\s*\n\s*/g, '; ').replace(/[.;\s]+$/, '')}` : ''}.`)

    clause('Client Money Protection',
      `The Agent is a member of an approved Client Money Protection (CMP) scheme. All client and tenant monies are held in a designated client account separately from the Agent's own funds.`)

    clause('Liability and Indemnity',
      `The Agent shall carry out the Services with reasonable care and skill. The Agent is not responsible for the management, condition, repair or legal compliance of ${prop}. The Agent's liability to the Client shall not exceed the total fees received by the Agent in the twelve months immediately preceding the event giving rise to the claim, and neither party shall be liable for indirect or consequential losses. The Client shall indemnify the Agent against any claim, loss, fine or cost arising from the Client's management of ${prop}, any breach of the Client's obligations under this agreement or any failure of ${prop} to comply with legislation, except to the extent caused by the Agent's negligence.`)

    clause('Data Protection',
      `Each party shall comply with its obligations under the UK General Data Protection Regulation and the Data Protection Act 2018. The Agent shall process the personal data of the Client and of tenants only as necessary for the performance of this agreement and shall maintain appropriate technical and organisational measures to protect such data.`)

    clause('Anti-Money Laundering',
      `The Agent is required by law to carry out identity verification checks on the Client${data.entityType === 'company' ? ', its directors and beneficial owners' : ''} and may be required to make reports to the National Crime Agency in certain circumstances. The Client confirms that the information provided in the AML documentation submitted to the Agent is true and accurate.`)

    clause('Termination',
      `Either party may terminate this agreement immediately by written notice if the other party commits a material breach of any provision of this agreement and fails to remedy that breach within 28 days of receiving written notice requiring it to do so, or if the other party becomes insolvent or enters into a formal insolvency process. On termination for any reason, the Agent shall pay any Agreed Fixed Outgoings already due, deduct its outstanding fees and pay the remaining client funds to the Client with a final statement, and shall transfer any deposits it holds to the Client or the Client's new agent through the deposit scheme, notifying tenants as required. The Client shall arrange for any direct debits on the client account to be moved before the termination date.`)

    clause('Dispute Resolution',
      `In the event of a dispute arising under or in connection with this agreement, the parties shall first attempt to resolve the dispute by negotiation in good faith. If the dispute cannot be resolved by negotiation, either party may refer the matter to mediation. The Agent is a member of a Property Redress Scheme and the Client may make a complaint through that scheme if it remains unresolved.`)

    clause('Governing Law',
      `This agreement shall be governed by and construed in accordance with the laws of England and Wales and the parties submit to the exclusive jurisdiction of the courts of England and Wales.`)

    clause('Entire Agreement',
      `This agreement (together with the Schedules) constitutes the entire agreement between the parties with respect to its subject matter and supersedes any prior agreement or arrangement (whether oral or written). Any variation must be agreed in writing by both parties.`)

    y += 10; rule('#999'); y += 20

    // ── Schedules ─────────────────────────────────────────────────────────────
    ensureSpace(60)
    label('SCHEDULE 1 — SERVICES PROVIDED BY THE AGENT')
    bullets([
      "Receive tenants' rent into the Agent's designated client account",
      'Record rent received against each property and tenancy',
      'Tell the Client of any rent not received or short-paid',
      'Pay the Agreed Fixed Outgoings in Schedule 2 as they fall due',
      'Obtain and keep supplier statements and invoices for the Agreed Fixed Outgoings',
      'Hold and account for the working float',
      'Protect tenant deposits with a government-authorised scheme and give the prescribed information',
      "Take existing deposits into the Agent's protection on commencement",
      'Administer the release of deposits at the end of each tenancy, including referring disputes to the scheme',
      'Provide a monthly statement for each property with supporting supplier statements',
      "Pay the monthly balance to the Client's nominated account",
      'Prepare an annual summary of rent, fixed outgoings, fees and deposits for each property',
      `Inspect ${props.length === 1 ? 'the Property' : 'each property'} every ${t.inspectionMonths} months and provide a written report`,
      'Hold a monthly check-in with the Client',
      'Keep accurate records of all transactions relating to ' + prop,
    ])
    y += 10; rule('#999'); y += 20

    ensureSpace(80)
    label('SCHEDULE 2 — AGREED FIXED OUTGOINGS')
    para('The Agent is authorised to pay the following from funds held for the Client as they fall due. Changes only by written agreement of both parties (clause 5).')
    if (t.fixedOutgoings.length) bullets(t.fixedOutgoings)
    else para('To be agreed in writing before the commencement date.', { colour: GREY })
    y += 10; rule('#999'); y += 20

    ensureSpace(60)
    label('SCHEDULE 3 — RESPONSIBILITIES KEPT BY THE CLIENT')
    bullets([
      `Being the tenants' main point of contact for ${prop}`,
      'Maintenance, repairs and emergencies, including out-of-hours calls',
      'Instructing, supervising and paying contractors',
      'Tenant complaints, house rules and day-to-day tenant communication',
      'Rent queries, rent arrears and their recovery',
      'Serving notices and all tenancy and possession matters',
      'HMO licensing and licence conditions, including displaying the licence and required notices',
      'Gas, electrical, EPC, smoke and carbon monoxide alarm compliance, including alarm testing',
      'Fire safety, including fire door checks and testing and fire risk assessments',
      'Buildings and landlord insurance',
      'Giving tenants notice of, and arranging access for, inspections',
      'Supplying the evidence (inventories, check-out reports) needed to support any deposit deduction',
      `Keeping the float topped up and paying any shortfall within ${t.floatTopUpDays} days`,
      'Telling the Agent promptly of any new tenancy, rent change, tenant departure or change of supplier',
    ])
    y += 10; rule('#999'); y += 20

    ensureSpace(320)
    label('SCHEDULE 4 — FEES')
    table(['Fee', 'Details'], [
      ['Rent collection & client account service', t.serviceFee || 'To be agreed'],
      ['Deposit protection and release', 'Included'],
      ['Monthly statements and annual summary', 'Included'],
      [`Inspections (every ${t.inspectionMonths} months)`, 'Included'],
      ['Additional property visit', `${money(t.visitFee)} per visit (outside lettings and scheduled inspections)`],
      ['Letting (if instructed)', t.lettingFee],
      ['Working float', `${money(t.floatAmount)} held in the client account (not a fee)`],
      ['Other services outside Schedule 1', 'Quoted and agreed in writing in advance'],
      ['Court attendance', 'By separate quotation, agreed in advance'],
    ])
    para('Capital Rooms Ltd is not VAT registered, so no VAT is added to our fees. The service fee is deducted from rent collected before the balance is paid to the Client. Other fees are invoiced separately.')
    y += 10; rule('#999'); y += 20

    // ── Signatures ────────────────────────────────────────────────────────────
    ensureSpace(190)
    label('SIGNATURES')
    para('This agreement has been entered into on the date stated above.')
    y += 12
    rec?.push({ kind: 'signatures', left: 'Signed for and on behalf of Capital Rooms', right: `Signed for and on behalf of ${client}`, rightRole: data.entityType === 'company' ? t.signatoryRole : 'Signature', rightName: t.signatoryName || null })
    const halfW = (COL_W - 20) / 2, rightX = MARGIN + halfW + 20
    const line = (x: number, w: number) => doc.save().strokeColor(BLACK).lineWidth(0.5).moveTo(x, y).lineTo(x + w, y).stroke().restore()
    doc.save().font(fontBold).fontSize(8.5).fillColor(BLACK)
      .text('Signed for and on behalf of Capital Rooms', MARGIN, y, { width: halfW })
      .text(`Signed for and on behalf of ${client}`, rightX, y, { width: halfW }).restore()
    y += 32
    line(MARGIN, halfW); line(rightX, halfW); y += 5
    doc.save().font(fontReg).fontSize(8).fillColor(GREY)
      .text('Authorised signatory', MARGIN, y, { width: halfW, lineBreak: false })
      .text(data.entityType === 'company' ? t.signatoryRole : 'Signature', rightX, y, { width: halfW, lineBreak: false }).restore()
    y += 26
    line(MARGIN, halfW * 0.55); line(rightX, halfW * 0.55); y += 5
    doc.save().font(fontReg).fontSize(8).fillColor(GREY)
      .text('Date', MARGIN, y, { width: halfW * 0.55, lineBreak: false })
      .text('Date', rightX, y, { width: halfW * 0.55, lineBreak: false }).restore()
    y += 26
    if (t.signatoryName) {
      doc.save().font(fontReg).fontSize(9).fillColor(BLACK).text(t.signatoryName, rightX, y - 13, { width: halfW, lineBreak: false }).restore()
    }
    line(MARGIN, halfW); line(rightX, halfW); y += 5
    doc.save().font(fontReg).fontSize(8).fillColor(GREY)
      .text('Print name', MARGIN, y, { width: halfW, lineBreak: false })
      .text('Print name', rightX, y, { width: halfW, lineBreak: false }).restore()
    y += 30
    para(`Agreement reference: Rent Collection — ${client} — ${props.join('; ')} — ${formatDate(data.agreementDate)}`, { colour: '#888', size: 7.5 })

    doc.end()
  })
}

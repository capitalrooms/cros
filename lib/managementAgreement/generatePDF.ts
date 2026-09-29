// Capital Rooms — Management Agreement PDF generator
// Uses pdfkit + shared letterhead from lib/pdfLetterhead.ts
// Multi-page document: logo + footer drawn on every page via 'pageAdded' event.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

import {
  loadPDFLetterheadAssets,
  PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H,
  BLACK, GREY,
  drawPDFFooter,
  type PDFBizSettings,
  type PDFLetterheadAssets,
} from '@/lib/pdfLetterhead'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ManagementAgreementData {
  agreementType: 'hmo' | 'single'          // HMO = multiple occupancy
  agreementDate: string                     // ISO date string e.g. "2026-09-08"
  entityType: 'individual' | 'company'
  // Individual client fields
  clientTitle?: string                       // Mr / Mrs / Ms / Dr etc.
  clientFirstName?: string
  clientLastName?: string
  // Second (joint) landlord — individual only
  client2Title?: string
  client2FirstName?: string
  client2LastName?: string
  // Company fields
  companyName?: string
  companyReg?: string
  companyCountry?: string
  // Shared
  clientAddress: string[]                   // ["12 High Street", "London", "SW1 1AA"]
  properties: string[]                      // property address(es)
  managementFee: number                     // e.g. 10 (= 10%)
  letFee: string                            // e.g. "£300 per unit" or "£500"
  floatAmount?: number                      // HMO: 500, single: omit
  epcCost: number                           // 75 or 100
  commencementDate: string                  // ISO date
  inventoryNote?: string                    // optional free text
  // Client's nominated account for rent remittance (added once confirmed through onboarding)
  nominatedAccount?: { accountName: string; bankName?: string; sortCode: string; accountNumber: string }
  // Injected by API route
  bizSettings?: PDFBizSettings
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const COL_W = PAGE_W - MARGIN * 2
const LIGHT  = '#f8f8f8'
const BORDER = '#e0e0e0'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function clientName(d: ManagementAgreementData): string {
  if (d.entityType === 'company') return d.companyName ?? 'The Client'
  const name1 = [d.clientTitle, d.clientFirstName, d.clientLastName].filter(Boolean).join(' ')
  const name2 = [d.client2Title, d.client2FirstName, d.client2LastName].filter(Boolean).join(' ')
  if (name2) return `${name1 || 'The Client'} & ${name2}`
  return name1 || 'The Client'
}

function hRule(doc: PDFKit.PDFDocument, x: number, y: number, w: number, colour = BORDER) {
  doc.save().strokeColor(colour).lineWidth(0.5).moveTo(x, y).lineTo(x + w, y).stroke().restore()
}

// ── Main generator ─────────────────────────────────────────────────────────────

export async function generateManagementAgreementPDF(data: ManagementAgreementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const assets: PDFLetterheadAssets = loadPDFLetterheadAssets()
    const { logoImg, footerImg, fontReg, fontBold } = assets
    const biz = data.bizSettings ?? {
      company_name: 'Capital Rooms',
      address_line1: 'Hoxton Mix, 66 Paul Street',
      city: 'London',
      postcode: 'EC2A 4NA',
      email: 'info@capitalrooms.co.uk',
      phone: '0207 112 9163',
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: FOOTER_BAND_H + 20, left: MARGIN, right: MARGIN },
      info: {
        Title: `Capital Rooms — Management Agreement — ${data.properties[0] ?? ''}`,
        Author: 'Capital Rooms',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Normalise addresses — stored with \n separators, PDF needs them inline
    const inlineAddr = (s: string) => s.replace(/\n/g, ', ')
    const props = data.properties.map(inlineAddr)

    const typeLabel = data.agreementType === 'hmo' ? 'Multiple Occupancy' : 'Single Occupier'
    const client = clientName(data)
    const propList = props.join('; ')

    // ── Draw logo + footer on EVERY page ─────────────────────────────────────
    function drawPageDecor() {
      if (logoImg.length) {
        doc.image(logoImg, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
      }
      drawPDFFooter(doc, footerImg, biz, fontReg)
    }

    // First page
    drawPageDecor()

    // Subsequent pages
    doc.on('pageAdded', () => { drawPageDecor() })

    // ── Content state ─────────────────────────────────────────────────────────
    let y = MARGIN

    // Convenience: ensure we have enough room; if not, add a page.
    // On a new page, start content below the logo (MARGIN + LOGO_H + 12)
    // so body text never collides with the top-right logo area.
    function ensureSpace(needed: number) {
      if (y + needed > PAGE_H - FOOTER_BAND_H - 24) {
        doc.addPage()
        y = MARGIN + LOGO_H + 12
      }
    }

    function drawPara(text: string, opts?: { bold?: boolean; size?: number; indent?: number; colour?: string }) {
      const fontSize = opts?.size ?? 9.5
      const indent   = opts?.indent ?? 0
      const colour   = opts?.colour ?? BLACK
      const font     = opts?.bold ? fontBold : fontReg
      const width    = COL_W - indent

      const h = doc.font(font).fontSize(fontSize).heightOfString(text, { width, lineGap: 2 })
      ensureSpace(h + 10)
      doc.save().font(font).fontSize(fontSize).fillColor(colour)
        .text(text, MARGIN + indent, y, { width, lineGap: 2, align: 'justify' })
        .restore()
      y += h + 10
    }

    function drawLabel(text: string) {
      ensureSpace(28)
      doc.save().font(fontBold).fontSize(10).fillColor(BLACK)
        .text(text, MARGIN, y)
        .restore()
      y += 16
    }

    function drawClause(num: string, title: string, body: string) {
      ensureSpace(50)
      // Clause number + title
      doc.save()
        .font(fontBold).fontSize(9.5).fillColor(BLACK)
        .text(`${num}.  ${title}`, MARGIN, y)
        .restore()
      y += 14
      drawPara(body, { indent: 16 })
    }

    function drawBullets(items: string[], indent = 16) {
      for (const item of items) {
        const h = doc.font(fontReg).fontSize(9.5).heightOfString(item, { width: COL_W - indent - 10, lineGap: 2 })
        ensureSpace(h + 8)
        doc.save().font(fontReg).fontSize(9.5).fillColor(BLACK)
          .text('•', MARGIN + indent - 10, y, { width: 10, lineBreak: false })
          .text(item, MARGIN + indent, y, { width: COL_W - indent - 10, lineGap: 2 })
          .restore()
        y += h + 8
      }
    }

    function spacer(n = 10) { y += n }

    // ────────────────────────────────────────────────────────────────────────
    // PAGE 1 — HEADER
    // ────────────────────────────────────────────────────────────────────────

    // Title block — left side, parallel to logo
    doc.save().font(fontBold).fontSize(14).fillColor(BLACK)
      .text('MANAGEMENT AGREEMENT', MARGIN, y)
      .restore()
    y += 20
    doc.save().font(fontReg).fontSize(10).fillColor(GREY)
      .text(`${typeLabel} — Capital Rooms`, MARGIN, y)
      .restore()
    y += 14

    // Ensure we clear the logo
    y = Math.max(y, MARGIN + LOGO_H + 12)

    // Date line
    doc.save().font(fontReg).fontSize(9).fillColor(GREY)
      .text(formatDate(data.agreementDate), MARGIN, y)
      .restore()
    y += 20

    hRule(doc, MARGIN, y, COL_W, '#c0c0c0')
    y += 16

    // ── PARTIES ──────────────────────────────────────────────────────────────
    drawLabel('PARTIES')

    drawPara(`Agent: Capital Rooms (a trading name of the managing company), whose registered office is at ${biz.address_line1}, ${biz.city} ${biz.postcode} ("the Agent").`, { bold: false })

    const clientDesc = data.entityType === 'company'
      ? `${data.companyName}${data.companyReg ? `, registered in ${data.companyCountry ?? 'England'} under company number ${data.companyReg}` : ''}`
      : clientName(data)
    const clientAddr = data.clientAddress.join(', ')
    drawPara(`Client: ${clientDesc}, of ${clientAddr} ("the Client").`, { bold: false })

    spacer(6)
    hRule(doc, MARGIN, y, COL_W, '#c0c0c0')
    y += 16

    // ── PROPERTY ─────────────────────────────────────────────────────────────
    drawLabel('PROPERTY')
    drawPara(
      props.length === 1
        ? `The property to which this agreement relates is: ${props[0]} ("the Property").`
        : `The properties to which this agreement relates are ("the Properties"):`,
    )
    if (props.length > 1) {
      drawBullets(props)
      spacer(4)
    }

    spacer(6)
    hRule(doc, MARGIN, y, COL_W, '#c0c0c0')
    y += 16

    // ── COMMENCEMENT ─────────────────────────────────────────────────────────
    drawLabel('COMMENCEMENT')
    drawPara(`This agreement shall commence on ${formatDate(data.commencementDate)}.`)

    spacer(6)
    hRule(doc, MARGIN, y, COL_W, '#c0c0c0')
    y += 16

    if (data.nominatedAccount) {
      const acc = data.nominatedAccount
      drawLabel('NOMINATED ACCOUNT')
      drawPara(`Rent collected under this agreement shall be remitted, net of the Agent's fees and authorised expenses, to the Client's nominated account: ${[
        `Account name: ${acc.accountName}`,
        acc.bankName ? `Bank: ${acc.bankName}` : '',
        `Sort code: ${acc.sortCode}`,
        `Account number: ${acc.accountNumber}`,
      ].filter(Boolean).join('; ')}. The Client shall notify the Agent in writing of any change to this account.`)
      spacer(6)
      hRule(doc, MARGIN, y, COL_W, '#c0c0c0')
      y += 16
    }

    // ── CLAUSES 1–26 ─────────────────────────────────────────────────────────

    const prop = data.properties.length === 1 ? 'the Property' : 'the Properties'
    const mgmtFee = `${data.managementFee}%`
    const floatStr = data.floatAmount ? `£${data.floatAmount}` : undefined

    drawClause('1', 'Appointment',
      `The Client hereby appoints the Agent as sole and exclusive managing agent for ${prop} with effect from the commencement date. The Agent accepts such appointment on the terms and conditions set out in this agreement.`)

    drawClause('2', 'Duration',
      `This agreement shall continue until terminated by either party giving not less than three (3) calendar months' written notice, such notice not to be given during the first twelve months of the agreement. Termination does not affect any tenancy in place at the date of termination which shall continue to be managed by the Agent until its lawful termination.`)

    drawClause('3', 'Agent\'s Authority',
      `The Client authorises the Agent to: (a) market and let the Property at such rent and on such terms as the Agent considers appropriate; (b) collect rent and other sums payable by tenants; (c) instruct contractors and tradespeople for maintenance and repair work up to the pre-authorised expenditure limit; (d) serve statutory and other notices; and (e) take such other actions as are reasonably necessary for the management of the Property.`)

    drawClause('4', 'Letting Services',
      `The Agent shall carry out the services described in Schedule 1 to this agreement. The Agent shall use all reasonable endeavours to find suitable tenants for the Property. The Agent does not guarantee that the Property will be let or that it will achieve any particular rental level.`)

    drawClause('5', 'Rent Collection',
      `The Agent shall collect all rent and other monies due from tenants and, following deduction of the management fee and any other authorised expenses, shall remit the balance to the Client's nominated bank account. The Agent shall maintain proper accounts of all monies received and disbursed.`)

    drawClause('6', 'Maintenance and Repairs',
      `The Agent shall arrange for routine maintenance and minor repairs without further reference to the Client where the cost does not exceed £250 (or such other figure as may be agreed in writing). For works exceeding this sum, the Agent shall obtain the Client's prior approval except in cases of genuine emergency where delay would cause damage or risk to persons or property.`)

    drawClause('7', 'Pre-Authorised Expenditure',
      `The Client authorises the Agent to incur expenditure of up to £250 per item of repair or maintenance without further reference to the Client, provided that the total of such expenditure in any one month does not exceed £750 except in genuine emergency circumstances.`)

    drawClause('8', 'Inspections',
      `The Agent shall carry out periodic property inspections at intervals of not less than every six months and shall provide the Client with a written report following each inspection. The Agent shall also arrange move-in and move-out inspections for each tenancy.`)

    drawClause('9', 'Keys and Access',
      `The Client shall provide the Agent with at least two sets of keys to the Property (or individual room keys where applicable). The Agent shall hold keys securely and may issue keys to contractors and tradespeople as necessary for the performance of this agreement.`)

    drawClause('10', 'Gas Safety',
      `The Client confirms that a Gas Safety Certificate in respect of the Property is in place and will be renewed annually. The Agent shall, as part of its management service, arrange for annual gas safety inspections to be carried out at the Client\'s expense and shall retain copies of all certificates.`)

    drawClause('11', 'Electrical Safety',
      `An Electrical Installation Condition Report (EICR) in respect of the Property is required at intervals of five years or such shorter period as recommended in the most recent EICR. The Agent shall notify the Client when renewal is due and arrange for the inspection at the Client\'s expense.`)

    drawClause('12', 'Smoke and Carbon Monoxide Alarms',
      `The Client warrants that smoke alarms are installed on every storey of the Property and carbon monoxide alarms are installed in every room containing a fixed combustion appliance. The Agent shall check alarm functionality at the start of each new tenancy.`)

    drawClause('13', 'Energy Performance Certificate',
      `The Property must have a valid Energy Performance Certificate (EPC) with a rating of E or above (or such other minimum rating as required by law from time to time). If the Client requires an EPC to be obtained or renewed, the Agent shall arrange this at a cost of ${data.agreementType === 'hmo' ? `£${data.epcCost} per unit` : `£${data.epcCost}`}. The Client shall be responsible for any required improvement works.`)

    drawClause('14', 'HMO Licensing',
      `Where the Property requires a House in Multiple Occupation (HMO) licence, the Client is responsible for obtaining and maintaining such licence and for ensuring that the Property meets all licence conditions. The Agent shall provide reasonable assistance in the licensing application process.`)

    drawClause('15', 'Client Obligations',
      `The Client shall comply with the obligations set out in Schedule 3 to this agreement and with all applicable legislation relating to the letting and management of residential property.`)

    drawClause('16', 'Client Money Protection',
      `The Agent is a member of an approved Client Money Protection (CMP) scheme. All client and tenant monies are held in a designated client account separately from the Agent\'s own funds.`)

    drawClause('17', 'Void Periods',
      `During any void period between tenancies, the Agent shall use reasonable endeavours to re-let the Property promptly. The management fee continues to accrue during void periods. The Agent shall not be responsible for the Property during any period in which it is unoccupied, and the Client is responsible for maintaining appropriate insurance.`)

    drawClause('18', 'Inventory',
      `${data.inventoryNote ?? `An inventory and schedule of condition shall be prepared at the commencement of each tenancy. The cost of preparing the inventory shall be agreed between the Agent and the Client prior to each tenancy.`}`)

    drawClause('19', 'Deposits',
      data.agreementType === 'hmo' && data.floatAmount
        ? `The Client shall maintain a float of ${floatStr} with the Agent to cover day-to-day expenditure. Tenant deposits (where applicable) shall be registered with an approved Tenancy Deposit Scheme within the required statutory timescale. The Agent shall administer the deposit registration process on the Client\'s behalf.`
        : `Tenant deposits (where applicable) shall be registered with an approved Tenancy Deposit Scheme within the required statutory timescale. The Agent shall administer the deposit registration process on the Client\'s behalf. The Client shall ensure that all prescribed information is served on the tenant within the time required by law.`)

    drawClause('20', 'Liability',
      `The Agent shall carry out its duties under this agreement with reasonable care and skill. The Agent\'s liability to the Client shall not exceed the total management fees received in the twelve months immediately preceding the event giving rise to the claim. Neither party shall be liable for indirect or consequential losses.`)

    drawClause('21', 'Data Protection',
      `Each party shall comply with its obligations under the UK General Data Protection Regulation and the Data Protection Act 2018. The Agent shall process the personal data of the Client and of tenants only as necessary for the performance of this agreement and shall maintain appropriate technical and organisational measures to protect such data.`)

    drawClause('22', 'Anti-Money Laundering',
      `The Agent is required by law to carry out identity verification checks on the Client and may be required to make reports to the National Crime Agency in certain circumstances. The Client confirms that the information provided in the AML documentation submitted to the Agent is true and accurate.`)

    drawClause('23', 'Termination for Breach',
      `Either party may terminate this agreement immediately by written notice if the other party commits a material breach of any provision of this agreement and fails to remedy that breach within 28 days of receiving written notice requiring it to do so, or if the other party becomes insolvent or enters into a formal insolvency process.`)

    drawClause('24', 'Dispute Resolution',
      `In the event of a dispute arising under or in connection with this agreement, the parties shall first attempt to resolve the dispute by negotiation in good faith. If the dispute cannot be resolved by negotiation, either party may refer the matter to mediation. The Agent is a member of a Property Redress Scheme and the Client may make a complaint through that scheme if it remains unresolved.`)

    drawClause('25', 'Governing Law',
      `This agreement shall be governed by and construed in accordance with the laws of England and Wales and the parties submit to the exclusive jurisdiction of the courts of England and Wales.`)

    drawClause('26', 'Entire Agreement',
      `This agreement (together with the Schedules) constitutes the entire agreement between the parties with respect to its subject matter and supersedes any prior agreement or arrangement (whether oral or written). Any variation must be agreed in writing and signed by both parties.`)

    spacer(10)
    hRule(doc, MARGIN, y, COL_W, '#999')
    y += 20

    // ── SCHEDULE 1: SERVICES ──────────────────────────────────────────────────
    ensureSpace(60)
    drawLabel('SCHEDULE 1 — SERVICES PROVIDED BY THE AGENT')

    drawPara('The Agent shall provide the following services as part of the management of the Property:')
    spacer(4)

    const schedule1Services = [
      'Market the Property for let using appropriate channels',
      'Carry out accompanied viewings of the Property with prospective tenants',
      'Take up references and carry out credit checks on prospective tenants',
      'Prepare and execute tenancy agreements on behalf of the Client',
      'Collect the first month\'s rent and deposit prior to tenancy commencement',
      'Register tenant deposits with an approved Tenancy Deposit Scheme',
      'Provide tenants with all prescribed information required by law',
      'Arrange an inventory and schedule of condition at the start of each tenancy',
      'Check gas safety certificate validity and arrange renewal when due',
      'Check EICR validity and arrange renewal when due',
      'Check smoke and carbon monoxide alarm functionality at tenancy commencement',
      'Check EPC validity and arrange renewal when required',
      'Issue rent demands and collect rent on a monthly basis',
      'Remit rent to the Client after deduction of fees and authorised expenses',
      'Provide the Client with monthly rent statements',
      'Arrange routine maintenance and minor repairs within the pre-authorised limit',
      'Obtain the Client\'s approval for works exceeding the pre-authorised limit',
      'Source and instruct suitably qualified contractors at competitive rates',
      'Carry out periodic property inspections (minimum every 6 months)',
      'Provide written inspection reports to the Client',
      'Manage the check-out process at the end of each tenancy',
      'Arrange for an inventory check-out report',
      'Negotiate deposit releases in accordance with deposit scheme rules',
      'Pursue rent arrears up to and including serving a Section 8 notice',
      'Advise the Client on relevant changes to landlord and tenancy legislation',
      'Liaise with the local authority on HMO licensing matters where applicable',
      'Maintain accurate records of all transactions relating to the Property',
      'Hold keys and provide access to contractors and authorised parties',
      'Arrange for required safety tests and inspections on behalf of the Client',
      'Respond to tenant communications on the Client\'s behalf',
      'Handle emergency maintenance calls outside normal business hours',
      'Arrange end-of-tenancy cleaning as required',
      'Advise on market rent levels and recommend rent reviews where appropriate',
      'Prepare and serve appropriate notices to tenants (Section 21, Section 8 etc)',
      'Liaise with utility suppliers as required during void periods',
      'Arrange for the Property to be secured and maintained during void periods',
      'Provide the Client with a detailed annual statement of account',
      'Notify relevant authorities of tenancy changes as required by law',
      'Manage communal areas and shared facilities (HMO properties)',
      'Arrange buildings insurance renewal notifications where requested',
    ]
    drawBullets(schedule1Services)

    spacer(10)
    hRule(doc, MARGIN, y, COL_W, '#999')
    y += 20

    // ── SCHEDULE 2: FEES ─────────────────────────────────────────────────────
    ensureSpace(60)
    drawLabel('SCHEDULE 2 — FEES')

    drawPara(`The following fees are payable by the Client to the Agent:`)
    spacer(8)

    // Fee table
    const fees: [string, string][] = [
      ['Management Fee', `${mgmtFee} of all rent collected`],
      ['Let Fee (new tenancy)', data.letFee],
      ['EPC (if required)', data.agreementType === 'hmo' ? `£${data.epcCost} per unit` : `£${data.epcCost}`],
      ...(data.floatAmount ? [['Working Float', `£${data.floatAmount} (held by Agent to cover day-to-day expenditure)`] as [string, string]] : []),
      ['Inventory (new tenancy)', data.inventoryNote ? 'As agreed' : 'Cost to be agreed prior to each tenancy'],
      ['Contractor Administration', 'Included in management fee (no surcharge on contractor invoices)'],
      ['Court Attendance / Eviction', 'By separate quotation — agreed in advance'],
      ['Sale of Property', 'By separate quotation if instructed — not included in this agreement'],
    ]

    const ROW_H = 24
    const c1W = COL_W * 0.38
    const c2W = COL_W * 0.62

    // Header row
    ensureSpace(ROW_H + fees.length * ROW_H + 16)
    doc.save().fillColor(BLACK).rect(MARGIN, y, COL_W, ROW_H).fill().restore()
    doc.save().font(fontBold).fontSize(8).fillColor('#fff')
      .text('Fee', MARGIN + 6, y + 8, { width: c1W - 6, lineBreak: false })
      .text('Details', MARGIN + c1W + 6, y + 8, { width: c2W - 12, lineBreak: false })
      .restore()
    y += ROW_H

    for (let i = 0; i < fees.length; i++) {
      const [name, detail] = fees[i]
      const bg = i % 2 === 1 ? LIGHT : undefined
      if (bg) {
        doc.save().fillColor(bg).rect(MARGIN, y, COL_W, ROW_H).fill().restore()
      }
      doc.save().font(fontReg).fontSize(8).fillColor(BLACK)
        .text(name, MARGIN + 6, y + 8, { width: c1W - 6, lineBreak: false })
        .text(detail, MARGIN + c1W + 6, y + 8, { width: c2W - 12, lineBreak: false })
        .restore()
      hRule(doc, MARGIN, y + ROW_H, COL_W, '#ececec')
      y += ROW_H
    }

    spacer(16)
    drawPara('Capital Rooms Ltd is not VAT registered, so no VAT is added to our fees. The management fee is deducted from rent collected before remittance to the Client. All other fees are invoiced separately.')

    spacer(10)
    hRule(doc, MARGIN, y, COL_W, '#999')
    y += 20

    // ── SCHEDULE 3: CLIENT OBLIGATIONS ───────────────────────────────────────
    ensureSpace(60)
    drawLabel('SCHEDULE 3 — CLIENT OBLIGATIONS')

    drawPara('The Client agrees to:')
    spacer(4)

    const schedule3Items = [
      'Ensure that the Property complies with all applicable legislation before any tenancy commences',
      'Maintain buildings insurance for the Property at a level sufficient to cover the full rebuild cost',
      'Obtain and maintain a valid Gas Safety Certificate (renewed annually)',
      'Obtain and maintain a valid Electrical Installation Condition Report (EICR)',
      'Ensure that working smoke alarms are installed on every storey and carbon monoxide alarms in all rooms with a solid fuel appliance',
      'Ensure that the Property has a valid EPC with a rating of at least E (or such minimum as required by law)',
      'Obtain and maintain any required HMO licence and comply with all licence conditions',
      'Inform the Agent of any mortgage, lease, or other third-party interest that may affect the letting of the Property',
      'Provide the Agent with all documents and information reasonably required to manage the Property',
      'Pay the Agent\'s fees and all authorised disbursements promptly upon demand',
      `Maintain a working float of ${data.floatAmount ? `£${data.floatAmount}` : 'the agreed amount'} with the Agent to cover routine expenditure`,
      'Not to interfere with any tenancy or contact any tenant directly without first notifying the Agent',
      'Notify the Agent immediately of any change of ownership or other material change in circumstances',
      'Comply with the UK GDPR and Data Protection Act 2018 in relation to any personal data shared with the Client by the Agent',
      'Co-operate with the Agent in respect of any legal proceedings relating to the Property',
      'Notify the Agent of any insurance claims relating to the Property',
      'Carry out any improvement works required to maintain the Property\'s EPC rating above the legal minimum',
    ]
    drawBullets(schedule3Items)

    spacer(16)
    hRule(doc, MARGIN, y, COL_W, '#999')
    y += 20

    // ── SIGNATURE BLOCK ───────────────────────────────────────────────────────
    // Reserve enough room for the entire block on one page (approx 170pt).
    // Everything is drawn sequentially with y so nothing lands in the footer.
    ensureSpace(170)
    drawLabel('SIGNATURES')
    drawPara('This agreement has been entered into on the date stated above.')
    spacer(12)

    const halfW  = (COL_W - 20) / 2
    const rightX = MARGIN + halfW + 20

    // ── Row 1: column headers (both columns at same y) ────────────────────────
    doc.save().font(fontBold).fontSize(8.5).fillColor(BLACK)
      .text('Signed for and on behalf of Capital Rooms', MARGIN, y, { width: halfW })
      .restore()
    doc.save().font(fontBold).fontSize(8.5).fillColor(BLACK)
      .text(`Signed by / on behalf of ${client}`, rightX, y, { width: halfW })
      .restore()
    y += 32

    // ── Row 2: signature lines ────────────────────────────────────────────────
    hRule(doc, MARGIN,  y, halfW, BLACK)
    hRule(doc, rightX, y, halfW, BLACK)
    y += 5
    doc.save().font(fontReg).fontSize(8).fillColor(GREY)
      .text('Authorised signatory', MARGIN,  y, { width: halfW,  lineBreak: false })
      .text('Authorised signatory', rightX,  y, { width: halfW,  lineBreak: false })
      .restore()
    y += 26

    // ── Row 3: date lines ─────────────────────────────────────────────────────
    hRule(doc, MARGIN,  y, halfW * 0.55, BLACK)
    hRule(doc, rightX, y, halfW * 0.55, BLACK)
    y += 5
    doc.save().font(fontReg).fontSize(8).fillColor(GREY)
      .text('Date', MARGIN,  y, { width: halfW * 0.55,  lineBreak: false })
      .text('Date', rightX,  y, { width: halfW * 0.55,  lineBreak: false })
      .restore()
    y += 26

    // ── Row 4: print name lines ───────────────────────────────────────────────
    hRule(doc, MARGIN,  y, halfW, BLACK)
    hRule(doc, rightX, y, halfW, BLACK)
    y += 5
    doc.save().font(fontReg).fontSize(8).fillColor(GREY)
      .text('Print name', MARGIN,  y, { width: halfW,  lineBreak: false })
      .text('Print name', rightX,  y, { width: halfW,  lineBreak: false })
      .restore()
    y += 30

    // ── Property reference summary ────────────────────────────────────────────
    drawPara(
      `Agreement reference: ${typeLabel} — ${propList} — ${formatDate(data.agreementDate)}`,
      { colour: '#888', size: 7.5 }
    )

    doc.end()
  })
}

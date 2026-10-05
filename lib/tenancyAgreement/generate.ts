// Fills the Assured Periodic Tenancy Agreement Word template for one tenancy and renders it
// as a PDF on the Capital Rooms letterhead. Shared by the download route and the send-to-landlord route.
import path from 'path'
import fs from 'fs'
import { renderTenancyAgreementPdf, type BillsConfig, type CleaningConfig } from '@/lib/tenancyAgreement/docxToLetterheadPdf'
import { fetchPDFBizSettings, type PDFBizSettings } from '@/lib/pdfLetterhead'
import { firstRentPayment, ukLongDate } from '@/lib/tenancy/firstRent'

export type AgreementInput = Record<string, unknown> & { template?: string; bills?: Partial<BillsConfig>; cleaning?: CleaningConfig }

export const DEFAULT_BILLS: BillsConfig = {
  water: 'landlord', gas: 'landlord', tv_licence: 'tenant', broadband: 'landlord',
  electricity: 'landlord', telephone: 'landlord', council_tax: 'landlord',
}

// Two agreements (Harry, 28 Sep 2026):
//   'apt-cr'  CAPITAL ROOMS — APT ROOM AGREEMENT: managed tenancies. Rent to the Capital Rooms client account,
//             Capital Rooms contact details, Nominated Contact section, no parking clause. (public/templates/apt-cr.docx,
//             Harry's own Word file — used exactly as supplied.)
//   'apt-ns'  NIGEL LET ONLY — APT ROOM AGREEMENT: let-only (the landlord manages). Rent to the landlord's bank, the
//             landlord's contact details, with the Greenland Passage parking clause; 'apt-base' is the same without it.
export const AGREEMENT_TEMPLATES = {
  'apt-cr': 'CAPITAL ROOMS — APT ROOM AGREEMENT',
  'apt-ns': 'NIGEL LET ONLY — APT ROOM AGREEMENT (with parking clause)',
  'apt-base': 'NIGEL LET ONLY — APT ROOM AGREEMENT (no parking clause)',
} as const
const templateFile = (t: string) => (t === 'apt-cr' ? 'apt-cr.docx' : 'apt-ns.docx')
const PARKING_CLAUSE = /In order to access the Estate via vehicle/i

// The template's first-payment sentence assumes a full month. When rent is due on a different day from the
// start (e.g. the 1st), the first payment is pro-rata — the same figure as the check-in balance demand.
const INITIAL_RENT_SENTENCE =
  'The initial rent payment of [[LettingTags.RentAmount]] is to be paid in advance by [[LettingTags.StartDate]]. This will cover the rental period beginning on the start date of the tenancy.'
const INITIAL_RENT_PRORATA =
  'The initial rent payment of **[[LettingTags.InitialRentAmount]]** is to be paid in advance by **[[LettingTags.StartDate]]**. This covers the rental period from **[[LettingTags.InitialRentFrom]]** to **[[LettingTags.InitialRentTo]]**.'

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** First-payment details, when the input carries the raw numbers (rent_monthly, start date, rent_due_day). */
function initialRent(d: Record<string, unknown>) {
  const monthly = Number(d.rent_monthly ?? String(d.rent_amount ?? '').replace(/[^0-9.]/g, ''))
  const start = (d.start_iso as string) || (d.start_date as string)
  const due = d.rent_due_day != null ? Number(d.rent_due_day) : null
  if (!due) return null            // no separate rent day given → the template's full-month wording stands
  return firstRentPayment(start, monthly, due)
}

function tagValues(d: Record<string, string>): Record<string, string> {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const due = s(d.when_rent_due)
  return {
    'LettingsTenantsTags.StartDate': s(d.start_date),
    'LettingTags.StartDate': s(d.start_date),
    'LandlordTags.FullnameWithTitle': s(d.landlord_name),
    'TenantTags.FullnameWithTitle': s(d.tenant_name),
    'PropertyTags.AddressOnOneLine': s(d.property_address),
    'LettingTags.RentAmount': s(d.rent_amount),
    'LettingsTenantsTags.WhenRentDueDefinition': due ? `the ${due} of` : '',
    'LettingTags.Deposit': s(d.deposit),
    'TenantTags.Email': s(d.tenant_email),
    'LandlordBankTags.AccountName': s(d.bank_account_name),
    'LandlordBankTags.BankName': s(d.bank_name),
    'LandlordBankTags.SortCode': s(d.bank_sort_code),
    'LandlordBankTags.AccountNumber': s(d.bank_account_number),
    'LandlordBankTags.PaymentReference': s(d.payment_reference),
    'LandlordTags.ContactAddress': s(d.landlord_contact_address),
    'LandlordTags.Email': s(d.landlord_email),
    'LandlordTags.Phone': s(d.landlord_phone),
    // the tenant's rent reference, shown in the payment box on page 1
    'LettingTags.OfficeNotes': s(d.payment_reference),
  }
}

export function agreementFileName(d: AgreementInput): string {
  const name = String(d.tenant_name || 'Tenant').replace(/[^a-zA-Z0-9 '-]/g, '').trim() || 'Tenant'
  return `Tenancy Agreement - ${name}.pdf`
}

export async function generateTenancyAgreement(input: AgreementInput, biz?: PDFBizSettings): Promise<Buffer> {
  const { template = 'apt-ns', bills: billsRaw, cleaning, ...data } = input
  const file = templateFile(template)
  const templatePath = path.join(process.cwd(), 'public', 'templates', file)
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${file}`)
  const values = tagValues(data as Record<string, string>)
  const settings = biz ?? await fetchPDFBizSettings()
  // the Capital Rooms agreement gives the company's own contact details
  values['CompanyTags.AddressOnOneLine'] = [settings.address_line1, [settings.city, settings.postcode].filter(Boolean).join(' ')].filter(x => x && String(x).trim()).join(', ')
  values['CompanyTags.Email'] = settings.email || ''
  values['CompanyTags.PhoneNumber'] = settings.phone || ''
  const first = initialRent(data)
  const rewrites = first && !first.full ? [{ find: INITIAL_RENT_SENTENCE, replace: INITIAL_RENT_PRORATA }] : []
  if (first && !first.full) {
    values['LettingTags.InitialRentAmount'] = gbp(first.amount)
    values['LettingTags.InitialRentFrom'] = ukLongDate(first.from)
    values['LettingTags.InitialRentTo'] = ukLongDate(first.to)
  }
  return renderTenancyAgreementPdf(fs.readFileSync(templatePath), {
    values,
    rewrites,
    bills: { ...DEFAULT_BILLS, ...(billsRaw || {}) },
    // the managed agreement keeps Harry's own answers (e.g. TV licence: "for the communal areas") unless bills are given
    billsFromTemplate: template === 'apt-cr' && !billsRaw,
    cleaning,
    title: agreementFileName(input).replace(/\.pdf$/, ''),
    biz: settings,
    omitParagraphs: template === 'apt-base' ? [PARKING_CLAUSE] : [],
  })
}

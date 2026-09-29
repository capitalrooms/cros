/**
 * Capital Rooms — Check-In Balance Demand PDF
 *
 * Drawn by the shared money-document layout (lib/invoices/invoiceDocument) so it looks exactly like the
 * landlord invoice: recipient top left, logo top right, title with a reference/date panel, black-header
 * table, black total box, grey "How to pay" box, black accreditation footer.
 *
 * Rent modes:
 *   'full'    — first payment is a complete month from the start date
 *   'prorata' — first payment is the days remaining in the start month
 *               (monthly rent × 12 ÷ 365 × days up to the day before the rent day — lib/tenancy/firstRent), or pass proRataAmount
 *
 * Supports 1–3 named tenants on a single tenancy (joint / single-let).
 */
import { PDF_BIZ_DEFAULTS, type PDFBizSettings } from '@/lib/pdfLetterhead'
import { renderInvoiceStyleDocument, money } from '@/lib/invoices/invoiceDocument'
import { firstRentPayment } from '@/lib/tenancy/firstRent'

export interface CheckInBalanceData {
  /** All tenant names on this tenancy (1–3) */
  tenantNames:     string[]
  /** Full address of the room / property */
  propertyAddress: string
  /** Monthly rent in £ */
  rentMonthly:     number
  /** Security deposit in £ */
  depositAmount:   number
  /** Holding deposit already received — deducted from amount due */
  holdingDeposit:  number
  /** Tenancy start date ISO string "YYYY-MM-DD" */
  startDate:       string
  /** 'full' = full first month; 'prorata' = days remaining in start month */
  rentMode:        'full' | 'prorata'
  /** Override pro-rata amount (skip calculation when provided) */
  proRataAmount?:  number
  /** Day of the month rent is due (defaults: 1 for 'prorata', the start day for 'full') */
  rentDueDay?:     number
  /** Payment reference for this tenancy e.g. "003KFT03" */
  paymentRef:      string
  /** Bank account name e.g. "Capital Rooms Ltd" */
  bankName:        string
  /** Sort code e.g. "20-18-93" */
  sortCode:        string
  /** Account number e.g. "4016 2574" */
  accountNo:       string
  /** IBAN e.g. "GB19 BUKB 2018 9340 1625 74" */
  iban:            string
  /** SWIFT/BIC e.g. "BUKBGB22" */
  swift?:          string
  /** Business settings (fetched by route, passed in) */
  bizSettings?:    PDFBizSettings
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const joinNames = (names: string[]) => names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`

export async function generateCheckInBalancePDF(data: CheckInBalanceData): Promise<Buffer> {
  // ── Rent for the first period (unchanged calculation) ──────────────────
  // Same calculation as the tenancy agreement's "initial rent payment" (lib/tenancy/firstRent), so the two
  // documents always agree: pro-rata = start date to the day before the 1st, at monthly × 12 ÷ 365 per day.
  const start = parseDate(data.startDate)
  const first = firstRentPayment(start, data.rentMonthly, data.rentDueDay ?? (data.rentMode === 'prorata' ? 1 : start.getDate()))
  let rentAmount: number
  let periodEnd: Date
  let proRata = false
  if ((data.rentMode === 'prorata' || data.rentDueDay != null) && first && !first.full) {
    proRata = true
    rentAmount = data.proRataAmount ?? first.amount
    periodEnd = first.to
  } else {
    rentAmount = data.rentMonthly
    periodEnd = first?.to ?? new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1)
  }
  const subtotal = rentAmount + data.depositAmount
  const amountDue = subtotal - data.holdingDeposit
  const payBy = new Date(start.getTime() - 86_400_000)
  const today = new Date()

  const addressLines = data.propertyAddress.split(/\n|,\s*/).map(s => s.trim()).filter(Boolean)
  const bank: [string, string][] = [
    ['Account name', data.bankName],
    ['Sort code', data.sortCode],
    ['Account number', data.accountNo],
    ['Payment reference', data.paymentRef],
    ...(data.iban ? [['IBAN', data.iban] as [string, string]] : []),
    ...(data.swift ? [['SWIFT / BIC', data.swift] as [string, string]] : []),
  ]

  return renderInvoiceStyleDocument({
    pdfTitle: `Check-in balance — ${data.propertyAddress}`,
    docTitle: 'Check-in balance',
    subtitle: `Monthly rent ${money(data.rentMonthly)} · tenancy starts ${fmtDate(start)}`,
    recipientName: joinNames(data.tenantNames),
    addressLines,
    meta: [['Reference', data.paymentRef], ['Date', fmtDate(today)], ['Pay by', fmtDate(payBy)]],
    columns: 'amount',
    lines: [
      { description: proRata ? 'Rent (pro rata)' : 'Rent — first month', detail: `${fmtDate(start)} – ${fmtDate(periodEnd)}`, amount: rentAmount },
      { description: 'Security deposit', amount: data.depositAmount },
      ...(data.holdingDeposit > 0 ? [
        { description: 'Total', amount: subtotal, kind: 'subtotal' as const },
        { description: 'Less holding deposit already paid', amount: -data.holdingDeposit, kind: 'less' as const },
      ] : []),
    ],
    totalLabel: 'Amount due',
    total: amountDue,
    pay: {
      title: 'How to pay',
      rows: bank,
      note: 'Please pay the full balance in one bank transfer (BACS or CHAPS), quoting the payment reference. To check in on time we need it in cleared funds at least 24 hours before check-in.',
    },
    continuedRef: data.paymentRef,
    biz: data.bizSettings ?? PDF_BIZ_DEFAULTS,
  })
}

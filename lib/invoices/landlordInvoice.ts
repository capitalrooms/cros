// Landlord invoice on the Capital Rooms letterhead — drawn by the shared money-document layout.
import type { PDFBizSettings } from '@/lib/pdfLetterhead'
import { AGENT_BANK, INVOICE_PAYMENT_DAYS } from '@/lib/invoices/fees'
import { renderInvoiceStyleDocument } from '@/lib/invoices/invoiceDocument'

export interface InvoiceItem { description: string; detail?: string; qty: number; unitPrice: number }
export interface LandlordInvoiceInput {
  landlordName: string
  addressLines: string[]
  propertyAddress: string
  invoiceNumber: string
  invoiceDate: string          // ISO date
  title?: string
  items: InvoiceItem[]
  biz: PDFBizSettings
}

const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export async function generateLandlordInvoice(input: LandlordInvoiceInput): Promise<Buffer> {
  const issued = new Date(input.invoiceDate)
  const due = new Date(issued.getTime() + INVOICE_PAYMENT_DAYS * 86_400_000)
  const total = input.items.reduce((t, it) => t + it.qty * it.unitPrice, 0)
  return renderInvoiceStyleDocument({
    pdfTitle: `Invoice ${input.invoiceNumber}`,
    docTitle: 'Invoice',
    subtitle: input.title ?? 'Tenancy services',
    recipientName: input.landlordName,
    addressLines: input.addressLines,
    propertyLine: input.propertyAddress,
    meta: [['Invoice number', input.invoiceNumber], ['Invoice date', longDate(issued)], ['Payment due', longDate(due)]],
    columns: 'qty',
    lines: input.items.map(it => ({ description: it.description, detail: it.detail, qty: it.qty, unitPrice: it.unitPrice, amount: it.qty * it.unitPrice })),
    totalLabel: 'Total due',
    total,
    pay: {
      rows: [['Account name', AGENT_BANK.accountName], ['Sort code', AGENT_BANK.sortCode], ['Account number', AGENT_BANK.accountNumber], ['Payment reference', input.invoiceNumber]],
      note: `Please pay within ${INVOICE_PAYMENT_DAYS} days of the invoice date, quoting the payment reference so we can match your payment.`,
    },
    continuedRef: input.invoiceNumber,
    biz: input.biz,
  })
}

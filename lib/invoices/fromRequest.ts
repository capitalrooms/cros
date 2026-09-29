// Validates an invoice request body (from the bulk agreement page) into generator input.
import type { InvoiceItem, LandlordInvoiceInput } from '@/lib/invoices/landlordInvoice'
import type { PDFBizSettings } from '@/lib/pdfLetterhead'

export function invoiceInputFromBody(b: any, biz: PDFBizSettings): { input?: LandlordInvoiceInput; error?: string } {
  const items: InvoiceItem[] = (Array.isArray(b?.items) ? b.items : [])
    .filter((i: InvoiceItem) => i && typeof i.description === 'string' && Number(i.qty) > 0 && Number.isFinite(Number(i.unitPrice)))
    .map((i: InvoiceItem) => ({ description: i.description, detail: i.detail, qty: Number(i.qty), unitPrice: Number(i.unitPrice) }))
  const addressLines: string[] = (Array.isArray(b?.addressLines) ? b.addressLines : []).map((l: unknown) => String(l).trim()).filter(Boolean)
  if (!String(b?.landlordName ?? '').trim()) return { error: 'Choose the landlord' }
  if (!addressLines.length) return { error: 'Add the landlord’s correspondence address' }
  if (!items.length) return { error: 'Nothing to invoice' }
  return {
    input: {
      landlordName: String(b.landlordName).trim(),
      addressLines,
      propertyAddress: String(b.propertyAddress ?? '').trim(),
      invoiceNumber: String(b.invoiceNumber ?? '').trim() || `INV${Date.now()}`,
      invoiceDate: String(b.invoiceDate ?? new Date().toISOString()),
      title: b.title ? String(b.title) : undefined,
      items,
      biz,
    },
  }
}

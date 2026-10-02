// Validates an invoice from the Letters & Invoices page into the standard invoice generator's input.
import type { LandlordInvoiceInput } from '@/lib/invoices/landlordInvoice'
import { invoiceInputFromBody } from '@/lib/invoices/fromRequest'
import type { PDFBizSettings } from '@/lib/pdfLetterhead'

export interface DocInvoice {
  recipientName: string
  recipientAddress: string          // one line per row
  propertyAddress: string
  invoiceNumber: string
  invoiceDate: string               // YYYY-MM-DD
  title: string
  items: { description: string; detail?: string; qty: number; unitPrice: number | null }[]
}

export function invoiceFromBody(v: unknown, biz: PDFBizSettings): { input?: LandlordInvoiceInput; error?: string } {
  const b = (v && typeof v === 'object' ? v : {}) as Partial<DocInvoice>
  const items = (Array.isArray(b.items) ? b.items : []).filter(i => i && String(i.description ?? '').trim())
  if (!String(b.recipientName ?? '').trim()) return { error: 'Add who the invoice is to' }
  const unpriced = items.filter(i => i.unitPrice == null || !Number.isFinite(Number(i.unitPrice)))
  if (unpriced.length) return { error: `Add a price for: ${unpriced.map(i => i.description).join(', ')}` }
  if (!String(b.invoiceNumber ?? '').trim()) return { error: 'Add an invoice number' }
  return invoiceInputFromBody({
    landlordName: b.recipientName,
    addressLines: String(b.recipientAddress ?? '').split(/\n/),
    propertyAddress: b.propertyAddress ?? '',
    invoiceNumber: b.invoiceNumber,
    invoiceDate: b.invoiceDate || new Date().toISOString().slice(0, 10),
    title: String(b.title ?? '').trim() || undefined,
    items: items.map(i => ({ description: String(i.description).trim(), detail: String(i.detail ?? '').trim() || undefined, qty: Number(i.qty) || 1, unitPrice: Number(i.unitPrice) })),
  }, biz)
}

/** Default invoice number, same style as Bulk Agreements: a short code for the client plus today's date. */
export function suggestInvoiceNumber(recipientName: string, date = new Date()): string {
  const words = recipientName.replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i, '').replace(/\b(ltd|limited|llp|plc)\b\.?/gi, '').split(/\s+/).filter(Boolean)
  const code = (words.length > 1 ? words.map(w => w[0]).join('') : (words[0] ?? 'INV').slice(0, 3)).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4) || 'INV'
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `${code}${stamp}`
}

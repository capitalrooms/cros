// Fee invoices (24 Nov 2026): what a landlord or tenant still owes on a fee invoice, and whether it's overdue.
// Pure arithmetic — no database here. Payments are rows in fee_invoice_payments (migration 305); a reversal is a
// negative row, so the balance is simply the total less the sum of the payments.

export interface FeeInvoiceRow { total_amount: number; due_on: string; voided_at: string | null }
export interface FeePaymentRow { amount: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type FeeInvoiceStatus = 'void' | 'open' | 'part_paid' | 'paid' | 'overdue' | 'part_paid_overdue'

/** What is still owed on the invoice (never negative: an overpayment is shown separately). */
export function outstanding(inv: FeeInvoiceRow, payments: FeePaymentRow[]): number {
  if (inv.voided_at) return 0
  const paid = r2(payments.reduce((t, p) => t + Number(p.amount || 0), 0))
  return Math.max(0, r2(Number(inv.total_amount) - paid))
}

/** Money received beyond the invoice total (to refund or hold, never to net off silently). */
export function overpaid(inv: FeeInvoiceRow, payments: FeePaymentRow[]): number {
  if (inv.voided_at) return 0
  const paid = r2(payments.reduce((t, p) => t + Number(p.amount || 0), 0))
  return Math.max(0, r2(paid - Number(inv.total_amount)))
}

/** Whole days past the due date, 0 when not yet due or paid. `today` is YYYY-MM-DD (London date). */
export function daysOverdue(inv: FeeInvoiceRow, payments: FeePaymentRow[], today: string): number {
  if (outstanding(inv, payments) <= 0) return 0
  const ms = Date.parse(`${today}T12:00:00Z`) - Date.parse(`${inv.due_on}T12:00:00Z`)
  return ms > 0 ? Math.round(ms / 86_400_000) : 0
}

export function statusOf(inv: FeeInvoiceRow, payments: FeePaymentRow[], today: string): FeeInvoiceStatus {
  if (inv.voided_at) return 'void'
  const due = outstanding(inv, payments)
  if (due <= 0) return 'paid'
  const paidSome = r2(payments.reduce((t, p) => t + Number(p.amount || 0), 0)) > 0
  const late = daysOverdue(inv, payments, today) > 0
  if (late) return paidSome ? 'part_paid_overdue' : 'overdue'
  return paidSome ? 'part_paid' : 'open'
}

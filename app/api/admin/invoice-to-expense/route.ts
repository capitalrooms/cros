// POST /api/admin/invoice-to-expense — a supplier invoice filed as a property expense with NO job linked (19 Nov 2026).
// For an invoice whose job isn't in CROS. Same checks as every expense (lib/expenses/create: duplicates, closed months,
// numbering). Charged to next month's statement unless the office picks another month.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { addLandlordExpense } from '@/lib/expenses/create'
import { nextMonthStart } from '@/lib/expenses/nextMonth'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round(n * 100) / 100
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)


export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as any
  const propertyId = String(b.propertyId ?? '')
  const amount = r2(Number(b.amount))
  const description = String(b.description ?? '').trim().slice(0, 300)
  if (!propertyId) return NextResponse.json({ error: 'Choose which property this invoice is for.' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ error: 'Type the amount to file it as an expense.' }, { status: 400 })
  if (!description) return NextResponse.json({ error: 'Say what the invoice was for.' }, { status: 400 })
  const expenseDate = isDate(b.expenseDate) ? b.expenseDate : new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const deductMonth = isDate(b.deductMonth) ? b.deductMonth : nextMonthStart()
  const s = createServiceClient()
  const r = await addLandlordExpense(s, {
    property_id: propertyId, description, amount, expense_date: expenseDate, deduct_month: deductMonth,
    supplier: b.supplier ? String(b.supplier).slice(0, 120) : null,
    invoice_number: b.invoiceNumber ? String(b.invoiceNumber).slice(0, 80) : null,
    source: 'supplier_invoice', source_ref: b.sourceRef ? String(b.sourceRef).slice(0, 200) : null,
    notes: 'Filed without a job — no job was in CROS to match it to.',
  }, { by: admin.personId, confirmDuplicate: b.confirmDuplicate === true })
  if (!r.ok) return NextResponse.json({ error: r.error ?? 'Not filed', duplicates: r.duplicates ?? null }, { status: r.status || 400 })
  return NextResponse.json({ ok: true, message: r.message, deductMonth: r.deductMonth })
}

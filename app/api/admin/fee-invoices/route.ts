// /api/admin/fee-invoices — fee invoices and what's been paid against them (24 Nov 2026, migration 305).
//   GET  ?filter=overdue|open|all            → invoices with payments, balance, days overdue, status (lib/invoices/feeInvoice)
//   POST { action:'create', payerKind, payerId, propertyId?, tenancyId?, description, net, issuedOn?, dueOn?, vatRate? }
//          Defaults: due 14 days after issue. VAT is added to the net fee from the VAT start date (system_settings vat_registration).
//   POST { action:'payment', invoiceId, amount, paidOn, method?, bankReference?, note? }   — refused if it's more than is owed
//   POST { action:'void', invoiceId, reason }   — only before any payment; the number is kept, the invoice is marked void
// Nothing here sends anything. Staff only (requireAdmin).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { outstanding, statusOf, daysOverdue } from '@/lib/invoices/feeInvoice'

export const dynamic = 'force-dynamic'
const ISO = /^\d{4}-\d{2}-\d{2}$/
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const todayLondon = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const DEFAULT_TERMS_DAYS = 14

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const filter = req.nextUrl.searchParams.get('filter') ?? 'all'
  const today = todayLondon()
  const { data: invs, error } = await s.from('fee_invoices').select('*').order('due_on', { ascending: true }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (invs ?? []).map((i: any) => i.id)
  const { data: pays } = ids.length ? await s.from('fee_invoice_payments').select('id, invoice_id, amount, paid_on, method, bank_reference, note').in('invoice_id', ids).order('paid_on') : { data: [] as any[] }
  const { data: people } = ids.length ? await s.from('people').select('id, salutation, first_name, last_name, full_name, company').in('id', [...new Set((invs ?? []).map((i: any) => i.payer_id))]) : { data: [] as any[] }
  const who = new Map(((people ?? []) as any[]).map(p => [p.id, p.company || [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || '']))
  const items = ((invs ?? []) as any[]).map(i => {
    const ps = ((pays ?? []) as any[]).filter(p => p.invoice_id === i.id)
    const due = outstanding(i, ps), st = statusOf(i, ps, today)
    return { ...i, payer: who.get(i.payer_id) ?? '', payments: ps, outstanding: due, daysOverdue: daysOverdue(i, ps, today), status: st }
  })
  const shown = items.filter(i => filter === 'overdue' ? (i.status === 'overdue' || i.status === 'part_paid_overdue') : filter === 'open' ? i.status !== 'paid' && i.status !== 'void' : true)
  const totals = { owed: r2(items.reduce((t, i) => t + i.outstanding, 0)), overdue: r2(items.filter(i => i.daysOverdue > 0).reduce((t, i) => t + i.outstanding, 0)), overdueCount: items.filter(i => i.daysOverdue > 0).length }
  return NextResponse.json({ items: shown, totals, today })
}

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

  if (b.action === 'create') {
    if (!['landlord', 'tenant'].includes(b.payerKind)) return bad('Choose who the invoice is to')
    if (!b.payerId) return bad('Choose the person to invoice')
    const description = String(b.description ?? '').trim().slice(0, 300)
    if (!description) return bad('Say what the fee is for')
    const net = r2(Number(b.net))
    if (!(net > 0)) return bad('Enter the fee (before VAT)')
    const issuedOn = b.issuedOn && ISO.test(b.issuedOn) ? b.issuedOn : todayLondon()
    const dueOn = b.dueOn && ISO.test(b.dueOn) ? b.dueOn : addDays(issuedOn, DEFAULT_TERMS_DAYS)
    if (dueOn < issuedOn) return bad('The due date is before the invoice date')
    // VAT: from the VAT start date, at the VAT rate in settings (20% unless set otherwise)
    const { data: vs } = await s.from('system_settings').select('value').eq('key', 'vat_registration').maybeSingle()
    let vat = 0
    try {
      const reg = vs?.value ? (typeof vs.value === 'string' ? JSON.parse(vs.value) : vs.value) : null
      if (reg?.from && issuedOn >= reg.from) vat = r2(net * (Number(b.vatRate ?? reg.rate ?? 20) / 100))
    } catch { vat = 0 }
    const { data: row, error } = await s.from('fee_invoices').insert({
      payer_kind: b.payerKind, payer_id: b.payerId, property_id: b.propertyId || null, tenancy_id: b.tenancyId || null,
      description, net_amount: net, vat_amount: vat, total_amount: r2(net + vat), issued_on: issuedOn, due_on: dueOn, created_by: me.email,
    }).select('id, invoice_no, total_amount, due_on').single()
    if (error) return bad(error.message, 500)
    return NextResponse.json({ ok: true, invoice: row })
  }

  if (b.action === 'payment') {
    const { data: inv } = await s.from('fee_invoices').select('*').eq('id', b.invoiceId ?? '').maybeSingle()
    if (!inv) return bad('Invoice not found', 404)
    if (inv.voided_at) return bad('This invoice is void', 409)
    const amount = r2(Number(b.amount))
    if (!(amount > 0)) return bad('Enter the amount received')
    if (!ISO.test(b.paidOn ?? '')) return bad('Enter the date it was received')
    const { data: ps } = await s.from('fee_invoice_payments').select('amount').eq('invoice_id', inv.id)
    const owed = outstanding(inv, (ps ?? []) as any[])
    if (amount > owed + 0.005) return bad(`Only £${owed.toFixed(2)} is owed on this invoice. Record the extra separately.`, 409)
    const { error } = await s.from('fee_invoice_payments').insert({
      invoice_id: inv.id, amount, paid_on: b.paidOn, method: String(b.method ?? '').slice(0, 40) || null,
      bank_reference: String(b.bankReference ?? '').slice(0, 120) || null, note: String(b.note ?? '').slice(0, 300) || null, created_by: me.email,
    })
    if (error) return bad(error.message, 500)
    return NextResponse.json({ ok: true, owedAfter: r2(owed - amount) })
  }

  if (b.action === 'void') {
    const reason = String(b.reason ?? '').trim()
    if (reason.length < 3) return bad('Say why it’s being voided — it stays on the record')
    const { data: inv } = await s.from('fee_invoices').select('id, voided_at').eq('id', b.invoiceId ?? '').maybeSingle()
    if (!inv) return bad('Invoice not found', 404)
    if (inv.voided_at) return bad('Already void', 409)
    const { count } = await s.from('fee_invoice_payments').select('id', { count: 'exact', head: true }).eq('invoice_id', inv.id)
    if (count) return bad('Money has been paid against this invoice, so it can’t be voided. Reverse the payment first.', 409)
    const { error } = await s.from('fee_invoices').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', inv.id)
    if (error) return bad(error.message, 500)
    return NextResponse.json({ ok: true })
  }

  return bad('Unknown action')
}

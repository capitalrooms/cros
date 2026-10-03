/**
 * /api/admin/supplier-invoices — invoices contractors and cleaners made in CROS (migration 205).
 *   GET               → { invoices, people, enabled }   to approve first
 *   GET ?pdf=<id>     → the PDF
 *   POST { action: 'approve', id, chargeLines?: number[] }  contractor: one expense on the property with the invoice attached;
 *                                                          cleaner: an expense per ticked line's property (others are ours)
 *   POST { action: 'paid', id } | { action: 'void', id, reason }   void frees its jobs / cleans to be invoiced again
 *   POST { action: 'setting', on } | { action: 'person', personId, on }
 * Administrators only. Nothing reaches a landlord's statement until approved here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { BUCKET } from '@/lib/supplierInvoices/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim()
const pname = (p: any) => p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email || '') : ''
const missing = (e: { message?: string } | null) => !!e && /supplier_|does not exist|schema cache/.test(e.message ?? '')
const r2 = (n: number) => Math.round(n * 100) / 100

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const s = createServiceClient()
  const pdfId = req.nextUrl.searchParams.get('pdf')
  if (pdfId) {
    const { data: inv } = await s.from('supplier_invoices').select('pdf_path, number').eq('id', pdfId).maybeSingle() as { data: any }
    if (!inv?.pdf_path) return NextResponse.json({ error: 'No PDF' }, { status: 404 })
    const { data } = await s.storage.from(BUCKET).download(inv.pdf_path)
    if (!data) return NextResponse.json({ error: 'The PDF has gone' }, { status: 404 })
    return new NextResponse(Buffer.from(await data.arrayBuffer()), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Invoice-${inv.number}.pdf"` } })
  }
  const [{ data: invs, error }, { data: ppl }, { data: profs }, { data: set }] = await Promise.all([
    s.from('supplier_invoices').select('*, people!supplier_id(first_name, last_name, full_name, company, role), properties(name)').eq('to_capital_rooms', true).order('created_at', { ascending: false }).limit(200),
    s.from('people').select('id, first_name, last_name, full_name, company, role').in('role', ['contractor', 'cleaner']).order('first_name'),
    s.from('supplier_profiles').select('person_id, invoicing_enabled, trading_name'),
    s.from('system_settings').select('value').eq('key', 'supplier_invoicing').maybeSingle(),
  ]) as any[]
  if (error) return NextResponse.json(missing(error) ? { setupNeeded: true, invoices: [], people: [] } : { error: error.message }, { status: missing(error) ? 200 : 500 })
  const prof = new Map(((profs ?? []) as any[]).map(p => [p.person_id, p]))
  const order = (st: string) => ['sent', 'approved', 'paid', 'void'].indexOf(st)
  return NextResponse.json({
    enabled: (set?.value ?? 'true') === 'true',
    invoices: ((invs ?? []) as any[]).map(i => ({
      id: i.id, number: i.number, kind: i.kind, supplier: prof.get(i.supplier_id)?.trading_name || i.people?.company || pname(i.people), supplierId: i.supplier_id,
      total: i.total, labour: i.labour_total, parts: i.parts_total, vat: i.vat_amount, date: i.issue_date, due: i.due_date, status: i.status,
      property: firstLine(i.properties?.name) || null, propertyId: i.property_id, period: i.period_from ? `${i.period_from} → ${i.period_to}` : null,
      lines: i.lines ?? [], notes: i.notes, expenseIds: i.expense_ids ?? [], voidReason: i.void_reason,
    })).sort((a, b) => order(a.status) - order(b.status) || String(b.date).localeCompare(String(a.date))),
    people: ((ppl ?? []) as any[]).map(p => ({ id: p.id, name: pname(p) || p.company, role: p.role, on: prof.get(p.id)?.invoicing_enabled !== false })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()

  if (b.action === 'setting') {
    await s.from('system_settings').upsert({ key: 'supplier_invoicing', value: b.on ? 'true' : 'false' }, { onConflict: 'key' })
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'person') {
    const { error } = await s.from('supplier_profiles').upsert({ person_id: String(b.personId ?? ''), invoicing_enabled: !!b.on }, { onConflict: 'person_id' })
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }

  const { data: inv } = await s.from('supplier_invoices').select('*, people!supplier_id(first_name, last_name, full_name, company)').eq('id', String(b.id ?? '')).maybeSingle() as { data: any }
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  const { data: prof } = await s.from('supplier_profiles').select('trading_name').eq('person_id', inv.supplier_id).maybeSingle()
  const supplier = prof?.trading_name || inv.people?.company || pname(inv.people)

  if (b.action === 'void') {
    if (inv.status === 'paid') return NextResponse.json({ error: 'It’s marked paid — it can’t be voided' }, { status: 409 })
    if ((inv.expense_ids ?? []).length) return NextResponse.json({ error: 'Its expenses are already on the books — void those in Expenses first' }, { status: 409 })
    await s.from('supplier_invoices').update({ status: 'void', void_reason: String(b.reason ?? '').slice(0, 300) || 'Voided by the office' }).eq('id', inv.id)
    await s.from('maintenance_tickets').update({ supplier_invoice_id: null }).eq('supplier_invoice_id', inv.id)
    await s.from('cleans').update({ supplier_invoice_id: null }).eq('supplier_invoice_id', inv.id)
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'paid') {
    await s.from('supplier_invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', inv.id)
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'approve') {
    if (inv.status !== 'sent') return NextResponse.json({ error: 'Already dealt with' }, { status: 409 })
    // the PDF goes with the expense, as its invoice
    let invoicePath: string | null = null
    if (inv.pdf_path) {
      const { data } = await s.storage.from(BUCKET).download(inv.pdf_path)
      if (data) {
        invoicePath = `invoices/supplier-${inv.supplier_id}-${inv.number}.pdf`
        await s.storage.from('finance-docs').upload(invoicePath, Buffer.from(await data.arrayBuffer()), { contentType: 'application/pdf', upsert: true })
      }
    }
    const lines = (inv.lines ?? []) as any[]
    // which properties to charge, and how much
    const charge = new Map<string, { amount: number; text: string[] }>()
    if (inv.kind === 'contractor') {
      if (!inv.property_id) return NextResponse.json({ error: 'This invoice isn’t for one of our properties' }, { status: 400 })
      charge.set(inv.property_id, { amount: Number(inv.total), text: lines.map(l => `${l.description}${l.where ? ` (${l.where})` : ''}`) })
    } else {
      const ticked = new Set((Array.isArray(b.chargeLines) ? b.chargeLines : []).map(Number))
      lines.forEach((l, i) => {
        if (!ticked.has(i) || !l.propertyId) return
        const c = charge.get(l.propertyId) ?? { amount: 0, text: [] }
        c.amount += Number(l.labour || 0) + Number(l.parts || 0); c.text.push(l.description)
        charge.set(l.propertyId, c)
      })
    }
    const ids: string[] = []
    for (const [propertyId, c] of charge) {
      const { data: e, error } = await s.from('recharge_expenses').insert({
        property_id: propertyId, description: `${inv.kind === 'cleaner' ? 'Cleaning' : 'Works'} — ${c.text.join('; ')}`.slice(0, 500), amount: r2(c.amount),
        expense_date: inv.issue_date, supplier, invoice_number: String(inv.number), category: inv.kind === 'cleaner' ? 'cleaning' : 'maintenance_repair',
        invoice_path: invoicePath, invoice_name: `Invoice-${inv.number}.pdf`, share_invoice: false, created_by: admin.personId,
        notes: `From ${supplier}'s invoice ${inv.number} made in CROS`,
      }).select('id').single()
      if (error) return NextResponse.json({ error: `Couldn’t add the expense: ${error.message}${ids.length ? ' (some were added — check Expenses)' : ''}` }, { status: 400 })
      ids.push(e.id)
    }
    await s.from('supplier_invoices').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: admin.personId, expense_ids: ids }).eq('id', inv.id)
    return NextResponse.json({ ok: true, expenses: ids.length })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

/**
 * /api/supplier/invoices — contractors and cleaners make their invoices in CROS (migration 205).
 *   GET                 → { gate, profile, invoices, jobs (contractor: our completed jobs not yet invoiced), cleans (cleaner), properties }
 *   GET ?pdf=<id>       → the PDF of one of their own invoices
 *   POST { action: 'profile', ...details }   save their business details
 *   POST { action: 'logo', dataUrl }          their own logo (PNG/JPEG); { action: 'logo', remove: true } back to the monogram
 *   POST { action: 'preview', draft }         → PDF (no number used, nothing saved)
 *   POST { action: 'send', draft }            → numbered, saved, emailed (client + a copy to them)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { gate, profileFor, shape, pdfFor, send, emailInvoice, BUCKET } from '@/lib/supplierInvoices/service'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim()
const missing = (e: { message?: string } | null) => !!e && /supplier_|does not exist|schema cache/.test(e.message ?? '')

/** The contractor or cleaner — or the office acting for one (view-as: x-view-as header), for support and testing. */
async function who(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c) return null
  const as = req.headers.get('x-view-as')
  if (as && ['administrator', 'admin'].includes(c.role)) {
    const { data: p } = await createServiceClient().from('people').select('id, role').eq('id', as).maybeSingle()
    if (p && ['contractor', 'cleaner'].includes(p.role)) return { ...c, personId: p.id, role: p.role as 'contractor' | 'cleaner' }
    return null
  }
  if (!['contractor', 'cleaner'].includes(c.role)) return null
  return c as typeof c & { role: 'contractor' | 'cleaner' }
}

export async function GET(req: NextRequest) {
  const c = await who(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const s = createServiceClient()
  const pdfId = req.nextUrl.searchParams.get('pdf')
  if (pdfId) {
    const { data: inv } = await s.from('supplier_invoices').select('pdf_path, number, supplier_id').eq('id', pdfId).maybeSingle() as { data: any }
    if (!inv || inv.supplier_id !== c.personId || !inv.pdf_path) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data } = await s.storage.from(BUCKET).download(inv.pdf_path)
    if (!data) return NextResponse.json({ error: 'The PDF has gone' }, { status: 404 })
    return new NextResponse(Buffer.from(await data.arrayBuffer()), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Invoice-${inv.number}.pdf"` } })
  }
  const { error: probe } = await s.from('supplier_invoices').select('id', { head: true, count: 'exact' }).limit(1)
  if (missing(probe)) return NextResponse.json({ setupNeeded: true })
  const [g, profile, { data: invoices }, { data: props }] = await Promise.all([
    gate(s, c.personId, c.role), profileFor(s, c.personId),
    s.from('supplier_invoices').select('id, number, client_name, total, issue_date, status, sent_at, to_capital_rooms, properties(name)').eq('supplier_id', c.personId).order('number', { ascending: false }).limit(100),
    s.from('properties').select('id, name, address, postcode, property_code'),
  ]) as any[]
  let jobs: any[] = [], cleans: any[] = []
  if (c.role === 'contractor') {
    const { data } = await s.from('maintenance_tickets').select('id, title, final_price, completed_at, location, property_id, properties(name), rooms(name)')
      .eq('contractor_id', c.personId).is('supplier_invoice_id', null).not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(100)
    jobs = ((data ?? []) as any[]).map(t => ({ id: t.id, title: t.title, price: t.final_price, completedAt: t.completed_at, propertyId: t.property_id, property: firstLine(t.properties?.name), where: [t.rooms?.name, t.location].filter(Boolean).join(' · ') }))
  } else {
    const { data } = await s.from('cleans').select('id, clean_date, property_id, extra_charge, extra_charge_note, products_cost, cleaner_note, properties(name)')
      .eq('cleaner_id', c.personId).eq('status', 'completed').is('supplier_invoice_id', null).order('clean_date', { ascending: true }).limit(200)
    cleans = ((data ?? []) as any[]).map(x => ({ id: x.id, date: x.clean_date, propertyId: x.property_id, property: firstLine(x.properties?.name), price: profile.cleanPrices[x.property_id] ?? null, extra: x.extra_charge, extraNote: x.extra_charge_note, products: x.products_cost, note: x.cleaner_note }))
  }
  return NextResponse.json({
    role: c.role, gate: g, profile, jobs, cleans,
    invoices: ((invoices ?? []) as any[]).map(i => ({ id: i.id, number: i.number, client: i.client_name, total: i.total, date: i.issue_date, status: i.status, emailed: !!i.sent_at, ours: i.to_capital_rooms, property: firstLine(i.properties?.name) })),
    properties: sortPropertiesNumerically((props ?? []) as any[]).map((p: any) => ({ id: p.id, name: /^(flat|room|unit|apartment)\s*\w+$/i.test(firstLine(p.name)) ? String(p.name).split('\n').slice(0, 2).join(', ') : firstLine(p.name) })),
  })
}

export async function POST(req: NextRequest) {
  const c = await who(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()

  if (b.action === 'profile') {
    const t = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n) || null
    const sort = String(b.sortCode ?? '').replace(/[^\d]/g, ''), acct = String(b.accountNo ?? '').replace(/[^\d]/g, '')
    if (sort && sort.length !== 6) return NextResponse.json({ error: 'A sort code has 6 digits' }, { status: 400 })
    if (acct && acct.length !== 8) return NextResponse.json({ error: 'An account number has 8 digits' }, { status: 400 })
    const { error } = await s.from('supplier_profiles').upsert({
      person_id: c.personId, trading_name: t(b.tradingName, 120), address: t(b.address, 400), phone: t(b.phone, 40), email: t(b.email, 200),
      bank_account_name: t(b.bankName, 120), bank_sort_code: sort ? `${sort.slice(0, 2)}-${sort.slice(2, 4)}-${sort.slice(4)}` : null, bank_account_no: acct || null,
      vat_registered: !!b.vatRegistered, vat_number: t(b.vatNumber, 30), payment_days: Math.min(90, Math.max(0, Math.round(Number(b.paymentDays) || 14))),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'person_id' })
    return error ? NextResponse.json({ error: missing(error) ? 'Not set up yet (migration 205)' : error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }
  if (b.action === 'logo') {
    if (b.remove) { await s.from('supplier_profiles').update({ logo_path: null }).eq('person_id', c.personId); return NextResponse.json({ ok: true }) }
    const m = String(b.dataUrl ?? '').match(/^data:(image\/(png|jpeg));base64,(.+)$/)
    if (!m) return NextResponse.json({ error: 'Use a PNG or JPEG logo' }, { status: 400 })
    const bytes = Buffer.from(m[3], 'base64')
    if (bytes.length > 2_000_000) return NextResponse.json({ error: 'That logo is too big (2 MB max)' }, { status: 400 })
    const path = `${c.personId}/logo-${Date.now()}.${m[2] === 'png' ? 'png' : 'jpg'}`
    const { error } = await s.storage.from(BUCKET).upload(path, bytes, { contentType: m[1] })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await s.from('supplier_profiles').upsert({ person_id: c.personId, logo_path: path }, { onConflict: 'person_id' })
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'receipt') {
    const m = String(b.dataUrl ?? '').match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/)
    if (!m) return NextResponse.json({ error: 'Use a photo (JPEG or PNG)' }, { status: 400 })
    const bytes = Buffer.from(m[3], 'base64')
    if (bytes.length > 6_000_000) return NextResponse.json({ error: 'That photo is too big' }, { status: 400 })
    const path = `${c.personId}/receipts/${Date.now()}.${m[2] === 'png' ? 'png' : m[2] === 'webp' ? 'webp' : 'jpg'}`
    const { error } = await s.storage.from(BUCKET).upload(path, bytes, { contentType: m[1] })
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ path })
  }
  if (b.action === 'preview') {
    const sh: any = await shape(s, c.personId, c.role, b.draft ?? {})
    if (sh.error) return NextResponse.json(sh, { status: 400 })
    const pdf = await pdfFor(s, sh, sh.prof.nextNumber, b.draft?.notes)
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf' } })
  }
  if (b.action === 'resend') {
    const { data: inv } = await s.from('supplier_invoices').select('*, properties(name)').eq('id', String(b.id ?? '')).maybeSingle() as { data: any }
    if (!inv || inv.supplier_id !== c.personId || !inv.pdf_path || inv.status === 'void') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: file } = await s.storage.from(BUCKET).download(inv.pdf_path)
    if (!file) return NextResponse.json({ error: 'The PDF has gone' }, { status: 404 })
    const prof = await profileFor(s, c.personId)
    const out = await emailInvoice(s, { number: inv.number, total: Number(inv.total), due: inv.due_date, propertyLine: inv.properties?.name ? firstLine(inv.properties.name) : null, tradingName: prof.tradingName, supplierEmail: prof.email, clientEmail: inv.client_email, pdf: Buffer.from(await file.arrayBuffer()) }, req)
    if (out.sentTo.length) await s.from('supplier_invoices').update({ sent_at: new Date().toISOString(), sent_to: out.sentTo }).eq('id', inv.id)
    return out.clientOk ? NextResponse.json({ ok: true, copyOk: out.copyOk }) : NextResponse.json({ error: out.error ?? 'Email failed' }, { status: 400 })
  }
  if (b.action === 'send') {
    const out: any = await send(s, c.personId, c.role, b.draft ?? {}, req)
    return NextResponse.json(out, { status: out.error ? 400 : 200 })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

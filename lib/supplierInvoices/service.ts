// Contractors' and cleaners' invoices (migration 205). Server only, service client.
import type { SupabaseClient } from '@supabase/supabase-js'
import { colourFor, renderSupplierInvoice } from './pdf'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { sendEmail } from '@/lib/sendEmail'
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'

type S = SupabaseClient
export const BUCKET = 'supplier-invoices'
const r2 = (n: number) => Math.round(n * 100) / 100
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim()
const pname = (p: any) => p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email || '') : ''
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export async function profileFor(s: S, personId: string) {
  const [{ data: p }, { data: me }] = await Promise.all([
    s.from('supplier_profiles').select('*').eq('person_id', personId).maybeSingle(),
    s.from('people').select('first_name, last_name, full_name, company, email, phone, home_address, role').eq('id', personId).maybeSingle(),
  ]) as any[]
  const name = p?.trading_name || me?.company || pname(me) || 'My business'
  return {
    exists: !!p, role: me?.role as string,
    tradingName: name, address: p?.address ?? me?.home_address ?? '', phone: p?.phone ?? me?.phone ?? '', email: p?.email ?? me?.email ?? '',
    bankName: p?.bank_account_name ?? '', sortCode: p?.bank_sort_code ?? '', accountNo: p?.bank_account_no ?? '',
    vatRegistered: !!p?.vat_registered, vatNumber: p?.vat_number ?? '', paymentDays: p?.payment_days ?? 14,
    logoPath: p?.logo_path ?? null, colour: p?.logo_colour || colourFor(name), nextNumber: p?.next_number ?? 1001,
    invoicingEnabled: p ? p.invoicing_enabled !== false : true, cleanPrices: (p?.clean_prices ?? {}) as Record<string, number>,
  }
}

/** Can this person invoice — and invoice clients other than us? */
export async function gate(s: S, personId: string, role: string) {
  const { data: set } = await s.from('system_settings').select('value').eq('key', 'supplier_invoicing').maybeSingle()
  const prof = await profileFor(s, personId)
  if ((set?.value ?? 'true') !== 'true') return { enabled: false, others: false, why: 'Invoicing in CROS is switched off at the moment.', unbooked: [] as any[] }
  if (!prof.invoicingEnabled) return { enabled: false, others: false, why: 'Invoicing has been switched off for you — ask the office.', unbooked: [] as any[] }
  if (role !== 'contractor') return { enabled: true, others: false, why: '', unbooked: [] as any[] }
  // contractors may invoice other clients only once every one of our jobs assigned to them has a date
  const { data: open } = await s.from('maintenance_tickets').select('id, title, property_id, properties(name)')
    .eq('contractor_id', personId).eq('status', 'assigned').is('booked_date', null).is('completed_at', null)
  const unbooked = ((open ?? []) as any[]).map(t => ({ id: t.id, title: t.title, where: firstLine(t.properties?.name) }))
  return { enabled: true, others: unbooked.length === 0, why: unbooked.length ? `Book a date for ${unbooked.length} of our job${unbooked.length === 1 ? '' : 's'} to invoice other clients too.` : '', unbooked }
}

export interface Line { description: string; where?: string; labour: number; parts: number; ticketId?: string | null; cleanId?: string | null; propertyId?: string | null; date?: string | null; receipt?: string | null }
export interface Draft {
  toCapitalRooms: boolean
  client?: { name?: string; email?: string; address?: string }
  propertyId?: string | null
  periodFrom?: string | null; periodTo?: string | null
  lines: Line[]
  notes?: string
  issueDate?: string
}

/** Check and price a draft. Returns everything needed to render or save it. */
export async function shape(s: S, personId: string, role: 'contractor' | 'cleaner', d: Draft) {
  const prof = await profileFor(s, personId)
  const g = await gate(s, personId, role)
  if (!g.enabled) return { error: g.why }
  if (!d.toCapitalRooms && !g.others) return { error: role === 'cleaner' ? 'Cleaners’ invoices in CROS go to Capital Rooms.' : g.why }
  const biz = await fetchPDFBizSettings()
  const lines = (Array.isArray(d.lines) ? d.lines : []).map(l => ({
    description: String(l.description ?? '').trim().slice(0, 300), where: String(l.where ?? '').trim().slice(0, 200),
    labour: r2(Math.max(0, Number(l.labour) || 0)), parts: r2(Math.max(0, Number(l.parts) || 0)),
    ticketId: l.ticketId || null, cleanId: l.cleanId || null, propertyId: l.propertyId || null, date: l.date || null,
    receipt: typeof l.receipt === 'string' && l.receipt.startsWith(`${personId}/receipts/`) ? l.receipt : null,
  })).filter(l => l.description && (l.labour || l.parts))
  if (!lines.length) return { error: 'Add at least one line with a price' }
  if (lines.some(l => !l.where && d.toCapitalRooms && role === 'contractor')) return { error: 'Say where each job was (e.g. “Room 3 en-suite”)' }

  // our jobs / cleans must be this person's, completed, and not on another invoice
  const ticketIds = lines.map(l => l.ticketId).filter(Boolean) as string[]
  const cleanIds = lines.map(l => l.cleanId).filter(Boolean) as string[]
  if (ticketIds.length) {
    const { data: ts } = await s.from('maintenance_tickets').select('id, contractor_id, supplier_invoice_id, property_id').in('id', ticketIds)
    const bad = ((ts ?? []) as any[]).filter(t => t.contractor_id !== personId || t.supplier_invoice_id)
    if (bad.length || (ts ?? []).length !== ticketIds.length) return { error: 'One of those jobs is already invoiced or isn’t yours' }
  }
  if (cleanIds.length) {
    const { data: cs } = await s.from('cleans').select('id, cleaner_id, supplier_invoice_id, status').in('id', cleanIds)
    const bad = ((cs ?? []) as any[]).filter(c => c.cleaner_id !== personId || c.supplier_invoice_id || c.status !== 'completed')
    if (bad.length || (cs ?? []).length !== cleanIds.length) return { error: 'One of those cleans is already on another invoice — it can only be paid once' }
  }

  let property: any = null
  if (d.propertyId) {
    const { data } = await s.from('properties').select('id, name, address, postcode, letting_type').eq('id', d.propertyId).maybeSingle()
    property = data
  }
  const client = d.toCapitalRooms
    ? { name: biz.company_name, email: biz.email, address: [biz.address_line1, biz.city, biz.postcode].filter(Boolean).join('\n') }
    : { name: String(d.client?.name ?? '').trim(), email: String(d.client?.email ?? '').trim(), address: String(d.client?.address ?? '').trim() }
  if (!client.name) return { error: 'Who is the invoice to?' }
  if (client.email && !isEmail(client.email)) return { error: 'Check the client’s email address' }
  const issue = /^\d{4}-\d{2}-\d{2}$/.test(String(d.issueDate ?? '')) ? d.issueDate! : todayIso()
  const labourTotal = r2(lines.reduce((t, l) => t + l.labour, 0)), partsTotal = r2(lines.reduce((t, l) => t + l.parts, 0))
  const vat = prof.vatRegistered ? r2((labourTotal + partsTotal) * 0.2) : 0
  const period = d.periodFrom && d.periodTo ? `${new Date(`${d.periodFrom}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(`${d.periodTo}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : null
  return {
    ours: !!d.toCapitalRooms, prof, client, property, lines, issue, due: addDays(issue, prof.paymentDays), labourTotal, partsTotal, vat, total: r2(labourTotal + partsTotal + vat), period,
    propertyLine: property ? [firstLine(property.name), String(property.address ?? '').replace(/\n/g, ', '), property.postcode].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') : null,
  }
}

async function logoBytes(s: S, path: string | null) {
  if (!path) return null
  const { data } = await s.storage.from(BUCKET).download(path)
  return data ? Buffer.from(await data.arrayBuffer()) : null
}

export async function pdfFor(s: S, sh: any, number: number, notes?: string | null) {
  return renderSupplierInvoice({
    supplier: { name: sh.prof.tradingName, address: sh.prof.address, phone: sh.prof.phone, email: sh.prof.email, vatNumber: sh.prof.vatRegistered ? sh.prof.vatNumber : null, logo: await logoBytes(s, sh.prof.logoPath), colour: sh.prof.colour },
    number, issueDate: sh.issue, dueDate: sh.due, client: sh.client, property: sh.propertyLine, period: sh.period,
    lines: sh.lines.map((l: Line) => ({ description: l.description, where: l.where, labour: l.labour, parts: l.parts })),
    labourTotal: sh.labourTotal, partsTotal: sh.partsTotal, vat: sh.vat, total: sh.total,
    bank: { name: sh.prof.bankName, sortCode: sh.prof.sortCode, accountNo: sh.prof.accountNo }, notes: notes ?? null,
    // our own managed houses get a plain invoice; everything else carries 'Powered by Capital Rooms'
    poweredBy: !sh.ours || sh.property?.letting_type === 'let_only',
  })
}

/** Take a number, save, mark the jobs / cleans, file the PDF and email it (client + a copy to the supplier). */
export async function send(s: S, personId: string, role: 'contractor' | 'cleaner', d: Draft, req: Request) {
  const sh: any = await shape(s, personId, role, d)
  if (sh.error) return sh
  await s.from('supplier_profiles').upsert({ person_id: personId, logo_colour: sh.prof.colour }, { onConflict: 'person_id', ignoreDuplicates: false })
  const { data: num, error: nErr } = await s.rpc('take_supplier_invoice_number', { p_person: personId })
  if (nErr || !num) return { error: nErr?.message ?? 'Could not number the invoice' }
  const notes = String(d.notes ?? '').trim().slice(0, 1000) || null
  const { data: inv, error } = await s.from('supplier_invoices').insert({
    supplier_id: personId, kind: role, number: num, to_capital_rooms: !!d.toCapitalRooms,
    client_name: sh.client.name, client_email: sh.client.email || null, client_address: sh.client.address || null,
    property_id: sh.property?.id ?? null, issue_date: sh.issue, due_date: sh.due, period_from: d.periodFrom || null, period_to: d.periodTo || null,
    lines: sh.lines, labour_total: sh.labourTotal, parts_total: sh.partsTotal, vat_amount: sh.vat, total: sh.total, notes,
  }).select('id').single()
  if (error) return { error: error.message }

  // claim the jobs / cleans — only ones not already on an invoice; if any were taken meanwhile, void this one
  const ticketIds = sh.lines.map((l: Line) => l.ticketId).filter(Boolean)
  const cleanIds = sh.lines.map((l: Line) => l.cleanId).filter(Boolean)
  const claimT = ticketIds.length ? await s.from('maintenance_tickets').update({ supplier_invoice_id: inv.id }).in('id', ticketIds).is('supplier_invoice_id', null).select('id') : { data: [] }
  const claimC = cleanIds.length ? await s.from('cleans').update({ supplier_invoice_id: inv.id }).in('id', cleanIds).is('supplier_invoice_id', null).select('id') : { data: [] }
  if ((claimT.data ?? []).length !== ticketIds.length || (claimC.data ?? []).length !== cleanIds.length) {
    await s.from('maintenance_tickets').update({ supplier_invoice_id: null }).eq('supplier_invoice_id', inv.id)
    await s.from('cleans').update({ supplier_invoice_id: null }).eq('supplier_invoice_id', inv.id)
    await s.from('supplier_invoices').update({ status: 'void', void_reason: 'Some items were already invoiced' }).eq('id', inv.id)
    return { error: 'Some of those were invoiced already — nothing was sent. Refresh and try again.' }
  }
  // cleaners: remember each property's price for next time
  if (role === 'cleaner') {
    const prices = { ...sh.prof.cleanPrices }
    for (const l of sh.lines as Line[]) if (l.propertyId && l.labour) prices[l.propertyId] = l.labour
    await s.from('supplier_profiles').update({ clean_prices: prices }).eq('person_id', personId)
  }

  const pdf = await pdfFor(s, sh, num, notes)
  const path = `${personId}/${num}.pdf`
  await s.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  const out = await emailInvoice(s, { number: num, total: sh.total, due: sh.due, propertyLine: sh.propertyLine, tradingName: sh.prof.tradingName, supplierEmail: sh.prof.email, clientEmail: sh.client.email, pdf }, req)
  await s.from('supplier_invoices').update({ pdf_path: path, sent_at: out.sentTo.length ? new Date().toISOString() : null, sent_to: out.sentTo.length ? out.sentTo : null }).eq('id', inv.id)
  if (d.toCapitalRooms) {
    const { data: office } = await s.from('people').select('id').in('role', ['administrator', 'admin'])
    const ids = ((office ?? []) as any[]).map(p => p.id)
    const title = `🧾 Invoice ${num} from ${sh.prof.tradingName}`, body = `£${sh.total.toFixed(2)}${sh.propertyLine ? ` · ${firstLine(sh.propertyLine)}` : sh.period ? ` · ${sh.period}` : ''} — to approve`
    await insertNotifications(s, ids, { title, body, type: 'finance', link: '/admin/supplier-invoices' })
    await sendServerPush({ personIds: ids, title, body, url: '/admin/supplier-invoices', tag: `inv-${inv.id}` })
  }
  return { ok: true, id: inv.id, number: num, emailed: out.clientOk, emailError: out.clientOk ? null : out.error, copyOk: out.copyOk }
}

/** The client gets the invoice; the supplier gets a copy in a separate email, so a bad copy address never stops the client's. */
export async function emailInvoice(s: S, v: { number: number; total: number; due: string; propertyLine?: string | null; tradingName: string; supplierEmail?: string | null; clientEmail?: string | null; pdf: Buffer }, req: Request) {
  const attachments = [{ filename: `Invoice-${v.number}.pdf`, content: v.pdf.toString('base64') }]
  const dueText = new Date(`${v.due}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const sentTo: string[] = []
  let clientOk = false, error: string | null = 'No email address for the client'
  if (v.clientEmail && isEmail(v.clientEmail)) {
    const r = await sendEmail(v.clientEmail, `Invoice ${v.number} from ${v.tradingName}`,
      `<p>Please find attached invoice <strong>${v.number}</strong> from ${v.tradingName} for <strong>£${Number(v.total).toFixed(2)}</strong>, due ${dueText}.</p>${v.propertyLine ? `<p>Property: ${v.propertyLine}</p>` : ''}<p>Any questions, reply to this email to reach ${v.tradingName}.</p>`,
      { req, replyTo: v.supplierEmail && isEmail(v.supplierEmail) ? v.supplierEmail : undefined, signature: false, attachments } as any)
    clientOk = r.ok; error = r.ok ? null : r.error ?? 'Email failed'
    if (r.ok) sentTo.push(v.clientEmail)
  }
  let copyOk = false
  if (v.supplierEmail && isEmail(v.supplierEmail) && v.supplierEmail !== v.clientEmail) {
    const r = await sendEmail(v.supplierEmail, `Your copy: invoice ${v.number} — £${Number(v.total).toFixed(2)}`,
      `<p>Here’s your copy of invoice <strong>${v.number}</strong>${clientOk ? ` — it has been emailed to ${v.clientEmail}` : ' — it has NOT been emailed to the client yet'}. Keep it for your records.</p>`,
      { req, signature: false, attachments } as any)
    copyOk = r.ok
    if (r.ok) sentTo.push(v.supplierEmail)
  }
  return { clientOk, copyOk, error, sentTo }
}

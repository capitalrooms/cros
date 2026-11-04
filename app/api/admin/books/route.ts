// /api/admin/books — the books (lib/finance/books, 4 Nov 2026): every rent received, fee, expense, payment to a
// landlord and deposit, for a tax year or dates, a landlord or a property.
//   GET  ?year=2026 | ?from=&to=  [&landlordId=&propertyId=&kind=rent|fee|expense|payout|deposit] [&format=csv]
//        → { rows, totals, checks, vat, landlords, properties }  or the CSV for an accountant
//   POST { action: 'vat', from: 'YYYY-MM-DD' | null, rate } — administrators: when our fees start carrying VAT
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadBooks, booksCsv, taxYearRange, type BookKind } from '@/lib/finance/books'
import { statementMonth } from '@/lib/finance/statementMonth'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const KINDS: BookKind[] = ['rent', 'fee', 'expense', 'payout', 'deposit']
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const s = createServiceClient()
  const year = Number(q.get('year'))
  const range = year ? taxYearRange(year) : { from: q.get('from') || '', to: q.get('to') || '', label: '' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) return NextResponse.json({ error: 'Choose a tax year or two dates' }, { status: 400 })
  const books = await loadBooks(s as any, { from: range.from, to: range.to, landlordId: q.get('landlordId'), propertyId: q.get('propertyId') })
  const kind = q.get('kind') as BookKind | null
  const rows = kind && KINDS.includes(kind) ? books.rows.filter(r => r.kind === kind) : books.rows

  if (q.get('format') === 'csv') {
    const name = `Capital Rooms ${kind ? { rent: 'rent received', fee: 'fees', expense: 'expenses', payout: 'payments to landlords', deposit: 'deposits' }[kind] : 'books'} ${range.label || `${range.from} to ${range.to}`}.csv`
    return new NextResponse(booksCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': contentDisposition(name) } })
  }

  const totals = Object.fromEntries(KINDS.map(k => [k, r2(books.rows.filter(r => r.kind === k).reduce((t, r) => t + r.amount, 0))]))
  const fees = books.rows.filter(r => r.kind === 'fee')
  const feeTotals = { management: r2(fees.filter(f => f.category === 'management fee').reduce((t, f) => t + f.amount, 0)), letting: r2(fees.filter(f => f.category === 'letting fee').reduce((t, f) => t + f.amount, 0)), net: r2(fees.reduce((t, f) => t + (f.net ?? 0), 0)), vat: r2(fees.reduce((t, f) => t + (f.vat ?? 0), 0)) }

  // things to look at — said plainly, with what to do
  const checks: { level: 'fix' | 'look'; text: string }[] = books.checks.map(t => ({ level: 'fix' as const, text: t }))
  const perStatement = [...new Set(books.rows.filter(r => r.source === 'per statement' && (r.kind === 'rent' || r.kind === 'fee')).map(r => r.reference))]
  if (perStatement.length) checks.push({ level: 'look', text: `${perStatement.length} statement${perStatement.length === 1 ? ' was' : 's were'} imported without a room-by-room breakdown, so rent and fees show as the statement total: ${perStatement.slice(0, 12).join(', ')}${perStatement.length > 12 ? '…' : ''}. The totals are right; re-import them for the detail if you need it.` })
  for (const r of books.rows.filter(r => r.note && r.kind === 'payout' && r.amount < 0)) checks.push({ level: 'fix', text: `${r.reference}: ${r.property} pays the landlord ${r.amount.toFixed(2)} — a statement shouldn’t leave the landlord owing. Check it against the old system.` })
  const undated = books.rows.filter(r => r.kind === 'deposit' && r.note?.startsWith('Received date not recorded')).length
  if (undated) checks.push({ level: 'look', text: `${undated} deposit${undated === 1 ? ' has' : 's have'} no received date — counted from the tenancy start. Add the date on the letting file (Money › Deposit).` })
  const unprotected = books.rows.filter(r => r.kind === 'deposit' && r.note === 'Received — not yet shown as protected').length
  if (unprotected) checks.push({ level: 'fix', text: `${unprotected} deposit${unprotected === 1 ? ' was' : 's were'} received but aren’t shown as protected or sent to the scheme.` })
  // statement lines that look wrongly filed, and two statements for one house and month
  const { data: odd } = await s.from('statement_line_items').select('description, amount, category, statement_date').eq('category', 'rent_income').or('description.ilike.%reversal%,description.ilike.%refund%,description.ilike.%overcharg%,description.ilike.%credit%').gte('statement_date', range.from).lte('statement_date', range.to)
  for (const l of (odd ?? []) as any[]) checks.push({ level: 'fix', text: `“${l.description}” (£${Number(l.amount).toFixed(2)}, ${l.statement_date}) is filed as rent, but reads like a refund of a cost. Re-file it under Expenses › Statement lines.` })
  const { data: sts } = await s.from('landlord_statements').select('statement_reference, statement_date, period_start, period_end, property_id, properties(name, is_demo)').gte('statement_date', range.from).lte('statement_date', range.to)
  const seen = new Map<string, string[]>()
  for (const st of (sts ?? []) as any[]) { if (st.properties?.is_demo) continue; const k = `${String(st.properties?.name ?? '').split('\n')[0]}|${statementMonth(st)}`; seen.set(k, [...(seen.get(k) ?? []), st.statement_reference]) }
  for (const [k, refs] of seen) if (refs.length > 1) checks.push({ level: 'look', text: `${k.split('|')[0]} has ${refs.length} statements for ${k.split('|')[1]}: ${refs.join(', ')} — fine if one is a correction; otherwise one is a duplicate.` })

  const [{ data: landlords }, { data: properties }] = await Promise.all([
    s.from('people').select('id, salutation, first_name, last_name, full_name, company').eq('role', 'landlord'),
    s.from('properties').select('id, name, is_demo'),
  ])
  return NextResponse.json({
    from: range.from, to: range.to, label: range.label, vat: books.vat, rows, totals, feeTotals, checks,
    landlords: ((landlords ?? []) as any[]).map(p => ({ id: p.id, name: p.company || [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name })).sort((a, b) => a.name.localeCompare(b.name)),
    properties: ((properties ?? []) as any[]).filter(p => !p.is_demo).map(p => ({ id: p.id, name: String(p.name).split('\n')[0] })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdministrator(req)
  if (!admin) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'vat') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const s = createServiceClient()
  if (!b.from) { await s.from('system_settings').upsert({ key: 'vat_registration', value: JSON.stringify(null) }, { onConflict: 'key' }); return NextResponse.json({ ok: true, vat: null }) }
  const rate = Number(b.rate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.from)) || !(rate > 0 && rate <= 30)) return NextResponse.json({ error: 'Give the date VAT starts and the rate (e.g. 20)' }, { status: 400 })
  await s.from('system_settings').upsert({ key: 'vat_registration', value: JSON.stringify({ from: b.from, rate }) }, { onConflict: 'key' })
  await s.from('audit_logs').insert({ user_id: admin.personId, action: 'vat_registration', details: `from ${b.from} at ${rate}%` })
  return NextResponse.json({ ok: true, vat: { from: b.from, rate } })
}

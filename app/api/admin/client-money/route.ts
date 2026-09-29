// Client money.
// GET  ?asAt=YYYY-MM-DD                       balances per landlord, cash book total, reconciliations
// GET  ?landlordId=<id|none>&asAt=            that landlord's ledger entries
// GET  ?export=csv&from=&to=                   ledger CSV for the accountant (10ninety)
// POST { action: 'reconcile', asAt, bankBalance, notes? }      sign off the monthly three-way reconciliation
// POST { action: 'adjust', landlordId, propertyId?, entryDate, kind, description, amount, reference? }
// POST { action: 'void_adjustment', id, reason }
// POST { action: 'close_month', month: 'YYYY-MM' }     close a reconciled month (nothing can be dated into it after)
// POST { action: 'reopen_month', month, reason }        reopen it — recorded, with the reason
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { contentDisposition } from '@/lib/contentDisposition'
import { loadLedger, landlordBalances, cashbookTotal, ledgerCsv } from '@/lib/clientLedger'
import { clientAccountPosition } from '@/lib/finance/clientAccount'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const DATE = /^\d{4}-\d{2}-\d{2}$/
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const SETUP = 'Run migration 189 in Supabase to switch on reconciliations and adjustments.'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const s = svc()

  if (q.get('export') === 'csv') {
    const { entries } = await loadLedger(s, { from: q.get('from') || undefined, asAt: q.get('to') || undefined })
    const balances = await landlordBalances(s, entries)
    const names = new Map(balances.filter(b => b.landlordId).map(b => [b.landlordId!, b.name]))
    return new NextResponse(ledgerCsv(entries, names), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': contentDisposition(`Client ledger ${q.get('from') || 'start'} to ${q.get('to') || 'today'}.csv`) },
    })
  }

  const ledger = await loadLedger(s, { asAt: q.get('asAt') || undefined })
  if (q.get('landlordId')) {
    const id = q.get('landlordId')
    const entries = ledger.entries.filter(e => (id === 'none' ? !e.landlordId : e.landlordId === id))
    let running = 0
    return NextResponse.json({ entries: entries.map(e => ({ ...e, balance: (running = r2(running + e.amount)) })) })
  }
  const balances = await landlordBalances(s, ledger.entries)
  const { data: landlords } = await s.from('people').select('id, first_name, last_name, full_name, company').eq('role', 'landlord').order('last_name')
  const { data: recs, error } = await s.from('client_reconciliations').select('id, as_at, bank_balance, cashbook_balance, ledgers_total, difference, notes, signed_at, signed_by').order('as_at', { ascending: false }).limit(24)
  const position = await clientAccountPosition(s, q.get('asAt') || undefined)
  const { data: periods } = await s.from('finance_periods').select('month, status, closed_at, reopened_at, reopen_reason').order('month', { ascending: false })
  return NextResponse.json({
    position, periods: periods ?? [],
    start: ledger.start, asAt: ledger.asAt,
    cashbook: cashbookTotal(ledger.entries),
    ledgersTotal: r2(balances.reduce((t, b) => t + b.balance, 0)),
    balances, negative: balances.filter(b => b.balance < -0.005).length,
    reconciliations: recs ?? [],
    landlords: (landlords ?? []).map((p: any) => ({ id: p.id, name: p.company || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name })),
    setupNeeded: error || !ledger.adjustmentsReady ? SETUP : null,
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = svc()

  if (b.action === 'reconcile') {
    if (!DATE.test(b.asAt || '')) return NextResponse.json({ error: 'Pick the date of the bank statement balance.' }, { status: 400 })
    const bank = Number(String(b.bankBalance ?? '').replace(/[£,\s]/g, ''))
    if (!isFinite(bank) || String(b.bankBalance ?? '').trim() === '') return NextResponse.json({ error: 'Enter the client account balance from the bank statement.' }, { status: 400 })
    const pos = await clientAccountPosition(s, b.asAt)
    const row = {
      as_at: b.asAt, bank_balance: r2(bank), cashbook_balance: pos.cashbook.total,
      ledgers_total: pos.breakdownTotal, difference: r2(bank - pos.cashbook.total),
      notes: String(b.notes || '').trim() || null, signed_by: admin.personId,
    }
    const { error } = await s.from('client_reconciliations').insert(row)
    if (error) return NextResponse.json({ error: error.code === 'PGRST205' ? SETUP : error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...row })
  }

  if (b.action === 'adjust') {
    const amount = Number(String(b.amount ?? '').replace(/[£,\s]/g, ''))
    if (!DATE.test(b.entryDate || '')) return NextResponse.json({ error: 'Pick the date.' }, { status: 400 })
    if (!isFinite(amount) || !amount) return NextResponse.json({ error: 'Enter the amount (use a minus for money out).' }, { status: 400 })
    if (!String(b.description || '').trim()) return NextResponse.json({ error: 'Say what it is for.' }, { status: 400 })
    const { error } = await s.from('client_ledger_adjustments').insert({
      landlord_id: b.landlordId || null, property_id: b.propertyId || null, entry_date: b.entryDate, kind: b.kind || 'correction',
      description: String(b.description).trim(), amount: r2(amount), reference: String(b.reference || '').trim() || null, created_by: admin.personId,
    })
    if (error) return NextResponse.json({ error: error.code === 'PGRST205' ? SETUP : error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'close_month' || b.action === 'reopen_month') {
    if (!/^\d{4}-\d{2}$/.test(b.month || '')) return NextResponse.json({ error: 'Choose the month' }, { status: 400 })
    const month = `${b.month}-01`
    const [y, m] = String(b.month).split('-').map(Number)
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const now = new Date().toISOString()
    if (b.action === 'close_month') {
      // only once the client account for the month end is reconciled to the penny
      const { data: rec } = await s.from('client_reconciliations').select('id, difference').eq('as_at', monthEnd).order('signed_at', { ascending: false }).limit(1).maybeSingle()
      if (!rec) return NextResponse.json({ error: `Reconcile the client account at ${monthEnd} first (bank balance on that date).` }, { status: 409 })
      if (Math.abs(Number(rec.difference)) >= 0.005) return NextResponse.json({ error: `The reconciliation at ${monthEnd} has a difference of £${Number(rec.difference).toFixed(2)} — find it before closing the month.` }, { status: 409 })
      const { error } = await s.from('finance_periods').upsert({ month, status: 'closed', reconciliation_id: rec.id, closed_at: now, closed_by: admin.personId, reopened_at: null, reopened_by: null, reopen_reason: null })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, message: `${b.month} closed. Nothing can now be dated into it.` })
    }
    if (String(b.reason || '').trim().length < 5) return NextResponse.json({ error: 'Say why the month is being reopened.' }, { status: 400 })
    const { error } = await s.from('finance_periods').update({ status: 'reopened', reopened_at: now, reopened_by: admin.personId, reopen_reason: String(b.reason).trim() }).eq('month', month).eq('status', 'closed')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, message: `${b.month} reopened — reconcile and close it again when the correction is in.` })
  }

  if (b.action === 'void_adjustment') {
    if (!String(b.reason || '').trim()) return NextResponse.json({ error: 'Give a reason for voiding it.' }, { status: 400 })
    const { error } = await s.from('client_ledger_adjustments').update({ voided_at: new Date().toISOString(), void_reason: String(b.reason).trim() }).eq('id', b.id).is('voided_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

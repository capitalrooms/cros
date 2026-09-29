// The month-end payment run (lib/finance/paymentRun, migration 193).
// GET  ?month=YYYY-MM                   the run: landlord payments, expenses and fees transfers, checks
// GET  ?month=YYYY-MM&export=bank       bank bulk-payment file for the landlord payments still to make
// POST { action: 'open', month }                          start the run with every approved, unpaid statement
// POST { action: 'add_ready', month }                     add statements approved since the run was started
// POST { action: 'pay', month, key, paidDate }            record one landlord payment (all its statements)
// POST { action: 'transfer', month, kind, date, reference } record the fees or expenses transfer (amount = what's due)
// POST { action: 'void_transfer', month, id, reason }      a transfer recorded by mistake (kept, marked void)
// POST { action: 'close', month }                          close the run — only when everything is paid and matches
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { loadPaymentRun, bankFileCsv, ledgerStart } from '@/lib/finance/paymentRun'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const isDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const month = req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7)
  try {
    const view = await loadPaymentRun(createServiceClient(), month)
    if (req.nextUrl.searchParams.get('export') === 'bank') {
      return new NextResponse(bankFileCsv(view), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': contentDisposition(`Landlord payments ${view.run?.runNo ?? month}.csv`) } })
    }
    return NextResponse.json(view)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load the payment run' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const month = String(b.month || '')
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Choose the month' }, { status: 400 })
  const s = createServiceClient()
  const view = await loadPaymentRun(s, month)
  const run = view.run
  const now = new Date().toISOString()

  const attachReady = async (runId: string) => {
    const ids = view.waiting.filter(w => w.state === 'approved').map(w => w.id)
    if (ids.length) {
      const { error } = await s.from('landlord_statements').update({ payment_run_id: runId }).in('id', ids).is('payment_run_id', null).is('paid_date', null).not('approved_at', 'is', null)
      if (error) throw new Error(error.message)
    }
    return ids.length
  }

  try {
    if (b.action === 'open') {
      if (run && run.status === 'open') return NextResponse.json({ error: `${run.runNo} is already open for this month` }, { status: 409 })
      if (!view.waiting.some(w => w.state === 'approved')) return NextResponse.json({ error: 'No approved statements to pay yet — approve them first.' }, { status: 409 })
      const { data: created, error } = await s.from('payment_runs').insert({ period_month: `${month}-01`, created_by: admin.personId }).select('id, run_no').single()
      if (error) throw new Error(error.message)
      const n = await attachReady(created.id)
      return NextResponse.json({ ok: true, message: `Started ${created.run_no} with ${n} statement${n === 1 ? '' : 's'}.` })
    }
    if (!run) return NextResponse.json({ error: 'Start the payment run first' }, { status: 409 })
    if (run.status === 'closed') return NextResponse.json({ error: `${run.runNo} is closed` }, { status: 409 })

    if (b.action === 'add_ready') {
      const n = await attachReady(run.id)
      return NextResponse.json({ ok: true, message: n ? `Added ${n} statement${n === 1 ? '' : 's'} to ${run.runNo}.` : 'No newly approved statements.' })
    }

    if (b.action === 'pay') {
      const p = view.payments.find(x => x.key === b.key)
      if (!p) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      if (p.paid) return NextResponse.json({ error: 'Already recorded as paid' }, { status: 409 })
      if (!p.bank) return NextResponse.json({ error: `Add bank details for ${p.landlord} first` }, { status: 409 })
      const takeover = await ledgerStart(s)
      // client money rule: never pay a landlord more than is held for them (statements from the ledger start)
      if (p.held != null && p.amount > p.held + 0.005 && p.statements.some(x => (x.date ?? '') >= takeover))
        return NextResponse.json({ error: `Only £${p.held.toFixed(2)} is held for ${p.landlord}; this payment is £${p.amount.toFixed(2)}. Check the rent received and statements first.` }, { status: 409 })
      const paidDate = isDate(b.paidDate) ? b.paidDate : now.slice(0, 10)
      for (const st of p.statements.filter(x => !x.paidDate)) {
        const { error } = await s.from('landlord_statements').update({ paid_date: paidDate, amount_paid: st.net }).eq('id', st.id).is('paid_date', null)
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true, message: `Recorded £${p.amount.toFixed(2)} paid to ${p.landlord} on ${paidDate}.` })
    }

    if (b.action === 'transfer') {
      const t = view.transfers.find(x => x.kind === b.kind)
      if (!t) return NextResponse.json({ error: 'Choose fees or expenses' }, { status: 400 })
      if (t.recorded) return NextResponse.json({ error: `Already recorded (${t.recorded.number})` }, { status: 409 })
      if (t.expected <= 0) return NextResponse.json({ error: 'Nothing to transfer' }, { status: 409 })
      const { data, error } = await s.from('office_transfers').insert({
        payment_run_id: run.id, kind: t.kind, amount: t.expected, transferred_on: isDate(b.date) ? b.date : now.slice(0, 10),
        reference: String(b.reference || '').trim() || null, created_by: admin.personId,
      }).select('txn_no').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, message: `Recorded ${data.txn_no}: £${t.expected.toFixed(2)} ${t.kind === 'fees' ? 'fees' : 'expenses'} moved to the office account.` })
    }

    if (b.action === 'void_transfer') {
      if (String(b.reason || '').trim().length < 3) return NextResponse.json({ error: 'Say why it’s being voided' }, { status: 400 })
      const { error } = await s.from('office_transfers').update({ voided_at: now, voided_by: admin.personId, void_reason: String(b.reason).trim() }).eq('id', b.id).eq('payment_run_id', run.id).is('voided_at', null)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, message: 'Transfer voided — kept on record.' })
    }

    if (b.action === 'close') {
      if (!view.canClose) return NextResponse.json({ error: 'Not everything is done yet: ' + [...view.checks.filter(c => !c.ok).map(c => c.message), ...view.payments.filter(p => !p.paid).map(p => `${p.landlord} not paid`), ...view.transfers.filter(t => t.expected > 0 && !t.recorded).map(t => `${t.kind} transfer not recorded`)].join('; ') }, { status: 409 })
      const { error } = await s.from('payment_runs').update({ status: 'closed', closed_at: now, closed_by: admin.personId }).eq('id', run.id).eq('status', 'open')
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, message: `${run.runNo} closed. Everything paid and transferred.` })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}

// GET /api/admin/finance-home?month=YYYY-MM — everything the Finance home shows for a month, in one request:
// where the month is in the cycle (rent roll → statements → payment run → reconcile & close), the key numbers,
// and the to-do list (each item links to the screen that deals with it).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { buildRentRoll } from '@/lib/finance/rentRoll'
import { loadPaymentRun } from '@/lib/finance/paymentRun'
import { clientAccountPosition } from '@/lib/finance/clientAccount'
import { ledgerStart } from '@/lib/clientLedger'
import { demoPropertyIds } from '@/lib/demoProperties'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface Todo { key: string; tone: 'red' | 'amber' | 'green' | 'grey'; title: string; detail?: string; href: string; action: string }

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const month = /^\d{4}-\d{2}$/.test(req.nextUrl.searchParams.get('month') || '') ? req.nextUrl.searchParams.get('month')! : new Date().toISOString().slice(0, 7)
  const s = createServiceClient()
  const [y, m] = month.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  try {
    const [roll, run, position, start, demo] = await Promise.all([buildRentRoll(s, month), loadPaymentRun(s, month), clientAccountPosition(s), ledgerStart(s), demoPropertyIds(s)])
    const [unmatched, overdue, recs, period, deposits] = await Promise.all([
      s.from('bank_transactions').select('amount').eq('status', 'unmatched'),
      s.from('rent_charges').select('room_id, property_id, charge_month, amount_due, amount_received, voided').in('status', ['overdue', 'partial']).gte('charge_month', start),
      s.from('client_reconciliations').select('as_at, difference').order('as_at', { ascending: false }).limit(1),
      s.from('finance_periods').select('status').eq('month', `${month}-01`).maybeSingle(),
      s.from('tenancies').select('id, start_date, deposit_amount, deposit_scheme_ref, deposit_protection_assumed, property_id').gt('deposit_amount', 0).is('deposit_scheme_ref', null).lte('start_date', today),
    ])

    const rooms = roll.properties.flatMap(p => p.rooms)
    const paidRooms = rooms.filter(r => ['paid', 'over', 'collected_by_previous_agent'].includes(r.status)).length
    const ready = roll.properties.filter(p => p.readyForStatement > 0)
    const drafts = run.waiting.filter(w => w.state === 'draft')
    const approvedWaiting = run.waiting.filter(w => w.state === 'approved')
    const toPay = run.payments.filter(p => !p.paid)
    const transfersDue = run.transfers.filter(t => t.expected > 0 && !t.recorded)
    const unmatchedList = (unmatched.data ?? []) as any[]
    const arrears = ((overdue.data ?? []) as any[]).filter(c => !c.voided && !demo.has(c.property_id) && Number(c.amount_due) > Number(c.amount_received || 0))
    const arrearsTotal = r2(arrears.reduce((t, c) => t + Number(c.amount_due) - Number(c.amount_received || 0), 0))
    const longArrears = new Set(arrears.filter(c => (Date.parse(today) - Date.parse(c.charge_month)) / 86_400_000 >= 14).map(c => c.room_id)).size
    const lastRec = (recs.data ?? [])[0] as any
    const closed = period.data?.status === 'closed'
    const unprotected = ((deposits.data ?? []) as any[]).filter(t => !t.deposit_protection_assumed && !demo.has(t.property_id))
    const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const prev = roll.source === 'previous_agent'
    const beforeRecords = monthEnd < start
    const steps = prev ? [
      { n: 1, label: 'Rent roll', href: `/admin/rent-roll?month=${month}`, status: 'Collected by previous agent', done: true },
      { n: 2, label: 'Statements', href: '/admin/statements', status: 'Issued by previous agent', done: true },
      { n: 3, label: 'Payment run', href: `/admin/payment-run?month=${month}`, status: 'Paid by previous agent', done: true },
      { n: 4, label: 'Reconcile & close', href: '/admin/client-money', status: beforeRecords ? 'Before CROS records' : closed ? 'Month closed' : 'Not yet', done: beforeRecords || closed },
    ] : [
      { n: 1, label: 'Rent roll', href: `/admin/rent-roll?month=${month}`, status: `${paidRooms}/${rooms.length} rooms in`, done: rooms.length > 0 && paidRooms === rooms.length },
      { n: 2, label: 'Statements', href: `/admin/rent-roll?month=${month}`, status: ready.length ? `${ready.length} to prepare` : drafts.length ? `${drafts.length} to approve` : 'Up to date', done: !ready.length && !drafts.length },
      { n: 3, label: 'Payment run', href: `/admin/payment-run?month=${month}`, status: !run.run ? (approvedWaiting.length ? 'Ready to start' : 'Not started') : run.run.status === 'closed' ? `${run.run.runNo} closed` : `${run.run.runNo} open`, done: run.run?.status === 'closed' },
      { n: 4, label: 'Reconcile & close', href: '/admin/client-money', status: closed ? 'Month closed' : lastRec ? `Last reconciled ${lastRec.as_at}` : 'Not yet', done: closed },
    ]
    const current = steps.find(x => !x.done)?.n ?? 4

    const todos: Todo[] = []
    if (unmatchedList.length) todos.push({ key: 'unmatched', tone: 'amber', title: `${unmatchedList.length} bank payment${unmatchedList.length === 1 ? '' : 's'} not matched`, detail: gbp(r2(unmatchedList.reduce((t, x) => t + Number(x.amount || 0), 0))), href: '/admin/reconciliation', action: 'Match' })
    if (roll.totals.missing > 0 && roll.source === 'cros') todos.push({ key: 'missing', tone: 'amber', title: `Rent still missing for ${monthLabel(month)}`, detail: gbp(roll.totals.missing), href: `/admin/rent-roll?month=${month}`, action: 'Rent roll' })
    if (ready.length) todos.push({ key: 'ready', tone: 'amber', title: `${ready.length} propert${ready.length === 1 ? 'y has' : 'ies have'} rent ready for a statement`, detail: gbp(roll.totals.ready), href: `/admin/rent-roll?month=${month}`, action: 'Prepare' })
    if (drafts.length) todos.push({ key: 'drafts', tone: 'amber', title: `${drafts.length} statement${drafts.length === 1 ? '' : 's'} waiting for approval`, detail: drafts.map(d => d.reference).join(', '), href: `/admin/payment-run?month=${month}`, action: 'Review' })
    if (approvedWaiting.length) todos.push({ key: 'approved', tone: 'amber', title: `${approvedWaiting.length} approved statement${approvedWaiting.length === 1 ? '' : 's'} not in a payment run`, href: `/admin/payment-run?month=${month}`, action: run.run ? 'Add to run' : 'Start run' })
    if (toPay.length) todos.push({ key: 'pay', tone: 'amber', title: `${toPay.length} landlord payment${toPay.length === 1 ? '' : 's'} to make`, detail: gbp(r2(toPay.reduce((t, p) => t + p.amount, 0))), href: `/admin/payment-run?month=${month}`, action: 'Pay' })
    for (const t of transfersDue) todos.push({ key: `trf-${t.kind}`, tone: 'amber', title: `Move ${t.kind === 'fees' ? 'our fees' : 'expenses'} to the office account`, detail: gbp(t.expected), href: `/admin/payment-run?month=${month}`, action: 'Record' })
    if (longArrears) todos.push({ key: 'arrears', tone: 'red', title: `${longArrears} tenant${longArrears === 1 ? '' : 's'} 14+ days in arrears`, detail: gbp(arrearsTotal), href: '/admin/arrears', action: 'Chase' })
    else if (arrears.length) todos.push({ key: 'arrears', tone: 'amber', title: `${new Set(arrears.map(a => a.room_id)).size} tenant${arrears.length === 1 ? '' : 's'} behind with rent`, detail: gbp(arrearsTotal), href: '/admin/arrears', action: 'Arrears' })
    if (unprotected.length) todos.push({ key: 'deposits', tone: 'red', title: `${unprotected.length} deposit${unprotected.length === 1 ? '' : 's'} with no DPS reference recorded`, detail: 'Tenancies since April 2026 — add the DPS ID and certificate', href: '/admin/deposits', action: 'Deposits' })
    if (!position.agrees) todos.push({ key: 'ledger', tone: 'red', title: 'Client account ledgers don’t agree', href: '/admin/client-money', action: 'Check' })
    if (month < today.slice(0, 7) && !beforeRecords && !closed) todos.push({ key: 'close', tone: 'grey', title: `Reconcile and close ${monthLabel(month)}`, href: '/admin/client-money', action: 'Reconcile' })
    if (!todos.length) todos.push({ key: 'clear', tone: 'green', title: 'Nothing waiting — the month is up to date', href: `/admin/rent-roll?month=${month}`, action: 'Rent roll' })

    return NextResponse.json({
      month, source: roll.source, steps, current, todos,
      numbers: {
        due: roll.source === 'previous_agent' ? roll.totals.received : roll.totals.due, received: roll.totals.received, missing: roll.totals.missing,
        heldInClientAccount: position.cashbook.total, agrees: position.agrees, toLandlords: run.totals.toLandlords, fees: run.totals.fees,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load' }, { status: 500 })
  }
}

function monthLabel(m: string) { return new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }

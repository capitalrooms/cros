'use client'

/**
 * /admin/payment-run?month=YYYY-MM — step 3 of the monthly cycle (lib/finance/paymentRun, migration 193).
 * The approved statements for the month become: one payment per landlord (bank file, client-money check, tick when
 * paid); the expenses transfer back to the office account; and the fees transfer (our income). Each list exports to
 * CSV/PDF. The run closes when everything is ticked and it all adds up: rent = landlords + fees + expenses.
 */

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { getCurrentUser } from '@/lib/auth'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'
import type { PaymentRunView } from '@/lib/finance/paymentRun'

const gbp = (n: number | null | undefined) => (n == null ? '' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const monthLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const shift = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7) }
const ukDate = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const sort = (s: string) => (s.length === 6 ? `${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4)}` : s)

export default function PaymentRunPage({ searchParams }: { searchParams: PageSearchParams }) {
  return <PaymentRun initialMonth={one(use(searchParams).month)} />
}

function PaymentRun({ initialMonth }: { initialMonth?: string }) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [v, setV] = useState<PaymentRunView | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))

  const load = useCallback(async (m: string) => {
    const r = await adminFetch(`/api/admin/payment-run?month=${m}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setError(j.error || 'Could not load the payment run'); else setV(j)
  }, [])
  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !['administrator', 'admin'].includes(u.assignment?.role || '')) { router.push('/login'); return }
      load(month)
    })()
  }, [router, load, month])

  const go = (m: string) => { setMonth(m); setV(null); router.replace(`/admin/payment-run?month=${m}`) }
  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(String(body.action) + (body.key ?? body.kind ?? '')); setError(''); setNotice('')
    const r = await adminFetch('/api/admin/payment-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, ...body }) })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) setError(j.error || 'Something went wrong'); else { setNotice(j.message); load(month) }
  }

  const run = v?.run
  const closed = run?.status === 'closed'
  const card = 'rounded-2xl border border-neutral-200 bg-white'
  const th = 'px-md py-sm text-left text-xs font-bold text-white'
  const allStatements = v?.payments.flatMap(p => p.statements.map(s => ({ ...s, landlord: p.landlord }))) ?? []
  const expenseRows = allStatements.flatMap(s => s.expenseLines.map(e => ({ statement: s.reference, property: s.property, landlord: s.landlord, number: e.number ?? '', description: e.description, amount: e.amount })))
  const feeRows = allStatements.filter(s => s.managementFee || s.lettingFee).map(s => ({ statement: s.reference, property: s.property, landlord: s.landlord, feeNo: s.feeNo ?? '', managementFee: s.managementFee, lettingFee: s.lettingFee, total: Math.round((s.managementFee + s.lettingFee) * 100) / 100 }))
  const payRows = (v?.payments ?? []).map(p => ({ landlord: p.landlord, statements: p.statements.map(s => s.reference).join(', '), properties: [...new Set(p.statements.map(s => s.property))].join(', '),
    account: p.bank ? `${p.bank.name} · ${sort(p.bank.sortCode)} · ${p.bank.accountNo}` : 'No bank details', amount: p.amount, status: p.paid ? `Paid ${ukDate(p.paidDate)}` : 'To pay', payout: p.statements.map(s => s.payoutNo).filter(Boolean).join(', ') }))

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Payment run" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-md flex flex-wrap items-start justify-between gap-md">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Payment run {run ? <span className="font-mono text-lg text-neutral-500">{run.runNo}</span> : null}</h1>
            <p className="mt-xs text-sm text-neutral-500">Step 3: pay landlords, then move our fees and the expenses we paid out to the office account. Statements come from the <Link href={`/admin/rent-roll?month=${month}`} className="font-semibold text-neutral-900 underline">rent roll</Link>.</p>
          </div>
          <div className="flex items-center gap-sm">
            <button onClick={() => go(shift(month, -1))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" aria-label="Previous month">‹</button>
            <input type="month" value={month} onChange={e => e.target.value && go(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900" />
            <button onClick={() => go(shift(month, 1))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" aria-label="Next month">›</button>
          </div>
        </div>

        {notice && <p className="mb-md rounded-xl border border-green-200 bg-green-50 px-lg py-md text-sm font-semibold text-green-800">{notice}</p>}
        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}
        {!v && !error && <p className="text-sm text-neutral-500">Loading…</p>}

        {v && (
          <>
            {/* status + waiting statements */}
            <div className={`${card} mb-md flex flex-wrap items-center gap-md px-lg py-md`}>
              {run
                ? <span className={`rounded-full px-md py-xs text-xs font-bold ${closed ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{closed ? `Closed ${ukDate(run.closedAt)}` : 'Open'}</span>
                : <span className="rounded-full bg-neutral-100 px-md py-xs text-xs font-bold text-neutral-700">Not started</span>}
              <span className="text-sm text-neutral-600">
                {v.waiting.filter(w => w.state === 'approved').length} approved statement{v.waiting.filter(w => w.state === 'approved').length === 1 ? '' : 's'} waiting ·{' '}
                {v.waiting.filter(w => w.state === 'draft').length} still to approve
              </span>
              <span className="ml-auto flex gap-sm">
                {!run && <button disabled={!!busy || !v.waiting.some(w => w.state === 'approved')} onClick={() => act({ action: 'open' })} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">Start payment run</button>}
                {run && !closed && v.waiting.some(w => w.state === 'approved') && <button disabled={!!busy} onClick={() => act({ action: 'add_ready' })} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold">Add newly approved</button>}
                {run && !closed && <button disabled={!!busy || !v.canClose} onClick={() => act({ action: 'close' }, `Close ${run.runNo}? Everything is paid and transferred.`)} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">Close run</button>}
              </span>
              {v.waiting.length > 0 && (
                <p className="w-full text-xs text-neutral-500">Waiting: {v.waiting.map(w => `${w.reference} ${w.property} (${w.state === 'draft' ? 'needs approving' : 'approved'})`).join(' · ')}</p>
              )}
            </div>

            {run && (
              <>
                <div className="mb-md grid grid-cols-2 gap-sm md:grid-cols-4">
                  {[['Rent on statements', v.totals.rent], ['To landlords', v.totals.toLandlords], ['Our fees', v.totals.fees], ['Expenses back to office', v.totals.expenses]].map(([l, n]) => (
                    <div key={l as string} className="rounded-xl bg-white px-md py-sm"><p className="text-xs text-neutral-500">{l}</p><p className="text-xl font-bold tabular-nums text-neutral-900">{gbp(n as number)}</p></div>
                  ))}
                </div>
                <ul className="mb-lg space-y-xs">
                  {v.checks.map((c, i) => <li key={i} className={`text-sm ${c.ok ? 'text-green-800' : 'font-semibold text-red-700'}`}>{c.ok ? '✓' : '✗'} {c.message}</li>)}
                </ul>

                {/* 1. landlords */}
                <section className="mb-lg">
                  <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
                    <h2 className="text-lg font-bold text-neutral-900">1 · Pay landlords <span className="text-sm font-normal text-neutral-500">{gbp(v.totals.paidToLandlords)} of {gbp(v.totals.toLandlords)} paid</span></h2>
                    <div className="flex flex-wrap items-center gap-sm">
                      {!closed && v.payments.some(p => !p.paid) && <button onClick={() => downloadPdf(`/api/admin/payment-run?month=${month}&export=bank`, `Landlord payments ${run.runNo}.csv`)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white">Bank payment file</button>}
                      <ExportButtons title={`Landlord payments ${run.runNo}`} subtitle={monthLabel(month)} filename={`landlord-payments-${run.runNo}`}
                        columns={[{ key: 'landlord', label: 'Landlord' }, { key: 'properties', label: 'Properties' }, { key: 'statements', label: 'Statements' }, { key: 'account', label: 'Account' }, { key: 'amount', label: 'Amount', money: true }, { key: 'status', label: 'Status' }, { key: 'payout', label: 'Payment no.' }]}
                        rows={payRows} totals={{ landlord: 'Total', amount: v.totals.toLandlords }} />
                    </div>
                  </div>
                  {!closed && <label className="mb-sm flex items-center gap-sm text-xs text-neutral-600">Date paid <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="rounded-md border border-neutral-300 bg-white px-sm py-0.5 text-xs" /></label>}
                  <div className={`${card} overflow-x-auto`}>
                    <table className="min-w-full text-sm">
                      <thead className="bg-neutral-900"><tr><th className={th}>Landlord</th><th className={th}>Pay to</th><th className={`${th} text-right`}>Held for them</th><th className={`${th} text-right`}>Amount</th><th className={th}></th></tr></thead>
                      <tbody>
                        {v.payments.map(p => [
                          <tr key={p.key} className="border-t border-neutral-200">
                            <td className="px-md py-sm"><button onClick={() => setOpen({ ...open, [p.key]: !open[p.key] })} className="font-semibold text-neutral-900">{open[p.key] ? '▾' : '▸'} {p.landlord}</button><span className="ml-sm text-xs text-neutral-500">{p.statements.length} statement{p.statements.length === 1 ? '' : 's'}</span></td>
                            <td className="px-md py-sm font-mono text-xs">{p.bank ? `${p.bank.name} · ${sort(p.bank.sortCode)} · ${p.bank.accountNo}` : <span className="font-sans font-semibold text-red-700">No bank details</span>}</td>
                            <td className="px-md py-sm text-right tabular-nums text-neutral-500">{gbp(p.held)}</td>
                            <td className="px-md py-sm text-right font-semibold tabular-nums">{gbp(p.amount)}</td>
                            <td className="px-md py-sm text-right">{p.paid
                              ? <span className="rounded-full bg-green-100 px-sm py-0.5 text-xs font-semibold text-green-800">Paid {ukDate(p.paidDate)}</span>
                              : !closed && <button disabled={!!busy} onClick={() => act({ action: 'pay', key: p.key, paidDate: payDate }, `Record ${gbp(p.amount)} paid to ${p.landlord} on ${ukDate(payDate)}? Do this after the bank payment has gone.`)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-50">Mark paid</button>}</td>
                          </tr>,
                          ...(open[p.key] ? p.statements.map(s => (
                            <tr key={s.id} className="border-t border-neutral-100 bg-neutral-50 text-xs">
                              <td className="px-md py-xs pl-xl"><span className="font-mono font-semibold">{s.reference}</span> · {s.property}{s.payoutNo ? <span className="ml-sm font-mono text-neutral-500">{s.payoutNo}</span> : null}</td>
                              <td className="px-md py-xs text-neutral-600">rent {gbp(s.rent)} − fees {gbp(s.managementFee + s.lettingFee)} − expenses {gbp(s.expenses)}</td>
                              <td></td><td className="px-md py-xs text-right tabular-nums">{gbp(s.net)}</td>
                              <td className="px-md py-xs text-right">{s.balances ? <span className="text-green-700">✓ balances</span> : <span className="font-semibold text-red-700">✗ doesn’t balance</span>}</td>
                            </tr>
                          )) : []),
                        ])}
                        {!v.payments.length && <tr><td colSpan={5} className="px-md py-lg text-center text-sm text-neutral-500">No statements in this run.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 2 + 3: transfers */}
                {([['expenses', '2 · Expenses back to the office account', expenseRows], ['fees', '3 · Our fees to the office account', feeRows]] as const).map(([kind, title, rows]) => {
                  const t = v.transfers.find(x => x.kind === kind)!
                  return (
                    <section key={kind} className="mb-lg">
                      <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
                        <h2 className="text-lg font-bold text-neutral-900">{title} <span className="text-sm font-normal text-neutral-500">{gbp(t.expected)}</span></h2>
                        {kind === 'expenses'
                          ? <ExportButtons title={`Expenses to reimburse ${run.runNo}`} subtitle={monthLabel(month)} filename={`expenses-${run.runNo}`} columns={[{ key: 'number', label: 'No.' }, { key: 'statement', label: 'Statement' }, { key: 'property', label: 'Property' }, { key: 'landlord', label: 'Landlord' }, { key: 'description', label: 'What for' }, { key: 'amount', label: 'Amount', money: true }]} rows={rows as any[]} totals={{ description: 'Total', amount: t.expected }} />
                          : <ExportButtons title={`Fees ${run.runNo}`} subtitle={monthLabel(month)} filename={`fees-${run.runNo}`} columns={[{ key: 'feeNo', label: 'Fee no.' }, { key: 'statement', label: 'Statement' }, { key: 'property', label: 'Property' }, { key: 'landlord', label: 'Landlord' }, { key: 'managementFee', label: 'Management', money: true }, { key: 'lettingFee', label: 'Letting', money: true }, { key: 'total', label: 'Total', money: true }]} rows={rows as any[]} totals={{ statement: 'Total', managementFee: v.totals.managementFees, lettingFee: v.totals.lettingFees, total: t.expected }} />}
                      </div>
                      <div className={`${card} overflow-x-auto`}>
                        <table className="min-w-full text-sm">
                          <thead className="bg-neutral-900"><tr>{kind === 'expenses'
                            ? <><th className={th}>No.</th><th className={th}>Statement · property</th><th className={th}>What for</th><th className={`${th} text-right`}>Amount</th></>
                            : <><th className={th}>Fee no.</th><th className={th}>Statement · property</th><th className={`${th} text-right`}>Management</th><th className={`${th} text-right`}>Letting</th></>}</tr></thead>
                          <tbody className="divide-y divide-neutral-100">
                            {kind === 'expenses'
                              ? (rows as typeof expenseRows).map((e, i) => <tr key={i}><td className="px-md py-xs font-mono text-xs">{e.number}</td><td className="px-md py-xs text-xs">{e.statement} · {e.property}</td><td className="px-md py-xs">{e.description}</td><td className="px-md py-xs text-right tabular-nums">{gbp(e.amount)}</td></tr>)
                              : (rows as typeof feeRows).map((f, i) => <tr key={i}><td className="px-md py-xs font-mono text-xs">{f.feeNo}</td><td className="px-md py-xs text-xs">{f.statement} · {f.property}</td><td className="px-md py-xs text-right tabular-nums">{gbp(f.managementFee)}</td><td className="px-md py-xs text-right tabular-nums">{gbp(f.lettingFee)}</td></tr>)}
                            {!rows.length && <tr><td colSpan={4} className="px-md py-sm text-sm text-neutral-500">Nothing this run.</td></tr>}
                          </tbody>
                        </table>
                        <div className="flex flex-wrap items-center gap-md border-t border-neutral-200 px-md py-sm">
                          {t.recorded
                            ? <span className="text-sm text-green-800">✓ Transferred <span className="font-mono">{t.recorded.number}</span> · {gbp(t.recorded.amount)} on {ukDate(t.recorded.date)}{t.recorded.reference ? ` · ref ${t.recorded.reference}` : ''}
                                {!closed && <button onClick={() => { const reason = window.prompt('Why void this transfer? It stays on record.'); if (reason) act({ action: 'void_transfer', id: t.recorded!.id, reason }) }} className="ml-md text-xs text-neutral-500 underline">Void</button>}</span>
                            : t.expected > 0 && !closed
                              ? <button disabled={!!busy || v.payments.some(p => !p.paid)} onClick={() => { const reference = window.prompt(`Record moving ${gbp(t.expected)} from the client account to the office account.\n\nBank reference (optional):`, `${run.runNo} ${kind}`); if (reference !== null) act({ action: 'transfer', kind, date: payDate, reference }) }}
                                  className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:bg-neutral-300">Record transfer of {gbp(t.expected)}</button>
                              : <span className="text-sm text-neutral-500">Nothing to transfer.</span>}
                          {!t.recorded && t.expected > 0 && v.payments.some(p => !p.paid) && <span className="text-xs text-neutral-500">Pay the landlords first — client money goes to landlords before it leaves the account.</span>}
                        </div>
                      </div>
                    </section>
                  )
                })}
              </>
            )}
            {!run && !v.waiting.length && <div className={`${card} px-lg py-xl text-center text-sm text-neutral-600`}>No statements to pay for {monthLabel(month)} yet. Prepare them from the <Link href={`/admin/rent-roll?month=${month}`} className="underline">rent roll</Link>.</div>}
          </>
        )}
      </div>
    </div>
  )
}

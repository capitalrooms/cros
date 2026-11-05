'use client'

// Client money: what the client account holds for each landlord, the monthly three-way reconciliation,
// opening balances / corrections, and the ledger export for the accountant.
import { Fragment, useCallback, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { financeTabs, clientMoneyTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'
import ExportButtons from '@/app/components/ExportButtons'
import type { ClientAccountPosition } from '@/lib/finance/clientAccount'

interface Balance { landlordId: string | null; name: string; in: number; out: number; balance: number; entries: number }
interface Entry { date: string; kind: string; description: string; amount: number; balance: number; reference: string | null; source: string; sourceId: string }
interface Recon { id: string; as_at: string; bank_balance: number; cashbook_balance: number; ledgers_total: number; difference: number; notes: string | null; signed_at: string }
interface Period { month: string; status: 'closed' | 'reopened'; closed_at: string | null; reopened_at: string | null; reopen_reason: string | null }
interface Data { position: ClientAccountPosition; periods: Period[]; start: string; asAt: string; cashbook: number; ledgersTotal: number; balances: Balance[]; negative: number; reconciliations: Recon[]; landlords: { id: string; name: string }[]; setupNeeded: string | null }

const gbp = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const d = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const input = 'mt-xs w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'
const KINDS: [string, string][] = [['opening_balance', 'Opening balance'], ['correction', 'Correction'], ['rent_other', 'Other money in'], ['payout', 'Paid to landlord'], ['fee', 'Fee']]

export default function ClientMoneyPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [rec, setRec] = useState({ asAt: today(), bankBalance: '', notes: '' })
  const [adj, setAdj] = useState({ landlordId: '', entryDate: today(), kind: 'opening_balance', description: '', amount: '', reference: '' })
  const [exp, setExp] = useState({ from: '', to: today() })
  const [busy, setBusy] = useState('')
  const [closeMonth, setCloseMonth] = useState(new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 7))

  const load = useCallback(async () => {
    try {
      const r = await adminFetch('/api/admin/client-money')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not load client money')
      setData(j); setExp(e => ({ ...e, from: e.from || j.start }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load client money') }
  }, [])
  useEffect(() => { load() }, [load])

  async function toggle(b: Balance) {
    const key = b.landlordId ?? 'none'
    if (open === key) { setOpen(null); return }
    setOpen(key); setEntries(null)
    const r = await adminFetch(`/api/admin/client-money?landlordId=${key}`)
    const j = await r.json().catch(() => ({}))
    setEntries(r.ok ? j.entries : [])
  }

  async function post(action: string, body: Record<string, unknown>, done: string) {
    setBusy(action); setError(''); setNotice('')
    try {
      const r = await adminFetch('/api/admin/client-money', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not save')
      setNotice(action === 'reconcile' ? `Reconciliation signed off — difference ${gbp(j.difference)}.` : done)
      if (action === 'reconcile') setRec(x => ({ ...x, bankBalance: '', notes: '' }))
      if (action === 'adjust') setAdj(x => ({ ...x, description: '', amount: '', reference: '' }))
      setOpen(null); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy('') }
  }

  const bankNum = Number(rec.bankBalance.replace(/[£,\s]/g, ''))
  const diff = data && rec.bankBalance.trim() && isFinite(bankNum) ? Math.round((bankNum - data.position.cashbook.total) * 100) / 100 : null

  return (
    <div className="min-h-screen fin">
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} title="Client money" />
      <PageHero look="olive" title="Client money" subtitle={<>Client account 20-18-93 · 4016 2574 — funds held on behalf of landlords, tenants and applicants{data ? ` since ${d(data.start)}` : ''}. No client ledger may be overdrawn.</>}
        tabs={clientMoneyTabs('client')} />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {data?.setupNeeded && <p className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">{data.setupNeeded}</p>}
        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-xl bg-green-50 px-md py-sm text-sm text-green-800">{notice}</p>}
        {!data ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <>
            <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
              {[
                ['Cash book balance', gbp(data.position.cashbook.total), 'Must agree with the bank statement'],
                ['Client ledger balances', gbp(data.ledgersTotal), `${data.balances.length} landlord ledgers`],
                ['Overdrawn ledgers', String(data.negative), data.negative ? 'Correct before any payment' : 'None'],
                ['Last reconciliation', data.reconciliations[0] ? d(data.reconciliations[0].as_at) : 'None yet', data.reconciliations[0] ? `Difference ${gbp(data.reconciliations[0].difference)}` : 'Required monthly'],
              ].map(([k, v, n], i) => (
                <div key={k} className="rounded-2xl border border-neutral-200 bg-white px-lg py-md">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">{k}</p>
                  <p className={`mt-xs text-2xl font-bold tabular-nums ${i === 2 && data.negative ? 'text-red-700' : 'text-neutral-900'}`}>{v}</p>
                  <p className="mt-xs text-xs text-neutral-400">{n}</p>
                </div>
              ))}
            </div>

            <section className="rounded-2xl bg-white p-lg">
              <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
                <div>
                  <h2 className="font-bold text-neutral-900">Analysis of client funds</h2>
                  <p className="text-xs text-neutral-500">Every balance attributed to a client. The analysis must agree with the cash book, and the cash book with the bank statement (three-way reconciliation).</p>
                </div>
                <ExportButtons title="Analysis of client funds" subtitle={`As at ${d(data.position.asAt)}`} filename={`client-account-${data.position.asAt}`}
                  columns={[{ key: 'label', label: 'Fund' }, { key: 'amount', label: 'Balance', money: true }]}
                  rows={data.position.breakdown.map(b => ({ label: b.label, amount: b.amount }))} totals={{ label: 'Total client funds', amount: data.position.breakdownTotal }} />
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {data.position.breakdown.map(b => (
                    <tr key={b.key}><td className="py-sm text-neutral-800">{b.label}{b.detail && b.amount ? <span className="ml-sm text-xs text-amber-700">{b.detail}</span> : null}</td><td className="py-sm text-right tabular-nums font-semibold">{gbp(b.amount)}</td></tr>
                  ))}
                  <tr className="border-t-2 border-neutral-900"><td className="py-sm font-bold">Total client funds</td><td className="py-sm text-right font-bold tabular-nums">{gbp(data.position.breakdownTotal)}</td></tr>
                  <tr><td className="py-xs text-xs text-neutral-500">Cash book: rent in {gbp(data.position.cashbook.rentIn)} + unmatched in {gbp(data.position.cashbook.suspenseIn)}{data.position.cashbook.holdingIn ? <> + holding deposits {gbp(data.position.cashbook.holdingIn)}</> : null} + adjustments {gbp(data.position.cashbook.adjustments)} − paid to landlords {gbp(data.position.cashbook.paidToLandlords)} − moved to the office {gbp(data.position.cashbook.toOffice)}</td>
                    <td className={`py-xs text-right text-xs font-semibold ${data.position.agrees ? 'text-green-700' : 'text-red-700'}`}>{data.position.agrees ? '✓ agrees' : '✗ doesn’t agree — tell support'}</td></tr>
                </tbody>
              </table>
            </section>

            {data.negative > 0 && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-900">
                {data.negative} landlord ledger{data.negative === 1 ? ' is' : 's are'} below zero. Either rent received hasn’t been recorded in CROS, an opening balance is missing, or more was paid out than was held. Open the ledger to see which.
              </p>
            )}

            <div className="flex justify-end">
              <ExportButtons title="Client ledger balances" subtitle={`As at ${d(data.position.asAt)}`} filename={`client-money-landlords-${data.position.asAt}`}
                columns={[{ key: 'name', label: 'Landlord' }, { key: 'awaitingStatement', label: 'Awaiting statement', money: true }, { key: 'awaitingPayment', label: 'Payment due', money: true }, { key: 'advance', label: 'Rent in advance', money: true }, { key: 'float', label: 'Float', money: true }, { key: 'balance', label: 'Ledger balance', money: true }]}
                rows={data.position.landlords as any[]} totals={{ name: 'Total', balance: data.position.landlords.reduce((t, l) => t + l.balance, 0) }} />
            </div>
            <section className="overflow-x-auto rounded-2xl bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-lg py-sm">Landlord</th><th className="px-lg py-sm text-right">Receipts</th><th className="px-lg py-sm text-right">Payments</th><th className="px-lg py-sm text-right">Balance</th>
                </tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.balances.length === 0 && <tr><td colSpan={4} className="px-lg py-lg text-neutral-500">Nothing recorded since {d(data.start)} yet. Rent received, statements and payouts appear here as they happen.</td></tr>}
                  {data.balances.map(b => {
                    const key = b.landlordId ?? 'none'
                    return (
                      <Fragment key={key}>
                        <tr className="cursor-pointer hover:bg-neutral-50" onClick={() => toggle(b)}>
                          <td className="px-lg py-sm font-semibold text-neutral-900">{b.name} <span className="font-normal text-neutral-400">· {b.entries} entries</span></td>
                          <td className="px-lg py-sm text-right tabular-nums">{gbp(b.in)}</td>
                          <td className="px-lg py-sm text-right tabular-nums">{gbp(-b.out)}</td>
                          <td className={`px-lg py-sm text-right font-bold tabular-nums ${b.balance < -0.005 ? 'text-red-700' : 'text-neutral-900'}`}>{gbp(b.balance)}</td>
                        </tr>
                        {open === key && (
                          <tr><td colSpan={4} className="bg-neutral-50 px-lg py-md">
                            {!entries ? <p className="text-xs text-neutral-400">Loading ledger…</p> : (
                              <table className="w-full text-xs">
                                <tbody className="divide-y divide-neutral-200">
                                  {entries.map((e, i) => (
                                    <tr key={i}>
                                      <td className="py-1 pr-md whitespace-nowrap text-neutral-500">{d(e.date)}</td>
                                      <td className="py-1 pr-md text-neutral-800">{e.description}</td>
                                      <td className={`py-1 pr-md text-right tabular-nums ${e.amount < 0 ? 'text-neutral-700' : 'text-emerald-700'}`}>{gbp(e.amount)}</td>
                                      <td className={`py-1 text-right tabular-nums font-semibold ${e.balance < -0.005 ? 'text-red-700' : ''}`}>{gbp(e.balance)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td></tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </section>

            <div className="grid gap-lg lg:grid-cols-2">
              <section className="rounded-2xl bg-white p-lg space-y-sm">
                <h2 className="font-bold text-neutral-900">Three-way reconciliation</h2>
                <p className="text-xs text-neutral-500">Enter the closing balance from the client account bank statement. CROS agrees it to the cash book and the client ledgers. Sign off monthly and record an explanation for any difference.</p>
                <div className="grid grid-cols-2 gap-sm">
                  <label className="text-xs font-semibold text-neutral-700">Balance as at<input type="date" className={input} value={rec.asAt} onChange={e => setRec({ ...rec, asAt: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-neutral-700">Bank statement balance (£)<input inputMode="decimal" className={input} value={rec.bankBalance} onChange={e => setRec({ ...rec, bankBalance: e.target.value })} /></label>
                </div>
                {diff != null && <p className={`rounded-lg px-md py-sm text-sm ${Math.abs(diff) < 0.005 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>Cash book {gbp(data.position.cashbook.total)} · bank {gbp(bankNum)} · difference <strong>{gbp(diff)}</strong>{Math.abs(diff) < 0.005 ? ' — balanced' : ' — explain it in the notes (e.g. rent not yet recorded, deposits held)'}</p>}
                <label className="block text-xs font-semibold text-neutral-700">Notes<textarea rows={2} className={input} value={rec.notes} onChange={e => setRec({ ...rec, notes: e.target.value })} /></label>
                <button disabled={!!busy} onClick={() => post('reconcile', rec, '')} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'reconcile' ? 'Saving…' : 'Sign off reconciliation'}</button>
                <div className="mt-md rounded-lg border border-neutral-200 p-md">
                  <p className="text-sm font-semibold text-neutral-900">Month-end close</p>
                  <p className="text-xs text-neutral-500">Once the reconciliation shows no difference, close the month so nothing more can be posted to it. Corrections go in the next open month, or reopen it with a recorded reason.</p>
                  <div className="mt-sm flex flex-wrap items-center gap-sm">
                    <input type="month" value={closeMonth} onChange={e => setCloseMonth(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-md py-xs text-sm" />
                    <button disabled={!!busy} onClick={() => post('close_month', { month: closeMonth }, `${closeMonth} closed.`)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:bg-neutral-300">Close month</button>
                  </div>
                  {data.periods.length > 0 && (
                    <ul className="mt-sm space-y-xs text-xs text-neutral-700">
                      {data.periods.map(p => (
                        <li key={p.month} className="flex flex-wrap items-center gap-sm">
                          <span className="font-semibold">{new Date(p.month + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
                          {p.status === 'closed' ? <span className="text-green-700">closed {p.closed_at ? d(p.closed_at.slice(0, 10)) : ''}</span> : <span className="text-amber-700">reopened — {p.reopen_reason}</span>}
                          {p.status === 'closed' && <button onClick={() => { const reason = window.prompt('Why reopen this month? (recorded)'); if (reason) post('reopen_month', { month: p.month.slice(0, 7), reason }, 'Reopened.') }} className="underline text-neutral-500">Reopen</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {data.reconciliations.length > 0 && (
                  <ul className="mt-sm divide-y divide-neutral-100 text-xs">
                    {data.reconciliations.map(r => (
                      <li key={r.id} className="py-1.5">
                        <span className="font-semibold">{d(r.as_at)}</span> · bank {gbp(r.bank_balance)} · cash book {gbp(r.cashbook_balance)} · <span className={Math.abs(r.difference) < 0.005 ? 'text-green-700' : 'text-amber-800'}>difference {gbp(r.difference)}</span>
                        {r.notes && <span className="block text-neutral-500">{r.notes}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl bg-white p-lg space-y-sm">
                <h2 className="font-bold text-neutral-900">Opening balance or correction</h2>
                <p className="text-xs text-neutral-500">For money held before {d(data.start)}, or anything not recorded elsewhere. Use a minus for money out. Every entry is logged; mistakes are voided, never deleted.</p>
                <label className="block text-xs font-semibold text-neutral-700">Landlord
                  <select className={input} value={adj.landlordId} onChange={e => setAdj({ ...adj, landlordId: e.target.value })}>
                    <option value="">— choose —</option>
                    {data.landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-sm">
                  <label className="text-xs font-semibold text-neutral-700">Type<select className={input} value={adj.kind} onChange={e => setAdj({ ...adj, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="text-xs font-semibold text-neutral-700">Date<input type="date" className={input} value={adj.entryDate} onChange={e => setAdj({ ...adj, entryDate: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-neutral-700">Amount (£)<input inputMode="decimal" className={input} value={adj.amount} onChange={e => setAdj({ ...adj, amount: e.target.value })} placeholder="e.g. 1250 or -300" /></label>
                  <label className="text-xs font-semibold text-neutral-700">Reference<input className={input} value={adj.reference} onChange={e => setAdj({ ...adj, reference: e.target.value })} /></label>
                </div>
                <label className="block text-xs font-semibold text-neutral-700">What it is<input className={input} value={adj.description} onChange={e => setAdj({ ...adj, description: e.target.value })} placeholder="e.g. Balance held at 30 Sept 2026" /></label>
                <button disabled={!!busy || !adj.landlordId} onClick={() => post('adjust', adj, 'Entry added to the ledger.')} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'adjust' ? 'Saving…' : 'Add to ledger'}</button>
              </section>
            </div>

            <section className="flex flex-wrap items-end gap-sm rounded-2xl bg-white p-lg">
              <div className="mr-auto">
                <h2 className="font-bold text-neutral-900">Export for the accountant</h2>
                <p className="text-xs text-neutral-500">Every ledger movement as a spreadsheet (CSV) — for 10ninety.</p>
              </div>
              <label className="text-xs font-semibold text-neutral-700">From<input type="date" className={input} value={exp.from} onChange={e => setExp({ ...exp, from: e.target.value })} /></label>
              <label className="text-xs font-semibold text-neutral-700">To<input type="date" className={input} value={exp.to} onChange={e => setExp({ ...exp, to: e.target.value })} /></label>
              <button onClick={() => downloadPdf(`/api/admin/client-money?export=csv&from=${exp.from}&to=${exp.to}`, `Client ledger ${exp.from} to ${exp.to}.csv`)} className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-bold text-neutral-800">Download CSV</button>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

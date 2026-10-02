'use client'

// Arrears tracker — who owes rent, how much, since when, and whether it has reached the 3-month threshold.
import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { financeTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'
import type { ArrearsRow } from '@/app/api/admin/arrears/route'

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const mon = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

const ACTION_LABEL: Record<string, string> = {
  call: 'Phone call', text: 'Text message', reminder: 'Reminder email', letter: 'Arrears letter', promise: 'Promise to pay',
  payment_plan: 'Payment plan agreed', legal: 'Legal step', note: 'Note',
}

const LEVEL: Record<ArrearsRow['level'], { label: string; chip: string; bar: string }> = {
  legal: { label: '3+ months', chip: 'bg-red-100 text-red-800', bar: 'bg-red-600' },
  approaching: { label: '2+ months', chip: 'bg-amber-100 text-amber-900', bar: 'bg-amber-500' },
  watch: { label: 'Under 2 months', chip: 'bg-neutral-100 text-neutral-600', bar: 'bg-neutral-400' },
}

export default function ArrearsPage() {
  const [rows, setRows] = useState<ArrearsRow[] | null>(null)
  const [totals, setTotals] = useState({ owed: 0, tenants: 0, legal: 0, approaching: 0 })
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState({ action: 'call', note: '', promisedAmount: '', promisedDate: '' })
  const [contactReady, setContactReady] = useState(true)

  useEffect(() => {
    adminFetch('/api/admin/arrears')
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load arrears'); setRows(d.rows); setTotals(d.totals); setContactReady(d.contactLogReady !== false) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load arrears'))
  }, [reload])

  async function saveLog(r: ArrearsRow) {
    if (!r.tenancyId) return setError('This charge has no tenancy on record, so contact can’t be logged against it.')
    setBusy('log:' + r.key); setError('')
    try {
      const res = await adminFetch('/api/admin/arrears/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenancyId: r.tenancyId, ...log }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save')
      setLog({ action: 'call', note: '', promisedAmount: '', promisedDate: '' }); setReload(n => n + 1)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy('') }
  }

  async function letter(r: ArrearsRow) {
    setBusy(r.key)
    try {
      await downloadPdf(`/api/admin/arrears-letter?rent_charge_id=${r.latestChargeId}`, `Arrears letter ${r.tenant}.pdf`)
      // the letter is a contact — log it (quietly skipped before migration 189)
      if (r.tenancyId) adminFetch('/api/admin/arrears/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenancyId: r.tenancyId, action: 'letter', note: `Arrears letter for ${gbp(r.owed)}` }) }).then(() => setReload(n => n + 1)).catch(() => {})
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not build the letter') }
    finally { setBusy('') }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/rent-charges" />} title="Arrears" />
      <PageHero title="Arrears" subtitle="Rent overdue or part paid, by tenancy — “in arrears since” is the due date of the oldest unpaid rent"
        stats={[
          { label: `Owed · ${totals.tenants} tenanc${totals.tenants === 1 ? 'y' : 'ies'}`, value: gbp(totals.owed), tone: totals.owed > 0 ? 'bad' : undefined },
          { label: '3+ months (Ground 8)', value: totals.legal, tone: totals.legal ? 'bad' : undefined },
          { label: '2+ months — act now', value: totals.approaching, tone: totals.approaching ? 'warn' : undefined },
          { label: 'Under 2 months', value: totals.tenants - totals.legal - totals.approaching },
        ]}
        tabs={financeTabs('arrears')} />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {totals.legal > 0 && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-900">
            {totals.legal} tenanc{totals.legal === 1 ? 'y owes' : 'ies owe'} at least three months’ rent — the level at which Ground 8 possession can be sought.
            The arrears must still be at that level when the notice is served and at the hearing. Take advice before serving notice.
          </p>
        )}

        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {!rows && !error && <p className="text-sm text-neutral-400">Loading arrears…</p>}
        {rows && rows.length === 0 && <p className="rounded-xl bg-white px-lg py-lg text-sm text-neutral-600">Nobody is in arrears. Charges become overdue five days after the due date.</p>}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-lg py-sm font-semibold">Tenant</th>
                  <th className="px-lg py-sm font-semibold text-right">Owed</th>
                  <th className="px-lg py-sm font-semibold">Months’ rent</th>
                  <th className="px-lg py-sm font-semibold">In arrears since</th>
                  <th className="px-lg py-sm font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(r => {
                  const L = LEVEL[r.level]
                  return (
                    <Fragment key={r.key}>
                      <tr className="align-top">
                        <td className="px-lg py-md">
                          <button onClick={() => setOpen(open === r.key ? null : r.key)} className="text-left">
                            <span className="font-semibold text-neutral-900">{r.tenant}</span>
                            {r.onNotice && <span className="ml-sm rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-500">On notice</span>}
                            <span className="block text-xs text-neutral-500">{[r.room, r.property].filter(Boolean).join(', ')} · rent {gbp(r.monthlyRent)}</span>
                          </button>
                        </td>
                        <td className="px-lg py-md text-right font-bold tabular-nums text-neutral-900">{gbp(r.owed)}</td>
                        <td className="px-lg py-md">
                          <div className="flex items-center gap-sm">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full ${L.bar}`} style={{ width: `${Math.min(100, (r.monthsOwed / 3) * 100)}%` }} /></div>
                            <span className="tabular-nums text-neutral-700">{r.monthsOwed.toFixed(1)}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${L.chip}`}>{L.label}</span>
                          </div>
                        </td>
                        <td className="px-lg py-md text-neutral-700">
                          <span className="whitespace-nowrap">{day(r.since)} <span className="text-neutral-400">· {r.days} days</span></span>
                          {r.nextStep && <span className="block text-xs font-semibold text-neutral-900">Next: {r.nextStep}</span>}
                          <span className="block text-xs text-neutral-500">{r.lastAction ? `Last contact: ${ACTION_LABEL[r.lastAction.action] || r.lastAction.action} ${new Date(r.lastAction.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'No contact logged'}</span>
                        </td>
                        <td className="px-lg py-md">
                          <div className="flex flex-wrap justify-end gap-sm">
                            <button disabled={busy === r.key} onClick={() => letter(r)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-40 whitespace-nowrap">{busy === r.key ? 'Building…' : 'Arrears letter'}</button>
                            {r.tenancyId && <button onClick={() => downloadPdf(`/api/admin/tenancies/${r.tenancyId}/statement-of-account`, `Statement of account ${r.tenant}.pdf`).catch(e => alert(e.message))} className="rounded-lg border border-neutral-300 bg-white px-md py-xs text-xs font-bold text-neutral-800 whitespace-nowrap">Statement of account</button>}
                            {r.tenancyId && <Link href={`/admin/lettings/${r.tenancyId}?tab=money&from=/admin/arrears`} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold text-neutral-800">Letting file</Link>}
                            {r.personId && <Link href={`/admin/tenant/${r.personId}`} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold text-neutral-800">Tenant</Link>}
                            {r.phone && <a href={`tel:${r.phone}`} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold text-neutral-800">Call</a>}
                          </div>
                        </td>
                      </tr>
                      {open === r.key && (
                        <tr className="bg-neutral-50">
                          <td colSpan={5} className="px-lg py-md">
                            <p className="mb-xs text-xs font-bold uppercase tracking-wide text-neutral-500">Unpaid charges</p>
                            <ul className="space-y-xs text-sm">
                              {r.charges.map(c => (
                                <li key={c.id} className="flex justify-between gap-md">
                                  <span>{mon(c.month)} rent · {c.status === 'partial' ? `part paid (${gbp(c.received)} of ${gbp(c.due)})` : 'unpaid'}</span>
                                  <span className="font-semibold tabular-nums">{gbp(c.due - c.received)}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-md rounded-xl bg-white p-md">
                              <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Log contact</p>
                              {!contactReady && <p className="mt-xs text-xs text-amber-800">Run migration 189 in Supabase to switch on the contact log.</p>}
                              {r.lastAction && <p className="mt-xs text-xs text-neutral-600">Last: {ACTION_LABEL[r.lastAction.action]}{r.lastAction.note ? ` — ${r.lastAction.note}` : ''}{r.lastAction.promisedAmount ? ` · promised ${gbp(r.lastAction.promisedAmount)}${r.lastAction.promisedDate ? ` by ${day(r.lastAction.promisedDate)}` : ''}` : ''}</p>}
                              <div className="mt-sm grid gap-sm sm:grid-cols-[10rem_1fr_7rem_9rem_auto]">
                                <select value={log.action} onChange={e => setLog({ ...log, action: e.target.value })} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm">
                                  {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                <input value={log.note} onChange={e => setLog({ ...log, note: e.target.value })} placeholder="What was said or sent" className="rounded-lg border border-neutral-300 px-sm py-xs text-sm" />
                                <input value={log.promisedAmount} onChange={e => setLog({ ...log, promisedAmount: e.target.value })} placeholder="Promised £" inputMode="decimal" className="rounded-lg border border-neutral-300 px-sm py-xs text-sm" />
                                <input type="date" value={log.promisedDate} onChange={e => setLog({ ...log, promisedDate: e.target.value })} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm" />
                                <button disabled={busy === 'log:' + r.key} onClick={() => saveLog(r)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-40">Save</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

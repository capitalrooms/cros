'use client'

// Deposits: protected within 30 days, prescribed information served, never over 5 weeks' rent.
import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

interface Row {
  tenancyId: string; tenant: string; room: string; property: string; startDate: string | null; rent: number; deposit: number; cap: number; overCap: boolean
  scheme: string | null; schemeRef: string | null; protectedAt: string | null; prescribedInfoAt: string | null; prescribedInfoInPack: string | null
  deadline: string | null; status: 'overdue' | 'due' | 'no_deposit' | 'protected'
}
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const d = (iso: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const STATUS: Record<Row['status'], [string, string]> = {
  overdue: ['Past 30 days', 'bg-red-100 text-red-800'], due: ['Protect by deadline', 'bg-amber-100 text-amber-900'],
  no_deposit: ['No deposit recorded', 'bg-neutral-100 text-neutral-600'], protected: ['Protected', 'bg-emerald-50 text-emerald-700'],
}
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'

export default function DepositsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [setup, setSetup] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const [form, setForm] = useState({ deposit_amount: '', deposit_scheme: 'DPS custodial', deposit_scheme_ref: '', deposit_protected_at: '', prescribed_info_served_at: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await adminFetch('/api/admin/deposits')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not load deposits')
      setRows(j.rows); setSetup(j.setupNeeded)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load deposits') }
  }, [])
  useEffect(() => { load() }, [load])

  function open(r: Row) {
    setEdit(r.tenancyId)
    setForm({ deposit_amount: r.deposit ? String(r.deposit) : '', deposit_scheme: r.scheme || 'DPS custodial', deposit_scheme_ref: r.schemeRef || '', deposit_protected_at: r.protectedAt || '', prescribed_info_served_at: r.prescribedInfoAt || r.prescribedInfoInPack || '' })
  }
  async function save(id: string) {
    setBusy(true); setError('')
    try {
      const r = await adminFetch('/api/admin/deposits', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenancyId: id, ...form }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not save')
      setEdit(null); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }

  const counts = (rows ?? []).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/accounts" />} title="Deposits" />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Deposits</h1>
          <p className="mt-xs text-sm text-neutral-600">Each deposit must be protected, and the prescribed information given to the tenant, within 30 days of the tenancy starting. Deposits can’t exceed 5 weeks’ rent.</p>
        </div>
        {setup && <p className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">{setup}</p>}
        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {rows && (
          <div className="flex flex-wrap gap-sm text-sm">
            {(['overdue', 'due', 'no_deposit', 'protected'] as const).map(k => <span key={k} className={`rounded-full px-md py-xs font-semibold ${STATUS[k][1]}`}>{STATUS[k][0]}: {counts[k] || 0}</span>)}
          </div>
        )}
        {!rows ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <div className="overflow-x-auto rounded-2xl bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-md py-sm">Tenant</th><th className="px-md py-sm">Started</th><th className="px-md py-sm text-right">Deposit</th><th className="px-md py-sm">Protected</th><th className="px-md py-sm">Prescribed info</th><th className="px-md py-sm">Status</th><th className="px-md py-sm"></th>
              </tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(r => (
                  <Fragment key={r.tenancyId}>
                    <tr className="align-top">
                      <td className="px-md py-sm"><Link href={`/admin/lettings/${r.tenancyId}?tab=money&from=/admin/deposits`} className="font-semibold text-neutral-900 hover:text-blue-700 hover:underline">{r.tenant}</Link><span className="block text-xs text-neutral-500">{r.room}, {r.property}</span></td>
                      <td className="px-md py-sm text-neutral-700 whitespace-nowrap">{d(r.startDate)}{r.status !== 'protected' && r.deadline ? <span className="block text-xs text-neutral-500">deadline {d(r.deadline)}</span> : null}</td>
                      <td className="px-md py-sm text-right tabular-nums">{r.deposit ? gbp(r.deposit) : '—'}{r.overCap && <span className="block text-[11px] font-semibold text-red-700">over the {gbp(r.cap)} cap</span>}</td>
                      <td className="px-md py-sm text-xs text-neutral-700">{r.protectedAt || r.schemeRef ? <>{r.scheme || 'Scheme'}{r.schemeRef ? ` · ${r.schemeRef}` : ''}<br />{d(r.protectedAt)}</> : '—'}</td>
                      <td className="px-md py-sm text-xs text-neutral-700">{r.prescribedInfoAt ? d(r.prescribedInfoAt) : r.prescribedInfoInPack ? <span className="text-neutral-500">In move-in pack {d(r.prescribedInfoInPack)}</span> : '—'}</td>
                      <td className="px-md py-sm"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
                      <td className="px-md py-sm text-right"><button onClick={() => edit === r.tenancyId ? setEdit(null) : open(r)} className="text-xs font-bold text-neutral-700 underline">{edit === r.tenancyId ? 'Close' : 'Record'}</button></td>
                    </tr>
                    {edit === r.tenancyId && (
                      <tr><td colSpan={7} className="bg-neutral-50 px-md py-md">
                        <div className="grid gap-sm sm:grid-cols-5">
                          <label className="text-xs font-semibold text-neutral-700">Deposit (£)<input className={input} inputMode="decimal" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: e.target.value })} /></label>
                          <label className="text-xs font-semibold text-neutral-700">Scheme<input className={input} value={form.deposit_scheme} onChange={e => setForm({ ...form, deposit_scheme: e.target.value })} /></label>
                          <label className="text-xs font-semibold text-neutral-700">Scheme reference<input className={input} value={form.deposit_scheme_ref} onChange={e => setForm({ ...form, deposit_scheme_ref: e.target.value })} /></label>
                          <label className="text-xs font-semibold text-neutral-700">Protected on<input type="date" className={input} value={form.deposit_protected_at} onChange={e => setForm({ ...form, deposit_protected_at: e.target.value })} /></label>
                          <label className="text-xs font-semibold text-neutral-700">Prescribed info given<input type="date" className={input} value={form.prescribed_info_served_at} onChange={e => setForm({ ...form, prescribed_info_served_at: e.target.value })} /></label>
                        </div>
                        <button disabled={busy} onClick={() => save(r.tenancyId)} className="mt-sm rounded-lg bg-neutral-900 px-lg py-xs text-sm font-bold text-white disabled:bg-neutral-300">{busy ? 'Saving…' : 'Save'}</button>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

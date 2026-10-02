'use client'

/**
 * /admin/statements/prepare?property=…&month=YYYY-MM — step 2 of the monthly cycle.
 * Shows exactly what the landlord's next statement will contain: rent received and not yet paid over (room by room,
 * including late rent from earlier months), the management fee per room, letting fees due, and expenses due (with
 * their numbers and invoices). Expenses and letting fees can be held back to a later statement. "Make statement"
 * creates it in one step on the server (migration 193 re-checks every figure); then approve it for the payment run.
 * Rent that arrives later goes on a follow-on statement — nothing is paid over twice.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { getCurrentUser } from '@/lib/auth'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import StatementSend from '@/app/admin/statements/StatementSend'
import type { StatementDraft } from '@/lib/statements/draft'
import { planFloat } from '@/lib/statements/float'

const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const monthLabel = (m: string) => new Date(m.slice(0, 7) + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10) }
const ukDate = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

interface MadeStatement { id: string; statement_reference: string; statement_date: string; net_to_landlord: number; approved_at: string | null; paid_date: string | null; sent_at: string | null; source: string; payment_run_id: string | null }

export default function PrepareStatementPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  return <Prepare propertyId={one(sp.property) || ''} month={one(sp.month) || new Date().toISOString().slice(0, 7)} />
}

function Prepare({ propertyId, month }: { propertyId: string; month: string }) {
  const router = useRouter()
  const [draft, setDraft] = useState<StatementDraft | null>(null)
  const [property, setProperty] = useState<{ name: string; landlord: string } | null>(null)
  const [made, setMade] = useState<MadeStatement[]>([])
  const [holdExp, setHoldExp] = useState<Set<string>>(new Set())
  const [holdLet, setHoldLet] = useState<Set<string>>(new Set())
  const [skipFloat, setSkipFloat] = useState(false)
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    const [d, p, st] = await Promise.all([
      adminFetch(`/api/admin/statements/draft?propertyId=${propertyId}&month=${month}`).then(r => r.json()),
      createClient().from('properties').select('name, people!landlord_id(first_name, last_name, full_name, company)').eq('id', propertyId).maybeSingle(),
      createClient().from('landlord_statements').select('id, statement_reference, statement_date, net_to_landlord, approved_at, paid_date, sent_at, source, payment_run_id')
        .eq('property_id', propertyId).gte('period_start', `${month}-01`).lte('period_start', monthEnd(month)).order('statement_reference'),
    ])
    if (d.error) setError(d.error); else setDraft(d.draft)
    const pr: any = p.data
    setProperty(pr ? { name: String(pr.name || '').split('\n')[0], landlord: pr.people?.company || [pr.people?.first_name, pr.people?.last_name].filter(Boolean).join(' ') || pr.people?.full_name || 'No landlord' } : null)
    setMade((st.data as MadeStatement[]) ?? [])
  }, [propertyId, month])

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !['administrator', 'admin'].includes(u.assignment?.role || '')) { router.push('/login'); return }
      if (propertyId) load()
    })()
  }, [router, load, propertyId])

  const view = useMemo(() => {
    if (!draft) return null
    const expenses = draft.expenses.filter(e => !holdExp.has(e.id))
    const lets = draft.lettingFees.filter(l => !holdLet.has(l.tenancyId))
    const gross = draft.totals.gross, fees = draft.totals.fees
    const letting = r2(lets.reduce((t, l) => t + l.amount, 0)), exp = r2(expenses.reduce((t, e) => t + e.amount, 0))
    const fl = planFloat(r2(gross - fees - letting - exp), draft.floatTarget ?? 0, draft.floatBalance ?? 0, skipFloat)
    return { expenses, lets, gross, fees, letting, exp, fl, net: fl.net }
  }, [draft, holdExp, holdLet, skipFloat])

  async function make() {
    setBusy('make'); setError(''); setNotice('')
    const r = await adminFetch('/api/admin/statements/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId, month, statementDate, holdExpenseIds: [...holdExp], holdLettingFeeIds: [...holdLet], skipFloatTopUp: skipFloat }) })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setError(j.error || 'Could not make the statement'); return }
    setNotice(j.message); setHoldExp(new Set()); setHoldLet(new Set()); load()
  }
  async function approve(id: string, approveIt: boolean) {
    setBusy(id); setError(''); setNotice('')
    const r = await adminFetch(`/api/admin/statements/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve: approveIt }) })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) setError(j.error || 'Could not save'); else { setNotice(j.message); load() }
  }
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n) }

  const nothing = draft && !draft.rooms.length && !draft.expenses.length && !draft.lettingFees.length
  const card = 'rounded-2xl border border-neutral-200 bg-white'
  const th = 'px-md py-sm text-left text-xs font-bold text-white'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={`/admin/rent-roll?month=${month}`} />} title="Prepare statement" />
      <PageHero eyebrow={`Finance · Statement · ${monthLabel(month)}`} title={property?.name ?? 'Statement'}
        subtitle={<>{property?.landlord} · step 2: check, make, approve — then it goes in the <Link href={`/admin/payment-run?month=${month}`} className="font-semibold text-[#F6F3EC] underline">payment run</Link>.</>} />
      <div className="mx-auto max-w-6xl px-lg py-xl">

        {notice && <p className="mb-md rounded-xl border border-green-200 bg-green-50 px-lg py-md text-sm font-semibold text-green-800">{notice}</p>}
        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}

        {made.length > 0 && (
          <div className={`${card} mb-lg overflow-hidden`}>
            <p className="border-b border-neutral-100 px-lg py-md text-sm font-bold text-neutral-900">Statements for {monthLabel(month)}</p>
            <div className="divide-y divide-neutral-100">
              {made.map(st => {
                const state = st.paid_date ? 'Paid' : st.approved_at ? (st.payment_run_id ? 'Approved · in the payment run' : 'Approved') : st.source === 'cros' ? 'Draft — check and approve' : 'Imported'
                return (
                  <div key={st.id} className="flex flex-wrap items-center gap-md px-lg py-sm">
                    <span className="font-mono text-sm font-bold text-neutral-900">{st.statement_reference}</span>
                    <span className="text-sm text-neutral-600">{ukDate(st.statement_date)} · {gbp(Number(st.net_to_landlord))} to the landlord</span>
                    <span className={`rounded-full px-sm py-0.5 text-xs font-semibold ${st.paid_date ? 'bg-green-100 text-green-800' : st.approved_at ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{state}</span>
                    <span className="ml-auto flex items-center gap-sm">
                      {st.source === 'cros' && !st.paid_date && !st.approved_at && <button disabled={!!busy} onClick={() => approve(st.id, true)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-50">Approve</button>}
                      {st.source === 'cros' && !st.paid_date && st.approved_at && !st.payment_run_id && <button disabled={!!busy} onClick={() => approve(st.id, false)} className="text-xs font-semibold text-neutral-500 underline">Back to draft</button>}
                      <StatementSend statementId={st.id} label={`${st.statement_reference} ${property?.name ?? ''}`.trim()} sentAt={st.sent_at} onSent={load} />
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!propertyId && <div className={`${card} px-lg py-xl text-center text-sm text-neutral-600`}>Choose the property to prepare a statement for from the <Link href={`/admin/rent-roll?month=${month}`} className="font-semibold underline">rent roll</Link>.</div>}
        {propertyId && !draft && !error && <p className="text-sm text-neutral-500">Working it out…</p>}
        {nothing && <div className={`${card} px-lg py-xl text-center text-sm text-neutral-600`}>Nothing new to put on a statement — every payment received has been paid over, and no expenses or fees are due.{made.length ? ' If more rent arrives, come back and a follow-on statement will take just that.' : ''}</div>}

        {draft && view && !nothing && (
          <>
            {draft.feeWarnings.length > 0 && <p className="mb-md rounded-xl border border-amber-200 bg-amber-50 px-lg py-md text-sm text-amber-800">{draft.feeWarnings.join('. ')}. The statement can’t be made until every room has a fee.</p>}
            {made.some(s => s.source === 'cros') && <p className="mb-md rounded-xl border border-blue-200 bg-blue-50 px-lg py-md text-sm text-blue-800">This is a follow-on statement: it takes only money received since the last one ({made.filter(s => s.source === 'cros').map(s => s.statement_reference).join(', ')}).</p>}

            <div className={`${card} mb-md overflow-x-auto`}>
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900"><tr><th className={th}>Rent received</th><th className={th}>Tenant</th><th className={`${th} text-right`}>Rent</th><th className={`${th} text-right`}>Management fee</th><th className={th}>Notes</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {draft.rooms.map(r => (
                    <tr key={r.room_number}><td className="px-md py-sm">Room {r.room_number}</td><td className="px-md py-sm">{r.tenant_name}</td>
                      <td className="px-md py-sm text-right tabular-nums">{gbp(r.rent)}</td><td className="px-md py-sm text-right tabular-nums">{gbp(r.fee)}</td>
                      <td className="px-md py-sm text-xs text-neutral-500">{r.note}</td></tr>
                  ))}
                  {!draft.rooms.length && <tr><td colSpan={5} className="px-md py-sm text-sm text-neutral-500">No rent received that hasn’t already been paid over.</td></tr>}
                </tbody>
              </table>
              {draft.unpaid.length > 0 && (
                <p className="border-t border-neutral-100 bg-amber-50 px-md py-sm text-xs text-amber-800">
                  Still owed for {monthLabel(month)}: {draft.unpaid.map(u => `${u.room} ${u.tenant} (${gbp(u.due - u.received)})`).join(' · ')} — it goes on a follow-on statement when it arrives.
                </p>
              )}
            </div>

            {draft.lettingFees.length > 0 && (
              <div className={`${card} mb-md overflow-x-auto`}>
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900"><tr><th className={th}>Letting fees due</th><th className={th}>Tenant</th><th className={th}>Tenancy from</th><th className={`${th} text-right`}>Amount</th><th className={th}>This statement</th></tr></thead>
                  <tbody className="divide-y divide-neutral-100">
                    {draft.lettingFees.map(l => (
                      <tr key={l.tenancyId} className={holdLet.has(l.tenancyId) ? 'text-neutral-400' : ''}>
                        <td className="px-md py-sm">Room {l.roomNumber}{l.number ? <span className="ml-sm font-mono text-xs text-neutral-500">{l.number}</span> : null}</td><td className="px-md py-sm">{l.tenant}</td>
                        <td className="px-md py-sm">{ukDate(l.startDate)}</td><td className="px-md py-sm text-right tabular-nums">{gbp(l.amount)}</td>
                        <td className="px-md py-sm"><label className="flex items-center gap-xs text-xs"><input type="checkbox" checked={!holdLet.has(l.tenancyId)} onChange={() => toggle(holdLet, l.tenancyId, setHoldLet)} /> Include</label></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className={`${card} mb-md overflow-x-auto`}>
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900"><tr><th className={th}>Expenses due</th><th className={th}>Supplier</th><th className={th}>Dated</th><th className={`${th} text-right`}>Amount</th><th className={th}>This statement</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {draft.expenses.map(e => (
                    <tr key={e.id} className={holdExp.has(e.id) ? 'text-neutral-400' : ''}>
                      <td className="px-md py-sm">{e.description}{e.hasInvoice ? <span className="ml-sm text-xs text-indigo-700">invoice{e.shareInvoice ? ' · sent with statement' : ''}</span> : null}</td>
                      <td className="px-md py-sm">{e.supplier ?? ''}</td><td className="px-md py-sm">{ukDate(e.date)}</td>
                      <td className="px-md py-sm text-right tabular-nums">{gbp(e.amount)}</td>
                      <td className="px-md py-sm"><label className="flex items-center gap-xs text-xs"><input type="checkbox" checked={!holdExp.has(e.id)} onChange={() => toggle(holdExp, e.id, setHoldExp)} /> Include</label></td>
                    </tr>
                  ))}
                  {!draft.expenses.length && <tr><td colSpan={5} className="px-md py-sm text-sm text-neutral-500">No expenses due. <Link href="/admin/expense-log" className="underline">Add an expense</Link></td></tr>}
                </tbody>
              </table>
            </div>

            <div className={`${card} flex flex-wrap items-end justify-between gap-lg p-lg`}>
              <dl className="grid grid-cols-2 gap-x-xl gap-y-xs text-sm sm:grid-cols-5">
                {[['Rent received', view.gross], ['Management fees', -view.fees], ['Letting fees', -view.letting], ['Expenses', -view.exp], ...(view.fl.used ? [['From the float', view.fl.used]] : []), ...(view.fl.retained ? [['Kept in the float', -view.fl.retained]] : [])].map(([l, v]) => (
                  <div key={l as string}><dt className="text-xs text-neutral-500">{l}</dt><dd className="font-semibold tabular-nums text-neutral-900">{gbp(v as number)}</dd></div>
                ))}
                <div><dt className="text-xs text-neutral-500">To the landlord</dt><dd className={`text-lg font-bold tabular-nums ${view.net < 0 ? 'text-red-700' : 'text-neutral-900'}`}>{gbp(view.net)}</dd></div>
              </dl>
              <div className="flex items-end gap-sm">
                <label className="text-xs text-neutral-600">Statement date<input type="date" value={statementDate} onChange={e => setStatementDate(e.target.value)} className="mt-xs block rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900" /></label>
                <button disabled={busy === 'make' || view.fl.short > 0 || draft.feeWarnings.length > 0} onClick={make} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'make' ? 'Making…' : 'Make statement'}</button>
              </div>
              {(draft.floatTarget > 0 || draft.floatBalance > 0) && (
                <div className="w-full rounded-lg bg-neutral-50 px-md py-sm text-xs text-neutral-700">
                  Float: {gbp(draft.floatBalance)} held of a {gbp(draft.floatTarget)} target.
                  {view.fl.retained > 0 && <> This statement keeps {gbp(view.fl.retained)} back to top it up. <label className="ml-sm inline-flex items-center gap-xs"><input type="checkbox" checked={skipFloat} onChange={e => setSkipFloat(e.target.checked)} /> Don’t top up this time</label></>}
                  {skipFloat && view.fl.retained === 0 && <label className="ml-sm inline-flex items-center gap-xs"><input type="checkbox" checked={skipFloat} onChange={e => setSkipFloat(e.target.checked)} /> Don’t top up this time</label>}
                  {view.fl.used > 0 && <> The float covers {gbp(view.fl.used)} of this month’s shortfall.</>}
                </div>
              )}
              {view.fl.short > 0 && <p className="w-full text-sm text-red-700">Fees and expenses are {gbp(view.fl.short)} more than the rent{view.fl.used ? ' and the float' : ''} — untick expenses to pay them on a later statement, or invoice the landlord.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

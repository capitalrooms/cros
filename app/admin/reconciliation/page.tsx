'use client'

/**
 * /admin/reconciliation
 * Payment reconciliation queue.
 *
 * Shows landlord_statement_rooms rows that need admin review — either because
 * AutoLedger couldn't resolve the room (needs_review=true) or the match hasn't
 * been confirmed yet. Admin confirms or rejects each one.
 *
 * On confirm → rent_charges row is marked paid with the received amount.
 */

import { useState, useEffect, useCallback } from 'react'
import { paymentFit, FIT_CLASS } from '@/lib/payments/fit'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import { financeTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'
import FinancialTrail from '@/app/components/FinancialTrail'
import { statementMonth, monthPeriod, monthLabel } from '@/lib/finance/statementMonth'

interface LSRRow {
  id: string
  statement_id: string
  property_id: string
  room_id: string | null
  tenant_id: string | null
  tenancy_id: string | null
  room_number: number | null
  tenant_name: string
  rent_income: number
  management_fee: number
  letting_fee: number
  other_deductions: number
  net_to_landlord: number
  needs_review: boolean
  confirmed: boolean
  rejected: boolean
  rejection_note: string | null
  rent_charge_id: string | null
  created_at: string
  statement?: {
    id: string
    statement_reference: string
    statement_date: string
    period_start: string
    period_end: string
    reference: string | null
    properties?: { name: string | null; address: string | null } | null
  } | null
  room?: { name: string } | null
  tenant?: { first_name: string | null; last_name: string | null; full_name?: string | null } | null
  rent_charge?: { id: string; amount_due: number; status: string } | null
}

const gbp = (n: number | null | undefined) =>
  n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtMonth = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

type Tab = 'pending' | 'confirmed' | 'rejected' | 'unmatched'

interface UnmatchedTxn {
  id: string
  transaction_date: string
  amount: number
  description: string
  extracted_ref: string | null
  imported_at: string
  bank_import_batches: { filename: string; bank_name: string | null } | null
}

interface TenancyOption {
  tenancy_id: string
  person_id: string
  name: string
  payment_reference: string
  room_name: string | null
  property_name: string | null
  property_id: string | null
  rent_amount: number | null
  sender_name?: string | null
  when?: string | null          // 'moving in …' / 'left …' — not a current tenant
  charge: { id: string; month: string; amount_due: number; amount_received?: number; status: string } | null
}

/** Tenancies whose name, room, house, reference, bank name or rent match every word typed (best first). */
function searchOptions(opts: TenancyOption[], q: string, amount: number): TenancyOption[] {
  const words = q.toLowerCase().replace(/£/g, '').split(/\s+/).filter(Boolean)
  const hay = (o: TenancyOption) => [o.name, o.room_name, o.property_name, o.payment_reference, o.sender_name, o.rent_amount != null ? String(o.rent_amount) : ''].join(' ').toLowerCase()
  const list = words.length ? opts.filter(o => words.every(w => hay(o).includes(w))) : opts.filter(o => o.rent_amount != null && Math.abs(Number(o.rent_amount) - amount) <= Math.max(5, amount * 0.05))
  return list.slice(0, 8)
}

interface FuzzySuggestion {
  tenancy_id: string
  tenant_name: string
  tenant_email: string | null
  payment_reference: string
  room_name: string | null
  property_name: string | null
  rent_amount: number
  rent_charge_id: string | null
  charge_month: string | null
  charge_amount_due: number | null
  signals: string[]
}

export default function ReconciliationPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows]       = useState<LSRRow[]>([])
  // ?tab=unmatched (from Bank import) opens straight on the payments to match
  const [tab, setTab]         = useState<Tab>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'unmatched' ? 'unmatched' as Tab : 'pending')
  const [busy, setBusy]       = useState<Record<string, boolean>>({})
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectNote, setRejectNote]     = useState('')
  const [error, setError]     = useState('')

  // Unmatched transactions state
  const [unmatchedTxns, setUnmatchedTxns] = useState<UnmatchedTxn[]>([])
  const [tenancyOptions, setTenancyOptions] = useState<TenancyOption[]>([])
  const [unmatchedLoading, setUnmatchedLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Record<string, { suggestion: FuzzySuggestion | null; confidence: string; reason: string; loading: boolean }>>({})
  const [allocating, setAllocating] = useState<Record<string, boolean>>({})
  const [manualPick, setManualPick] = useState<Record<string, string>>({}) // txn_id → tenancy_id
  const [allocateNote, setAllocateNote] = useState<Record<string, string>>({})
  const [pickQuery, setPickQuery] = useState<Record<string, string>>({}) // txn_id → what's typed in the search
  const [setAside, setSetAside] = useState<{ id: string; transaction_date: string; amount: number; description: string }[]>([])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('landlord_statement_rooms')
      .select(`
        *,
        statement:landlord_statements(id, statement_reference, statement_date, period_start, period_end, reference, properties(name, address)),
        room:rooms(name),
        tenant:people!landlord_statement_rooms_tenant_id_fkey(salutation, first_name, last_name, full_name),
        rent_charge:rent_charges(id, amount_due, status)
      `)
      .order('created_at', { ascending: false })
      .limit(500)
    setRows((data as LSRRow[]) || [])
  }, [])

  const loadUnmatched = useCallback(async () => {
    setUnmatchedLoading(true)
    try {
      const res = await fetch(`/api/admin/bank-import/unmatched${new URLSearchParams(window.location.search).get('practice') === '1' ? '?practice=1' : ''}`)
      const json = await res.json()
      setUnmatchedTxns(json.transactions || [])
      // suggest a tenant for each line straight away (payer's saved bank name, name likeness, rent amount) — never allocates
      for (const t of ((json.transactions || []) as UnmatchedTxn[]).slice(0, 30)) getFuzzySuggestion(t.id)
      setTenancyOptions(json.tenancy_options || [])
      setSetAside(json.set_aside || [])
    } finally {
      setUnmatchedLoading(false)
    }
  }, [])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin', 'lettings'].includes(data.assignment?.role || '')) {
        router.push('/login'); return
      }
      await Promise.all([load(), loadUnmatched()])
      setLoading(false)
    }
    init()
  }, [router, load, loadUnmatched])

  async function getFuzzySuggestion(txnId: string) {
    setSuggestions(prev => ({ ...prev, [txnId]: { suggestion: null, confidence: '', reason: '', loading: true } }))
    try {
      const res = await fetch('/api/admin/bank-import/fuzzy-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: txnId }),
      })
      const json = await res.json()
      setSuggestions(prev => ({ ...prev, [txnId]: { suggestion: json.suggestion, confidence: json.confidence, reason: json.reason, loading: false } }))
    } catch {
      setSuggestions(prev => ({ ...prev, [txnId]: { suggestion: null, confidence: 'error', reason: 'Failed to fetch suggestion', loading: false } }))
    }
  }

  async function allocate(txnId: string, tenancyOption: TenancyOption | null, fuzzySuggestion: FuzzySuggestion | null, matchMethod: 'manual' | 'fuzzy_confirmed') {
    const option = fuzzySuggestion ?? (tenancyOption ? {
      tenancy_id: tenancyOption.tenancy_id,
      rent_charge_id: tenancyOption.charge?.id ?? null,
      tenant_name: tenancyOption.name,
    } : null)
    if (!option) return   // no charge yet is fine: the server raises the rent for the month the money arrived
    setAllocating(prev => ({ ...prev, [txnId]: true }))
    setError('')
    try {
      const res = await fetch('/api/admin/bank-import/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: txnId,
          rent_charge_id: option.rent_charge_id,
          tenancy_id: option.tenancy_id,
          match_method: matchMethod,
          note: allocateNote[txnId] || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Allocation failed')
      // Remove from list
      setUnmatchedTxns(prev => prev.filter(t => t.id !== txnId))
      setSuggestions(prev => { const n = { ...prev }; delete n[txnId]; return n })
      setManualPick(prev => { const n = { ...prev }; delete n[txnId]; return n })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Allocation failed')
    } finally {
      setAllocating(prev => ({ ...prev, [txnId]: false }))
    }
  }

  async function moveLine(txnId: string, action: 'set_aside' | 'restore') {
    setAllocating(prev => ({ ...prev, [txnId]: true }))
    setError('')
    try {
      const res = await fetch('/api/admin/bank-import/set-aside', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: txnId, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'That didn’t save')
      await loadUnmatched()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
    } finally {
      setAllocating(prev => ({ ...prev, [txnId]: false }))
    }
  }

  async function handleAction(id: string, action: 'confirm' | 'reject', note?: string) {
    setBusy(b => ({ ...b, [id]: true }))
    setError('')
    try {
      const res = await fetch('/api/admin/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, rejection_note: note }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Action failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(b => ({ ...b, [id]: false }))
      setRejectTarget(null)
      setRejectNote('')
    }
  }

  async function confirmMany(ids: string[]) {
    setError('')
    for (const id of ids) {
      setBusy(b => ({ ...b, [id]: true }))
      const res = await fetch('/api/admin/reconciliation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'confirm' }) }).catch(() => null)
      if (!res?.ok) { const j = await res?.json().catch(() => ({})); setError(j?.error || 'Some rows could not be confirmed'); }
      setBusy(b => ({ ...b, [id]: false }))
    }
    await load()
  }

  // the agent's PDF the lines were read from (/api/admin/statements/[id]/source — passed straight from statements@)
  const [preview, setPreview] = useState<null | { title: string; url?: string; error?: string }>(null)
  async function previewStatement(statementId: string, title: string) {
    setPreview({ title })
    const r = await fetch(`/api/admin/statements/${statementId}/source`).catch(() => null)
    if (!r?.ok) { const j = await r?.json().catch(() => ({})); setPreview({ title, error: j?.error || 'The statement could not be opened.' }); return }
    setPreview({ title, url: URL.createObjectURL(await r.blob()) })
  }

  // rooms showing no fee although their statement lists one (GET counts; POST matches them)
  const [feeCheck, setFeeCheck] = useState<null | { rooms: number; lines: number }>(null)
  const [feeBusy, setFeeBusy] = useState(false)
  useEffect(() => { fetch('/api/admin/reconciliation/fees').then(r => r.ok ? r.json() : null).then(d => d && setFeeCheck(d)).catch(() => {}) }, [])
  async function matchFees() {
    setFeeBusy(true); setError('')
    const r = await fetch('/api/admin/reconciliation/fees', { method: 'POST' }).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    if (!r?.ok) setError(d?.error || 'Could not match the fees')
    else setFeeCheck({ rooms: 0, lines: 0 })
    setFeeBusy(false)
    await load()
  }

  const pending   = rows.filter(r => !r.confirmed && !r.rejected)
  const confirmed = rows.filter(r => r.confirmed)
  const rejected  = rows.filter(r => r.rejected)

  const displayed = tab === 'pending' ? pending : tab === 'confirmed' ? confirmed : rejected

  // Group by statement
  const grouped = displayed.reduce<Record<string, LSRRow[]>>((acc, r) => {
    const key = r.statement_id
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  if (loading) {
    return (
      <>
        <AppBar left={<BackButton href="/admin" label="Dashboard" />} title="Reconciliation" />
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-neutral-600 animate-spin" />
        </div>
      </>
    )
  }

  return (
    <>
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} title="Reconciliation" />
      <PageHero title="Bank & matching" subtitle="Match money in to rent, and check the room lines read from the agent’s statements — confirming says the room and tenant are right"
        actions={<HeroButton href="/admin/bank-import" primary>Import bank CSV</HeroButton>}
        tabs={financeTabs('bank')} />
      {/* a soft grey ground, not a white page (17 Oct 2026) */}
      <div className="min-h-screen fin">
      <div className="max-w-6xl mx-auto px-lg py-lg space-y-md">

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-lg py-md text-sm text-red-700">{error}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-sm border-b border-neutral-200 flex-wrap">
          {([
            ['pending',   'Statement Review', pending.length],
            ['confirmed', 'Confirmed',        confirmed.length],
            ['rejected',  'Rejected',         rejected.length],
            ['unmatched', 'Unmatched Bank Payments', unmatchedTxns.length],
          ] as [Tab, string, number][]).map(([t, label, count]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-lg py-sm text-sm font-semibold border-b-2 -mb-px transition ${
                tab === t
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-sm text-xs font-bold px-sm py-xs rounded-full ${
                  t === 'pending' ? 'bg-amber-100 text-amber-800'
                  : t === 'unmatched' ? 'bg-red-100 text-red-700'
                  : 'bg-neutral-100 text-neutral-500'
                }`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {displayed.length === 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white px-xl py-2xl text-center">
            <p className="text-sm text-neutral-400">
              {tab === 'pending'
                ? 'No pending rows — all statement room lines have been reviewed.'
                : tab === 'confirmed'
                ? 'No confirmed rows yet.'
                : 'No rejected rows.'}
            </p>
          </div>
        )}

        {/* Fee check — rooms whose fee is on the statement but wasn't matched (admin) */}
        {tab === 'pending' && feeCheck && (feeCheck.rooms > 0 || feeCheck.lines > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-md rounded-lg border border-amber-300 bg-amber-50 px-lg py-sm text-sm text-amber-900">
            <span><b>{feeCheck.rooms} room line{feeCheck.rooms === 1 ? '' : 's'}</b> show no fee although the statement lists one{feeCheck.lines ? ` (${feeCheck.lines} fee line${feeCheck.lines === 1 ? ' was' : 's were'} filed as an expense)` : ''}.</span>
            <button type="button" onClick={matchFees} disabled={feeBusy} className="rounded-md bg-amber-900 px-md py-1 text-xs font-bold text-white disabled:opacity-50">{feeBusy ? 'Matching…' : 'Match fees from the statement lines'}</button>
          </div>
        )}

        {/* Grouped by statement — a ledger table each: one row per room, figures in columns (17 Oct 2026) */}
        {Object.entries(grouped).map(([stmtId, stmtRows]) => {
          const stmt = stmtRows[0]?.statement
          const prop = stmt?.properties
          const propName = String(prop?.name || prop?.address || 'Unknown property').split('\n')[0]
          const month = stmt ? statementMonth(stmt) : null
          const span = month ? monthPeriod(month) : null
          const stmtRef = String(stmt?.statement_reference || stmt?.reference || '—').split(' ·')[0]
          const sum = (k: 'rent_income' | 'management_fee' | 'letting_fee' | 'other_deductions' | 'net_to_landlord') => stmtRows.reduce((t, r) => t + Number(r[k] || 0), 0)
          const open = stmtRows.filter(r => !r.confirmed && !r.rejected)
          const th = 'px-sm py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#5B6470] whitespace-nowrap'
          const td = 'px-sm py-1.5 whitespace-nowrap'
          const money = 'text-right tabular-nums'

          return (
            <section key={stmtId} className="overflow-hidden rounded-lg border border-[#D6DCE3] bg-white shadow-sm">
              {/* statement band */}
              <div className="flex flex-wrap items-center gap-x-md gap-y-1 border-b border-[#D6DCE3] bg-[#EEF1F5] px-md py-sm">
                <p className="text-sm font-bold text-neutral-900">{propName}</p>
                <span className="text-xs font-semibold text-neutral-700">{month ? monthLabel(month) : '—'}</span>
                {span && <span className="text-xs text-neutral-500">{fmtDate(span.start)} – {fmtDate(span.end)}</span>}
                <span className="rounded bg-white px-1.5 py-px font-mono text-[11px] text-neutral-700 ring-1 ring-[#D6DCE3]">{stmtRef}</span>
                {stmtRows.some(r => r.needs_review) && <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold uppercase text-amber-800">Needs review</span>}
                <span className="ml-auto flex items-center gap-sm">
                  {/^LS\d/i.test(stmtRef) && <button type="button" onClick={() => previewStatement(stmtId, `${propName} · ${stmtRef}`)} className="rounded-md border border-[#C9D1DA] bg-white px-sm py-1 text-xs font-semibold text-neutral-800 hover:bg-neutral-50">📄 View statement</button>}
                  {tab === 'pending' && open.length > 1 && (
                    <button type="button" onClick={() => confirmMany(open.map(r => r.id))} disabled={open.some(r => busy[r.id])} className="rounded-md bg-neutral-900 px-sm py-1 text-xs font-bold text-white disabled:opacity-50">Confirm all {open.length}</button>
                  )}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="border-b border-[#D6DCE3] bg-[#F6F8FA]">
                    <tr>
                      <th className={`${th} text-left`}>Room</th>
                      <th className={`${th} text-left`}>Tenant</th>
                      <th className={`${th} text-right`}>Rent</th>
                      <th className={`${th} text-right`}>Mgmt fee</th>
                      <th className={`${th} text-right`}>Letting fee</th>
                      <th className={`${th} text-right`}>Other</th>
                      <th className={`${th} text-right`}>Net</th>
                      <th className={`${th} text-right`}>{tab === 'pending' ? '' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stmtRows.map((row, i) => {
                      const tenantName = row.tenant
                        ? [row.tenant.salutation, row.tenant.first_name, row.tenant.last_name].filter(Boolean).join(' ') || row.tenant.full_name || row.tenant_name
                        : row.tenant_name
                      const roomName = row.room?.name || (row.room_number ? `Room ${row.room_number}` : 'Unknown room')
                      const noFee = !Number(row.management_fee) && Number(row.rent_income) > 0
                      return (
                        <tr key={row.id} className={`border-b border-[#EDF0F3] last:border-0 ${i % 2 ? 'bg-[#FAFBFC]' : 'bg-white'} hover:bg-[#F1F5FA]`}>
                          <td className={`${td} font-semibold text-neutral-900`}>
                            {roomName}
                            {row.needs_review && !row.room_id && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">unmatched</span>}
                          </td>
                          <td className={`${td} max-w-[220px] truncate text-neutral-700`}>
                            {row.tenancy_id ? <Link href={`/admin/tenant/${row.tenant_id}`} className="hover:underline">{tenantName}</Link> : tenantName}
                          </td>
                          <td className={`${td} ${money} font-semibold text-neutral-900`}><FinancialTrail type="statement_room" id={row.id}>{gbp(row.rent_income)}</FinancialTrail></td>
                          <td className={`${td} ${money} ${noFee ? 'text-amber-700' : 'text-neutral-700'}`} title={noFee ? 'No fee matched for this room' : undefined}>{gbp(row.management_fee)}</td>
                          <td className={`${td} ${money} text-neutral-700`}>{Number(row.letting_fee) ? gbp(row.letting_fee) : '—'}</td>
                          <td className={`${td} ${money} text-neutral-700`}>{Number(row.other_deductions) ? gbp(row.other_deductions) : '—'}</td>
                          <td className={`${td} ${money} font-semibold text-neutral-900`}>{gbp(row.net_to_landlord)}</td>
                          <td className={`${td} text-right`}>
                            {tab === 'pending' && (rejectTarget === row.id ? (
                              <span className="inline-flex items-center gap-1">
                                <input type="text" placeholder="Reason (optional)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} className="w-32 rounded border border-neutral-300 px-1 py-0.5 text-xs" />
                                <button onClick={() => handleAction(row.id, 'reject', rejectNote)} disabled={busy[row.id]} className="rounded bg-red-600 px-sm py-0.5 text-xs font-semibold text-white disabled:opacity-50">Reject</button>
                                <button onClick={() => { setRejectTarget(null); setRejectNote('') }} className="text-xs text-neutral-500">Cancel</button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <button onClick={() => setRejectTarget(row.id)} disabled={busy[row.id]} className="rounded border border-neutral-300 px-sm py-0.5 text-xs font-semibold text-neutral-600 hover:border-red-400 hover:text-red-700 disabled:opacity-50">Reject</button>
                                <button onClick={() => handleAction(row.id, 'confirm')} disabled={busy[row.id]} className="rounded bg-neutral-900 px-sm py-0.5 text-xs font-semibold text-white disabled:opacity-50">{busy[row.id] ? '…' : 'Confirm'}</button>
                              </span>
                            ))}
                            {tab === 'confirmed' && <span className="text-[11px] font-semibold text-green-700">✓ Confirmed</span>}
                            {tab === 'rejected' && <span className="text-[11px] font-semibold text-red-700" title={row.rejection_note || undefined}>Rejected{row.rejection_note ? ' ·' : ''} {row.rejection_note}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t border-[#D6DCE3] bg-[#F6F8FA] font-semibold text-neutral-900">
                    <tr>
                      <td className={td} colSpan={2}>{stmtRows.length} room{stmtRows.length === 1 ? '' : 's'}</td>
                      <td className={`${td} ${money}`}>{gbp(sum('rent_income'))}</td>
                      <td className={`${td} ${money}`}>{gbp(sum('management_fee'))}</td>
                      <td className={`${td} ${money}`}>{sum('letting_fee') ? gbp(sum('letting_fee')) : '—'}</td>
                      <td className={`${td} ${money}`}>{sum('other_deductions') ? gbp(sum('other_deductions')) : '—'}</td>
                      <td className={`${td} ${money}`}>{gbp(sum('net_to_landlord'))}</td>
                      <td className={td} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )
        })}

        {/* the agent's own statement, to check the lines against */}
        {preview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md" onClick={() => setPreview(null)}>
            <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-neutral-200 px-md py-sm">
                <p className="text-sm font-bold text-neutral-900">{preview.title}</p>
                <span className="flex items-center gap-sm">
                  {preview.url && <a href={preview.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 underline">Open in a new tab</a>}
                  <button type="button" onClick={() => setPreview(null)} className="text-xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
                </span>
              </div>
              {preview.url ? <iframe src={preview.url} title={preview.title} className="flex-1 bg-neutral-100" />
                : <p className="p-lg text-sm text-neutral-600">{preview.error || 'Loading the statement…'}</p>}
            </div>
          </div>
        )}

        {/* ── UNMATCHED BANK PAYMENTS TAB ─────────────────────────────────── */}
        {tab === 'unmatched' && (
          <div className="space-y-lg">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-md text-sm text-amber-800">
              <strong>Safe by design:</strong> these payments were imported but no tenant reference was found. Review each one — use the AI suggestion or pick a tenant manually. Every allocation is logged.
            </div>

            {unmatchedLoading && (
              <div className="flex justify-center py-xl">
                <div className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-neutral-600 animate-spin" />
              </div>
            )}

            {!unmatchedLoading && unmatchedTxns.length === 0 && (
              <div className="rounded-xl border border-neutral-200 bg-white px-xl py-2xl text-center">
                <p className="text-2xl mb-sm">✅</p>
                <p className="text-sm font-semibold text-neutral-700">No unmatched payments</p>
                <p className="text-xs text-neutral-400 mt-xs">All imported bank transactions have been allocated.</p>
              </div>
            )}

            {unmatchedTxns.map(txn => {
              const suggestion = suggestions[txn.id]
              const isBusy = allocating[txn.id] || false
              const pickedId = manualPick[txn.id]
              const pickedOption = tenancyOptions.find(t => t.tenancy_id === pickedId) ?? null

              return (
                <div key={txn.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  {/* Transaction header */}
                  <div className="px-xl py-md border-b border-neutral-100 bg-neutral-50 flex items-center justify-between gap-md flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">
                        £{Number(txn.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        <span className="ml-md text-neutral-400 font-normal text-xs">
                          {new Date(txn.transaction_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </p>
                      <p className="text-xs text-neutral-600 mt-xs font-mono truncate max-w-lg">{txn.description}</p>
                      {txn.extracted_ref && (
                        <p className="text-xs text-amber-700 mt-xs">Reference found but no matching tenancy: <code className="font-bold">{txn.extracted_ref}</code></p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-md">
                      <p className="text-xs text-neutral-400">{txn.bank_import_batches?.filename ?? ''}</p>
                      <button type="button" disabled={isBusy} onClick={() => moveLine(txn.id, 'set_aside')}
                        className="rounded-lg border border-neutral-300 bg-white px-md py-xs text-xs font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                        title="Not a rent payment (a holding deposit, a landlord's top-up…) — take it out of this list">
                        Not rent — set aside
                      </button>
                    </div>
                  </div>

                  <div className="px-xl py-lg space-y-md">
                    {/* AI suggestion */}
                    {!suggestion && (
                      <button
                        onClick={() => getFuzzySuggestion(txn.id)}
                        className="text-xs font-semibold rounded-lg border border-indigo-200 text-indigo-700 px-md py-sm hover:bg-indigo-50"
                      >
                        🤖 Get AI suggestion
                      </button>
                    )}

                    {suggestion?.loading && (
                      <p className="text-xs text-neutral-400">Analysing payment…</p>
                    )}

                    {suggestion && !suggestion.loading && suggestion.suggestion && (
                      <div className={`rounded-xl border p-md ${suggestion.confidence === 'high' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                        <div className="flex items-start justify-between gap-md flex-wrap">
                          <div>
                            <p className="text-sm font-semibold text-neutral-900">
                              🤖 AI suggests: {suggestion.suggestion.tenant_name}
                              <span className={`ml-sm text-xs font-bold px-sm py-xs rounded-full ${suggestion.confidence === 'high' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {suggestion.confidence} confidence
                              </span>
                            </p>
                            <p className="text-xs text-neutral-600 mt-xs">
                              {suggestion.suggestion.room_name} · {suggestion.suggestion.property_name} ·{' '}
                              Ref: <code className="font-bold">{suggestion.suggestion.payment_reference}</code>
                            </p>
                            {suggestion.suggestion.charge_month && (
                              <p className="text-xs text-neutral-500 mt-xs">
                                Oldest unpaid: {new Date(suggestion.suggestion.charge_month + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                                {' '}(£{Number(suggestion.suggestion.charge_amount_due).toFixed(2)} due)
                              </p>
                            )}
                            {suggestion.suggestion.charge_amount_due != null && (() => {
                              const fit = paymentFit(Number(txn.amount), Number(suggestion.suggestion!.charge_amount_due))
                              return <p className={`text-xs font-semibold mt-xs ${FIT_CLASS[fit.tone]}`}>{fit.label}</p>
                            })()}
                            <ul className="mt-sm space-y-xs">
                              {suggestion.suggestion.signals.map((s, i) => (
                                <li key={i} className="text-xs text-neutral-500">· {s}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex flex-col gap-sm shrink-0">
                            {suggestion.suggestion.rent_charge_id ? (
                              <button
                                disabled={isBusy}
                                onClick={() => allocate(txn.id, null, suggestion.suggestion, 'fuzzy_confirmed')}
                                className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700 disabled:opacity-50 whitespace-nowrap"
                              >
                                {isBusy ? 'Saving…' : '✓ Confirm this match'}
                              </button>
                            ) : (
                              <button
                                disabled={isBusy}
                                onClick={() => allocate(txn.id, null, suggestion.suggestion, 'fuzzy_confirmed')}
                                className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700 disabled:opacity-50 whitespace-nowrap"
                              >
                                {isBusy ? 'Saving…' : '✓ Confirm (raises this month’s rent)'}
                              </button>
                            )}
                            <button
                              onClick={() => setSuggestions(prev => { const n = { ...prev }; delete n[txn.id]; return n })}
                              className="text-xs text-neutral-400 hover:text-neutral-700"
                            >
                              Dismiss suggestion
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {suggestion && !suggestion.loading && !suggestion.suggestion && (
                      <p className="text-xs text-neutral-500 bg-neutral-50 rounded-lg px-md py-sm border border-neutral-200">
                        🤖 {suggestion.reason}
                      </p>
                    )}

                    {/* Manual allocation */}
                    <div className="flex items-end gap-sm flex-wrap">
                      <div className="flex-1 min-w-0">
                        <label className="block text-xs text-neutral-500 mb-xs" htmlFor={`find-${txn.id}`}>Match to a tenant yourself</label>
                        {pickedOption ? (
                          <div className="flex items-center justify-between gap-sm rounded-lg border border-neutral-900 bg-white px-md py-sm text-sm">
                            <span className="min-w-0 truncate"><b>{pickedOption.name}</b> · {pickedOption.room_name} · {pickedOption.property_name}{pickedOption.when ? ` · ${pickedOption.when}` : ''}</span>
                            <button type="button" onClick={() => setManualPick(prev => { const n = { ...prev }; delete n[txn.id]; return n })} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Change</button>
                          </div>
                        ) : (
                          <>
                            <input
                              id={`find-${txn.id}`}
                              type="search"
                              placeholder="Search name, room, house, reference or rent"
                              value={pickQuery[txn.id] ?? ''}
                              onChange={e => setPickQuery(prev => ({ ...prev, [txn.id]: e.target.value }))}
                              className="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                            />
                            {(() => {
                              const found = searchOptions(tenancyOptions, pickQuery[txn.id] ?? '', Number(txn.amount))
                              return (
                                <div className="mt-xs rounded-lg border border-neutral-200 divide-y divide-neutral-100 bg-white">
                                  {!(pickQuery[txn.id] ?? '').trim() && <p className="px-md py-xs text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{found.length ? 'Rent close to this amount' : 'Type to search every tenant'}</p>}
                                  {found.map(opt => (
                                    <button key={opt.tenancy_id} type="button" onClick={() => setManualPick(prev => ({ ...prev, [txn.id]: opt.tenancy_id }))}
                                      className="flex w-full items-baseline justify-between gap-md px-md py-sm text-left text-sm hover:bg-neutral-50">
                                      <span className="min-w-0"><b>{opt.name}</b> · {opt.room_name} · {opt.property_name}{opt.when ? <span className="text-amber-700"> · {opt.when}</span> : null}<span className="block text-xs text-neutral-500">Ref {opt.payment_reference || '—'}{opt.sender_name ? ` · pays as ${opt.sender_name}` : ''}</span></span>
                                      <span className="shrink-0 text-xs tabular-nums text-neutral-600">{opt.rent_amount != null ? `£${Number(opt.rent_amount).toFixed(2)} pcm` : ''}</span>
                                    </button>
                                  ))}
                                  {(pickQuery[txn.id] ?? '').trim() && !found.length && <p className="px-md py-sm text-xs text-neutral-500">Nobody matches “{pickQuery[txn.id]}”.</p>}
                                </div>
                              )
                            })()}
                          </>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        value={allocateNote[txn.id] ?? ''}
                        onChange={e => setAllocateNote(prev => ({ ...prev, [txn.id]: e.target.value }))}
                        className="rounded-lg border border-neutral-300 px-md py-sm text-sm w-44 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                      />
                      <button
                        disabled={!pickedOption || isBusy}
                        onClick={() => pickedOption && allocate(txn.id, pickedOption, null, 'manual')}
                        className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40 whitespace-nowrap"
                      >
                        {isBusy ? 'Saving…' : 'Allocate'}
                      </button>
                    </div>
                    {pickedOption?.charge && (() => {
                      const fit = paymentFit(Number(txn.amount), pickedOption.charge.status === 'paid' ? 0 : Number(pickedOption.charge.amount_due) - Number(pickedOption.charge.amount_received || 0))
                      return <p className={`text-xs font-semibold ${FIT_CLASS[fit.tone]}`}>{fit.label}</p>
                    })()}
                    {pickedOption && !pickedOption.charge && (
                      <p className="text-xs text-neutral-600">No rent raised for this tenant yet — allocating raises the rent for {new Date(txn.transaction_date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} and puts this payment against it.</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'unmatched' && setAside.length > 0 && (
          <details className="rounded-xl border border-neutral-200 bg-white">
            <summary className="cursor-pointer px-xl py-md text-sm font-semibold text-neutral-700">Set aside as not rent ({setAside.length})</summary>
            <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
              {setAside.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-md px-xl py-sm text-sm">
                  <span className="min-w-0"><b>£{Number(t.amount).toFixed(2)}</b> <span className="text-xs text-neutral-500">{new Date(t.transaction_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span className="block truncate font-mono text-xs text-neutral-600">{t.description}</span></span>
                  <button type="button" disabled={allocating[t.id]} onClick={() => moveLine(t.id, 'restore')} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-40">Put back to match</button>
                </li>
              ))}
            </ul>
          </details>
        )}

      </div>
      </div>
    </>
  )
}

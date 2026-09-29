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
import BackButton from '@/app/components/BackButton'
import FinancialTrail from '@/app/components/FinancialTrail'

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
  charge: { id: string; month: string; amount_due: number; amount_received?: number; status: string } | null
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
  const [tab, setTab]         = useState<Tab>('pending')
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

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('landlord_statement_rooms')
      .select(`
        *,
        statement:landlord_statements(id, statement_reference, statement_date, period_start, period_end, reference, properties(name, address)),
        room:rooms(name),
        tenant:people!landlord_statement_rooms_tenant_id_fkey(first_name, last_name, full_name),
        rent_charge:rent_charges(id, amount_due, status)
      `)
      .order('created_at', { ascending: false })
      .limit(500)
    setRows((data as LSRRow[]) || [])
  }, [])

  const loadUnmatched = useCallback(async () => {
    setUnmatchedLoading(true)
    try {
      const res = await fetch('/api/admin/bank-import/unmatched')
      const json = await res.json()
      setUnmatchedTxns(json.transactions || [])
      setTenancyOptions(json.tenancy_options || [])
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
    if (!option?.rent_charge_id) {
      setError('No unpaid charge found for this tenant — generate a charge first in Rent Charges.')
      return
    }
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
        <AppBar left={<BackButton href="/admin" />} title="Reconciliation" />
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-neutral-600 animate-spin" />
        </div>
      </>
    )
  }

  return (
    <>
      <AppBar left={<BackButton href="/admin" />} title="Reconciliation" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-xl">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Payment reconciliation</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Review statement room lines imported by AutoLedger. Confirm each one to mark the corresponding rent charge as paid.
          </p>
        </div>

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

        {/* Grouped by statement */}
        {Object.entries(grouped).map(([stmtId, stmtRows]) => {
          const stmt = stmtRows[0]?.statement
          const prop = stmt?.properties
          const propName = prop?.name || prop?.address || 'Unknown property'
          const period = stmt?.period_end ? fmtMonth(stmt.period_end) : fmtDate(stmt?.statement_date)
          const stmtRef = stmt?.reference || stmt?.statement_reference || '—'
          const needsReview = stmtRows.some(r => r.needs_review)

          return (
            <div key={stmtId} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              {/* Statement header */}
              <div className="px-xl py-md border-b border-neutral-100 bg-neutral-50 flex items-center justify-between gap-md flex-wrap">
                <div>
                  <p className="text-sm font-bold text-neutral-900">{propName}</p>
                  <p className="text-xs text-neutral-400 mt-xs">
                    {period} · Ref: <span className="font-mono">{stmtRef}</span>
                    {stmt?.period_start && stmt?.period_end && (
                      <> · {fmtDate(stmt.period_start)} – {fmtDate(stmt.period_end)}</>
                    )}
                  </p>
                </div>
                {needsReview && (
                  <span className="text-xs font-semibold px-sm py-xs rounded-full bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                    Needs review
                  </span>
                )}
              </div>

              {/* Room lines */}
              <div className="divide-y divide-neutral-100">
                {stmtRows.map(row => {
                  const tenantName = row.tenant
                    ? [row.tenant.first_name, row.tenant.last_name].filter(Boolean).join(' ') || row.tenant.full_name || row.tenant_name
                    : row.tenant_name
                  const roomName = row.room?.name || (row.room_number ? `Room ${row.room_number}` : 'Unknown room')
                  const charge = row.rent_charge
                  const chargeStatus = charge?.status

                  return (
                    <div key={row.id} className="px-xl py-md flex items-start justify-between gap-md flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-sm flex-wrap">
                          <p className="text-sm font-semibold text-neutral-900">{roomName}</p>
                          {row.needs_review && !row.room_id && (
                            <span className="text-xs px-sm py-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200">Unmatched room</span>
                          )}
                          {row.rent_charge_id && (
                            <span className="text-xs px-sm py-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">Charge linked</span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 mt-xs">{tenantName}</p>
                        <div className="mt-sm flex gap-lg text-xs text-neutral-600 flex-wrap">
                          <span>Rent received: <FinancialTrail type="statement_room" id={row.id}><strong className="text-neutral-900">{gbp(row.rent_income)}</strong></FinancialTrail></span>
                          <span>Mgmt fee: <FinancialTrail type="statement_room" id={row.id}><strong className="text-neutral-900">{gbp(row.management_fee)}</strong></FinancialTrail></span>
                          {row.letting_fee > 0 && <span>Letting fee: <strong className="text-neutral-900">{gbp(row.letting_fee)}</strong></span>}
                          {row.other_deductions > 0 && <span>Other deductions: <strong className="text-neutral-900">{gbp(row.other_deductions)}</strong></span>}
                          <span>Net to landlord: <strong className="text-neutral-900">{gbp(row.net_to_landlord)}</strong></span>
                          {charge && (
                            <span>
                              Charge due: <strong className="text-neutral-900">{gbp(charge.amount_due)}</strong>
                              {' '}
                              <span className={`font-semibold ${chargeStatus === 'paid' ? 'text-green-700' : 'text-amber-700'}`}>
                                ({chargeStatus})
                              </span>
                            </span>
                          )}
                        </div>
                        {row.tenancy_id && (
                          <Link
                            href={`/admin/tenant/${row.tenant_id}`}
                            className="text-xs text-indigo-600 hover:underline mt-xs inline-block"
                          >
                            View tenant →
                          </Link>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-sm shrink-0">
                        {tab === 'pending' && (
                          <>
                            {rejectTarget === row.id ? (
                              <div className="flex items-center gap-sm">
                                <input
                                  type="text"
                                  placeholder="Reason (optional)"
                                  value={rejectNote}
                                  onChange={e => setRejectNote(e.target.value)}
                                  className="text-xs border border-neutral-300 rounded px-sm py-xs w-40 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                />
                                <button
                                  onClick={() => handleAction(row.id, 'reject', rejectNote)}
                                  disabled={busy[row.id]}
                                  className="text-xs font-semibold px-md py-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  Confirm reject
                                </button>
                                <button
                                  onClick={() => { setRejectTarget(null); setRejectNote('') }}
                                  className="text-xs text-neutral-400 hover:text-neutral-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => setRejectTarget(row.id)}
                                  disabled={busy[row.id]}
                                  className="text-xs font-semibold px-md py-sm rounded-lg border border-neutral-300 text-neutral-700 hover:border-red-400 hover:text-red-700 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleAction(row.id, 'confirm')}
                                  disabled={busy[row.id]}
                                  className="text-xs font-semibold px-md py-sm rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50"
                                >
                                  {busy[row.id] ? 'Saving…' : 'Confirm'}
                                </button>
                              </>
                            )}
                          </>
                        )}

                        {tab === 'confirmed' && (
                          <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-md py-sm rounded-lg">
                            ✓ Confirmed
                          </span>
                        )}

                        {tab === 'rejected' && (
                          <div className="text-right">
                            <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-md py-sm rounded-lg">
                              Rejected
                            </span>
                            {row.rejection_note && (
                              <p className="text-xs text-neutral-400 mt-xs">{row.rejection_note}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

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
                    <p className="text-xs text-neutral-400 shrink-0">
                      {txn.bank_import_batches?.filename ?? ''}
                    </p>
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
                              <p className="text-xs text-amber-700">No unpaid charge — generate one in Rent Charges first</p>
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
                        <label className="block text-xs text-neutral-500 mb-xs">Allocate to tenant manually</label>
                        <select
                          value={pickedId ?? ''}
                          onChange={e => setManualPick(prev => ({ ...prev, [txn.id]: e.target.value }))}
                          className="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                        >
                          <option value="">— Select tenant —</option>
                          {tenancyOptions.map(opt => (
                            <option key={opt.tenancy_id} value={opt.tenancy_id}>
                              {opt.name} · {opt.room_name} · {opt.property_name}
                              {opt.charge ? (opt.charge.status === 'paid' ? ' · paid up' : ` · ${new Date(opt.charge.month + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })} owes £${(Number(opt.charge.amount_due) - Number(opt.charge.amount_received || 0)).toFixed(2)}`) : ' · no rent charge yet'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        value={allocateNote[txn.id] ?? ''}
                        onChange={e => setAllocateNote(prev => ({ ...prev, [txn.id]: e.target.value }))}
                        className="rounded-lg border border-neutral-300 px-md py-sm text-sm w-44 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                      />
                      <button
                        disabled={!pickedId || !pickedOption?.charge || isBusy}
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
                      <p className="text-xs text-amber-700">This tenant has no rent charge from when CROS took over rent yet. <a href="/admin/rent-charges" className="underline">Raise charges first →</a></p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </>
  )
}

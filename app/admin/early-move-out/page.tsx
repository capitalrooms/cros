'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { displayName } from '@/lib/people'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

interface MoveOutRequest {
  id: string
  status: string
  track: string
  requested_move_out_date: string
  reason: string | null
  created_at: string
  admin_response_ap1: string | null
  admin_response_ap2: string | null
  replacement_tenant_name: string | null
  replacement_tenant_email: string | null
  refund_days: number | null
  refund_amount: number | null
  voucher_amount: number | null
  daily_rate: number | null
  person_id: string
  tenancy_id: string
  property_id: string | null
  room_id: string | null
  people: { id: string; first_name: string | null; last_name: string | null; full_name: string | null; email: string } | null
  properties: { name: string; address: string } | null
  rooms: { name: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  ap1_approved: 'Terms agreed',
  ap2_approved: 'Handover approved',
  completed: 'Complete',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}
const STATUS_COLOUR: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  ap1_approved: 'bg-blue-100 text-blue-800',
  ap2_approved: 'bg-green-100 text-green-800',
  completed: 'bg-green-200 text-green-900',
  rejected: 'bg-red-100 text-red-800',
  withdrawn: 'bg-neutral-100 text-neutral-500',
}

export default function AdminEarlyMoveOutPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<MoveOutRequest[]>([])
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [selected, setSelected] = useState<MoveOutRequest | null>(null)
  const [working, setWorking] = useState(false)

  // AP1 fields
  const [ap1Response, setAp1Response] = useState('')
  // AP2 fields
  const [ap2Response, setAp2Response] = useState('')
  const [replacementName, setReplacementName] = useState('')
  const [replacementEmail, setReplacementEmail] = useState('')
  const [refundDays, setRefundDays] = useState('')
  const [refundOverride, setRefundOverride] = useState('')
  const [voucherAmount, setVoucherAmount] = useState('')

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
        router.push('/login')
        return
      }
      await loadRequests()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadRequests() {
    const res = await fetch('/api/tenant/early-move-out')
    const j = await res.json()
    setRequests(j.requests || [])
  }

  async function doAction(action: string) {
    if (!selected) return
    setWorking(true)

    const payload: Record<string, unknown> = { request_id: selected.id, action }

    if (action === 'ap1_approve') {
      payload.admin_response_ap1 = ap1Response || null
    } else if (action === 'ap2_approve') {
      payload.admin_response_ap2 = ap2Response || null
      payload.replacement_tenant_name = replacementName || null
      payload.replacement_tenant_email = replacementEmail || null
      if (refundDays) payload.refund_days = Number(refundDays)
      if (refundOverride) payload.refund_amount = Number(refundOverride)
      if (voucherAmount) payload.voucher_amount = Number(voucherAmount)
    } else if (action === 'reject') {
      payload.admin_response_ap1 = ap1Response || null
    }

    const res = await fetch('/api/tenant/early-move-out', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      await loadRequests()
      setSelected(null)
    } else {
      const j = await res.json()
      alert(j.error || 'Something went wrong')
    }
    setWorking(false)
  }

  if (loading) return <GenericPageSkeleton />

  const filtered = filter === 'active'
    ? requests.filter(r => !['withdrawn', 'rejected', 'completed'].includes(r.status))
    : requests

  function calcRefund(r: MoveOutRequest) {
    if (!refundDays || !r.daily_rate) return null
    return Math.round(Number(refundDays) * r.daily_rate * 100) / 100
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-xl flex items-start justify-between gap-md">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Early Move-Out Requests</h1>
            <p className="text-sm text-neutral-500 mt-xs">Tenant requests to end tenancies early</p>
          </div>
          <div className="flex gap-sm">
            {(['active', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-md py-sm text-sm font-semibold rounded-xl transition-all ${filter === f ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700 hover:border-neutral-500'}`}
              >
                {f === 'active' ? 'Active' : 'All'} ({f === 'active' ? requests.filter(r => !['withdrawn', 'rejected', 'completed'].includes(r.status)).length : requests.length})
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-400">No {filter === 'active' ? 'active ' : ''}requests</p>
          </div>
        ) : (
          <div className="space-y-sm">
            {filtered.map(r => (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-neutral-200 p-lg cursor-pointer hover:border-neutral-400 transition-colors"
                onClick={() => {
                  setSelected(r)
                  setAp1Response(r.admin_response_ap1 || '')
                  setAp2Response(r.admin_response_ap2 || '')
                  setReplacementName(r.replacement_tenant_name || '')
                  setReplacementEmail(r.replacement_tenant_email || '')
                  setRefundDays(r.refund_days ? String(r.refund_days) : '')
                  setRefundOverride('')
                  setVoucherAmount(r.voucher_amount ? String(r.voucher_amount) : '')
                }}
              >
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">
                      {displayName(r.people)} — {r.rooms?.name}, {r.properties?.address}
                    </p>
                    <p className="text-sm text-neutral-500 mt-xs">
                      Wants out by {new Date(r.requested_move_out_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {' · '}{r.track === 'find_replacement' ? '🤝 Finding own replacement' : '📋 Standard exit'}
                    </p>
                    {r.reason && <p className="text-xs text-neutral-400 mt-xs italic">"{r.reason}"</p>}
                  </div>
                  <span className={`shrink-0 text-xs font-bold px-sm py-xs rounded-full ${STATUS_COLOUR[r.status] || 'bg-neutral-100 text-neutral-600'}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </div>
                {r.refund_amount && (
                  <p className="text-xs text-green-700 mt-sm font-semibold">Agreed refund: £{r.refund_amount.toLocaleString()}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Side panel / modal for selected request ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelected(null)} />
          <div className="w-full max-w-lg bg-white overflow-y-auto shadow-2xl flex flex-col">
            <div className="sticky top-0 bg-white border-b border-neutral-200 px-lg py-md flex items-center justify-between gap-md z-10">
              <h2 className="font-bold text-neutral-900">Request detail</h2>
              <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-700 text-xl">✕</button>
            </div>

            <div className="flex-1 px-lg py-lg space-y-lg overflow-y-auto pb-3xl">
              {/* Summary */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-sm">Request</p>
                <p className="font-semibold text-neutral-900">{displayName(selected.people)}</p>
                <p className="text-sm text-neutral-500">{selected.rooms?.name}, {selected.properties?.address}</p>
                <div className="mt-sm flex flex-wrap gap-sm">
                  <span className={`text-xs font-bold px-sm py-xs rounded-full ${STATUS_COLOUR[selected.status]}`}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                  <span className="text-xs bg-neutral-100 text-neutral-600 font-semibold px-sm py-xs rounded-full">
                    {selected.track === 'find_replacement' ? '🤝 Finding replacement' : '📋 Standard exit'}
                  </span>
                </div>
              </div>

              <dl className="text-sm space-y-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Requested date</dt>
                  <dd className="font-semibold">{new Date(selected.requested_move_out_date).toLocaleDateString('en-GB')}</dd>
                </div>
                {selected.daily_rate && (
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Daily rate</dt>
                    <dd className="font-semibold">£{selected.daily_rate.toFixed(2)}</dd>
                  </div>
                )}
                {selected.reason && (
                  <div>
                    <dt className="text-neutral-500 mb-xs">Reason given</dt>
                    <dd className="text-neutral-700 italic">"{selected.reason}"</dd>
                  </div>
                )}
              </dl>

              {/* ── AP1: Approval Point 1 ── */}
              {['pending'].includes(selected.status) && (
                <div className="bg-amber-50 rounded-xl border border-amber-200 p-md">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-sm">Approval Point 1 — Agree terms</p>
                  <div className="mb-sm">
                    <label className="text-xs font-semibold text-neutral-700 mb-xs block">Message to tenant <span className="text-neutral-400 font-normal">(optional)</span></label>
                    <textarea
                      rows={3}
                      value={ap1Response}
                      onChange={e => setAp1Response(e.target.value)}
                      placeholder="e.g. We can agree an early release — here are the terms…"
                      className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm resize-none"
                    />
                  </div>
                  <div className="flex gap-sm">
                    <button
                      onClick={() => doAction('ap1_approve')}
                      disabled={working}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-md py-sm rounded-lg disabled:opacity-50"
                    >
                      {working ? 'Saving…' : '✓ Approve — agree terms'}
                    </button>
                    <button
                      onClick={() => doAction('reject')}
                      disabled={working}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-sm font-semibold px-md py-sm rounded-lg disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {/* ── AP2: Approval Point 2 ── */}
              {['ap1_approved'].includes(selected.status) && (
                <div className="bg-green-50 rounded-xl border border-green-200 p-md">
                  <p className="text-xs font-bold uppercase tracking-wide text-green-700 mb-sm">Approval Point 2 — Confirm handover</p>

                  {selected.track === 'find_replacement' && (
                    <div className="space-y-sm mb-md">
                      <div>
                        <label className="text-xs font-semibold text-neutral-700 mb-xs block">Replacement tenant name</label>
                        <input type="text" value={replacementName} onChange={e => setReplacementName(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-neutral-700 mb-xs block">Replacement tenant email</label>
                        <input type="email" value={replacementEmail} onChange={e => setReplacementEmail(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" />
                      </div>
                    </div>
                  )}

                  {/* Refund calculation */}
                  <div className="bg-white rounded-lg border border-green-200 p-sm mb-md">
                    <p className="text-xs font-semibold text-neutral-700 mb-sm">Refund calculation</p>
                    {selected.daily_rate && (
                      <div className="mb-sm">
                        <label className="text-xs text-neutral-600 mb-xs block">Days to refund (at £{selected.daily_rate.toFixed(2)}/day)</label>
                        <div className="flex gap-sm items-center">
                          <input
                            type="number"
                            value={refundDays}
                            onChange={e => { setRefundDays(e.target.value); setRefundOverride('') }}
                            className="w-24 rounded-lg border border-neutral-300 px-sm py-xs text-sm"
                            placeholder="0"
                          />
                          {refundDays && selected.daily_rate && (
                            <span className="text-sm font-bold text-green-700">= £{(Number(refundDays) * selected.daily_rate).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mb-sm">
                      <label className="text-xs text-neutral-600 mb-xs block">Or set refund amount directly (£)</label>
                      <input
                        type="number"
                        value={refundOverride}
                        onChange={e => { setRefundOverride(e.target.value); setRefundDays('') }}
                        className="w-32 rounded-lg border border-neutral-300 px-sm py-xs text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-600 mb-xs block">Amazon voucher (discretionary, £)</label>
                      <input
                        type="number"
                        value={voucherAmount}
                        onChange={e => setVoucherAmount(e.target.value)}
                        className="w-32 rounded-lg border border-neutral-300 px-sm py-xs text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    {(refundDays || refundOverride) && (
                      <p className="text-xs text-amber-700 mt-sm">
                        ⚠️ Displayed to tenant as an estimate. Payment is manual — do not transfer automatically.
                      </p>
                    )}
                  </div>

                  <div className="mb-sm">
                    <label className="text-xs font-semibold text-neutral-700 mb-xs block">Final message to tenant <span className="text-neutral-400 font-normal">(optional)</span></label>
                    <textarea
                      rows={3}
                      value={ap2Response}
                      onChange={e => setAp2Response(e.target.value)}
                      placeholder="e.g. Handover confirmed for…"
                      className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm resize-none"
                    />
                  </div>

                  <button
                    onClick={() => doAction('ap2_approve')}
                    disabled={working}
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-md py-sm rounded-lg disabled:opacity-50"
                  >
                    {working ? 'Saving…' : '✓ Confirm handover'}
                  </button>
                </div>
              )}

              {/* Previously set AP1 response shown for reference */}
              {selected.status !== 'pending' && selected.admin_response_ap1 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">Message sent at AP1</p>
                  <p className="text-sm text-neutral-700 italic">"{selected.admin_response_ap1}"</p>
                </div>
              )}

              {/* Link to tenancy room */}
              {selected.property_id && selected.room_id && (
                <Link
                  href={`/admin/properties/${selected.property_id}/rooms/${selected.room_id}`}
                  className="block text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Open room admin →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

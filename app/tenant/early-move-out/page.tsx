'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

interface Tenancy {
  id: string
  property_id: string
  room_id: string
  start_date: string
  end_date: string | null
  rent_amount: number | null
  status: string | null
  rooms: { name: string } | null
  properties: { name: string; address: string } | null
}

interface ExistingRequest {
  id: string
  status: string
  requested_move_out_date: string
  reason: string | null
  created_at: string
  admin_response_ap1: string | null
  admin_response_ap2: string | null
  replacement_tenant_name: string | null
  refund_amount: number | null
  voucher_amount: number | null
}

export default function EarlyMoveOutPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tenancy, setTenancy] = useState<Tenancy | null>(null)
  const [existing, setExisting] = useState<ExistingRequest | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)

  // Form state
  const [moveOutDate, setMoveOutDate] = useState('')
  const [reason, setReason] = useState('')
  const [track, setTrack] = useState<'standard' | 'find_replacement'>('standard')
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user) { router.push('/login'); return }

      const pid = (user.assignment as any)?.id || null
      setPersonId(pid)

      const supabase = createClient()

      // Get active tenancy
      const { data: t } = await supabase
        .from('tenancies')
        .select('id, property_id, room_id, start_date, end_date, rent_amount, status, rooms(name), properties(name, address)')
        .eq('person_id', pid)
        .is('end_date', null)
        .maybeSingle()

      setTenancy(t as Tenancy | null)

      // Check for existing open request
      if (t) {
        const { data: req } = await supabase
          .from('early_move_out_requests')
          .select('id, status, requested_move_out_date, reason, created_at, admin_response_ap1, admin_response_ap2, replacement_tenant_name, refund_amount, voucher_amount')
          .eq('tenancy_id', t.id)
          .not('status', 'in', '("withdrawn","rejected")')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        setExisting(req as ExistingRequest | null)
      }

      setLoading(false)
    }
    init()
  }, [router])

  async function handleSubmit() {
    if (!tenancy || !personId || !moveOutDate) return
    setSubmitting(true)

    const res = await fetch('/api/tenant/early-move-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenancy_id: tenancy.id,
        person_id: personId,
        property_id: tenancy.property_id,
        room_id: tenancy.room_id,
        requested_move_out_date: moveOutDate,
        reason: reason || null,
        track,
      }),
    })

    if (res.ok) {
      setDone(true)
    } else {
      const j = await res.json()
      alert(j.error || 'Something went wrong')
    }
    setSubmitting(false)
  }

  async function handleWithdraw() {
    if (!existing) return
    if (!confirm('Withdraw your early move-out request? You can submit a new one at any time.')) return
    await fetch('/api/tenant/early-move-out', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: existing.id, status: 'withdrawn' }),
    })
    setExisting(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const minDate = tenancy?.start_date
    ? new Date(new Date(tenancy.start_date).getTime() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  // ── Submitted confirmation ────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/tenant" />} />
        <main className="mx-auto max-w-lg px-lg py-3xl text-center">
          <div className="text-5xl mb-lg">✅</div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-sm">Request received</h1>
          <p className="text-sm text-neutral-600 mb-xl">
            We&apos;ll review your request and be in touch within 2 business days.
            {track === 'find_replacement' && (
              <> Once we agree terms, you&apos;ll be able to share the room listing with potential replacements.</>
            )}
          </p>
          <Link href="/tenant" className="inline-block bg-neutral-900 text-white text-sm font-bold px-xl py-md rounded-xl hover:bg-neutral-800">
            Back to home
          </Link>
        </main>
      </div>
    )
  }

  // ── No active tenancy ─────────────────────────────────────────────────
  if (!tenancy) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/tenant" />} />
        <main className="mx-auto max-w-lg px-lg py-3xl text-center">
          <p className="text-neutral-500 text-sm">No active tenancy found. Please contact us if you think this is a mistake.</p>
        </main>
      </div>
    )
  }

  const statusColour = (s: string) => {
    switch (s) {
      case 'pending': return 'bg-amber-100 text-amber-800'
      case 'ap1_approved': return 'bg-blue-100 text-blue-800'
      case 'ap2_approved': return 'bg-green-100 text-green-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      default: return 'bg-neutral-100 text-neutral-700'
    }
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending': return 'Under review'
      case 'ap1_approved': return 'Terms agreed — finding replacement'
      case 'ap2_approved': return 'Handover approved'
      case 'completed': return 'Complete'
      case 'rejected': return 'Declined'
      default: return s
    }
  }

  // ── Existing open request ─────────────────────────────────────────────
  if (existing) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/tenant" />} />
        <main className="mx-auto max-w-lg px-lg py-lg">
          <h1 className="text-2xl font-bold text-neutral-900 mb-xs">Early move-out</h1>
          <p className="text-sm text-neutral-500 mb-xl">You already have a request in progress.</p>

          <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-lg">
            <div className="flex items-center justify-between gap-md mb-md">
              <p className="font-semibold text-neutral-900">Your request</p>
              <span className={`text-xs font-bold px-sm py-xs rounded-full ${statusColour(existing.status)}`}>
                {statusLabel(existing.status)}
              </span>
            </div>

            <dl className="text-sm space-y-xs">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Requested move-out</dt>
                <dd className="font-semibold text-neutral-900">
                  {new Date(existing.requested_move_out_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Submitted</dt>
                <dd className="text-neutral-700">
                  {new Date(existing.created_at).toLocaleDateString('en-GB')}
                </dd>
              </div>
              {existing.reason && (
                <div>
                  <dt className="text-neutral-500 mb-xs">Reason</dt>
                  <dd className="text-neutral-700">{existing.reason}</dd>
                </div>
              )}
            </dl>

            {existing.admin_response_ap1 && (
              <div className="mt-md pt-md border-t border-neutral-100">
                <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">Message from Capital Rooms</p>
                <p className="text-sm text-neutral-700">{existing.admin_response_ap1}</p>
              </div>
            )}

            {existing.refund_amount !== null && (
              <div className="mt-md pt-md border-t border-neutral-100 bg-green-50 rounded-xl p-md">
                <p className="text-xs font-bold text-green-700 mb-xs">Estimated refund</p>
                <p className="text-2xl font-bold text-green-800">£{existing.refund_amount.toLocaleString()}</p>
                <p className="text-xs text-green-600 mt-xs">Paid within 4 business days of handover</p>
                {existing.voucher_amount && (
                  <p className="text-xs text-green-600">+ £{existing.voucher_amount} Amazon voucher (discretionary)</p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleWithdraw}
            className="text-sm text-neutral-500 hover:text-red-600 underline"
          >
            Withdraw this request
          </button>
        </main>
      </div>
    )
  }

  // ── New request form ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-lg">
        <h1 className="text-2xl font-bold text-neutral-900 mb-xs">Early move-out</h1>
        <p className="text-sm text-neutral-500 mb-xl">
          If you need to leave before your contract ends, let us know. We&apos;ll look at your situation and come back to you within 2 business days.
        </p>

        {/* Current tenancy summary */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">Your tenancy</p>
          <p className="font-semibold text-neutral-900">{tenancy.rooms?.name}, {tenancy.properties?.address}</p>
          <p className="text-sm text-neutral-500 mt-xs">
            Started {new Date(tenancy.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            {tenancy.end_date && ` · ends ${new Date(tenancy.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
          </p>
        </div>

        {/* Track selection */}
        <fieldset className="mb-xl">
          <legend className="text-sm font-semibold text-neutral-700 mb-sm">How would you like to proceed?</legend>
          <div className="space-y-sm">
            <label className={`flex gap-md p-lg rounded-xl border-2 cursor-pointer transition-colors ${track === 'standard' ? 'border-neutral-900 bg-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
              <input type="radio" name="track" value="standard" checked={track === 'standard'} onChange={() => setTrack('standard')} className="mt-0.5 accent-neutral-900 shrink-0" />
              <div>
                <p className="font-semibold text-neutral-900 text-sm">Standard early exit</p>
                <p className="text-xs text-neutral-500 mt-xs">We look at your situation, agree any costs, and find a new tenant ourselves. Simplest option.</p>
              </div>
            </label>
            <label className={`flex gap-md p-lg rounded-xl border-2 cursor-pointer transition-colors ${track === 'find_replacement' ? 'border-neutral-900 bg-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
              <input type="radio" name="track" value="find_replacement" checked={track === 'find_replacement'} onChange={() => setTrack('find_replacement')} className="mt-0.5 accent-neutral-900 shrink-0" />
              <div>
                <p className="font-semibold text-neutral-900 text-sm">I&apos;ll find my own replacement</p>
                <p className="text-xs text-neutral-500 mt-xs">You bring a suitable replacement tenant. Often means lower or zero exit costs and a faster release.</p>
              </div>
            </label>
          </div>
        </fieldset>

        {/* Desired move-out date */}
        <div className="mb-xl">
          <label className="block text-sm font-semibold text-neutral-700 mb-xs">When would you like to move out?</label>
          <input
            type="date"
            value={moveOutDate}
            min={minDate}
            onChange={e => setMoveOutDate(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900"
          />
          <p className="text-xs text-neutral-400 mt-xs">This is a request, not a guarantee. We&apos;ll confirm a date once we&apos;ve assessed the situation.</p>
        </div>

        {/* Reason */}
        <div className="mb-xl">
          <label className="block text-sm font-semibold text-neutral-700 mb-xs">Reason for leaving early <span className="text-neutral-400 font-normal">(optional)</span></label>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. job relocation, family circumstances…"
            className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 resize-none"
          />
        </div>

        {/* Info box */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-md mb-xl">
          <p className="text-xs font-semibold text-amber-800 mb-xs">What happens next</p>
          <ul className="text-xs text-amber-700 space-y-xs list-disc list-inside">
            <li>We&apos;ll review your request within 2 business days</li>
            <li>We&apos;ll contact you about any outstanding rent and costs</li>
            <li>You&apos;ll need to keep paying rent until a replacement moves in or the contract end date, whichever comes first</li>
            <li>Refunds are paid within 4 business days of an agreed handover</li>
          </ul>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!moveOutDate || submitting}
          className="w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </main>
    </div>
  )
}

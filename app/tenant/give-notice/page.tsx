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
  person_id: string
  start_date: string
  end_date: string | null
  notice_received_date: string | null
  status: string | null
  rent_amount: number | null
  rescind_requested_at: string | null
  rooms: { name: string } | null
  properties: { name: string; address: string; notice_period_months: number | null } | null
}

export default function GiveNoticePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tenancy, setTenancy] = useState<Tenancy | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)

  const [moveOutDate, setMoveOutDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user) { router.push('/login'); return }

      const pid = (user.assignment as any)?.id || null
      setPersonId(pid)

      const supabase = createClient()
      const { data: t } = await supabase
        .from('tenancies')
        .select('id, person_id, start_date, end_date, notice_received_date, status, rent_amount, rescind_requested_at, rooms(name), properties(name, address, notice_period_months)')
        .eq('person_id', pid)
        .is('end_date', null)
        .not('status', 'eq', 'on_notice')
        .maybeSingle()

      setTenancy(t as Tenancy | null)
      setLoading(false)
    }
    init()
  }, [router])

  const noticePeriodMonths = tenancy?.properties?.notice_period_months ?? 2
  const today = new Date()
  const minMoveOut = new Date(today)
  minMoveOut.setMonth(minMoveOut.getMonth() + noticePeriodMonths)
  const minDateStr = minMoveOut.toISOString().split('T')[0]

  async function handleSubmit() {
    if (!tenancy || !personId || !moveOutDate) return
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/tenant/give-notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenancyId: tenancy.id,
        personId,
        intendedMoveOutDate: moveOutDate,
      }),
    })

    if (res.ok) {
      setDone(true)
    } else {
      const j = await res.json()
      setError(j.error || 'Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
      <p className="text-sm text-neutral-400">Loading…</p>
    </div>
  )

  // ── No active tenancy ────────────────────────────────────────────────────
  if (!tenancy) return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-3xl text-center">
        <p className="text-neutral-500 text-sm">No active tenancy found. Please contact us if this looks wrong.</p>
      </main>
    </div>
  )

  // ── Submitted confirmation ───────────────────────────────────────────────
  if (done) return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-3xl text-center">
        <div className="text-5xl mb-lg">✅</div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-sm">Notice received</h1>
        <p className="text-sm text-neutral-600 mb-xl">
          We&apos;ve recorded your notice. Our team will send you a checkout confirmation email shortly
          with your final rent amount, checkout checklist, and deposit return information.
        </p>
        <Link
          href="/tenant"
          className="inline-block bg-neutral-900 text-white text-sm font-bold px-xl py-md rounded-xl hover:bg-neutral-800"
        >
          Back to home
        </Link>
      </main>
    </div>
  )

  const moveOutFormatted = moveOutDate
    ? new Date(moveOutDate + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-lg">
        <h1 className="text-2xl font-bold text-neutral-900 mb-xs">Give notice to leave</h1>
        <p className="text-sm text-neutral-500 mb-xl">
          Standard notice is {noticePeriodMonths} month{noticePeriodMonths !== 1 ? 's' : ''}.
          Once submitted, our team will confirm your checkout date and send all the details you need.
        </p>

        {/* Current tenancy summary */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">Your tenancy</p>
          <p className="font-semibold text-neutral-900">
            {tenancy.rooms?.name}, {tenancy.properties?.address}
          </p>
          <p className="text-sm text-neutral-500 mt-xs">
            Started {new Date(tenancy.start_date).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>

        {/* Move-out date */}
        <div className="mb-xl">
          <label className="block text-sm font-semibold text-neutral-700 mb-xs">
            When would you like to move out? *
          </label>
          <input
            type="date"
            value={moveOutDate}
            min={minDateStr}
            onChange={e => { setMoveOutDate(e.target.value); setError(null) }}
            className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900"
          />
          <p className="text-xs text-neutral-400 mt-xs">
            Earliest possible date: {minMoveOut.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' '}({noticePeriodMonths} month{noticePeriodMonths !== 1 ? 's' : ''} notice required)
          </p>
        </div>

        {/* Summary box */}
        {moveOutFormatted && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-md mb-xl">
            <p className="text-sm text-neutral-700">
              Your notice will be recorded from <strong>today</strong>, with a move-out
              date of <strong>{moveOutFormatted}</strong>.
            </p>
          </div>
        )}

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-md mb-xl">
          <p className="text-xs font-semibold text-blue-800 mb-xs">What happens next</p>
          <ul className="text-xs text-blue-700 space-y-xs list-disc list-inside">
            <li>Our team will send you a checkout confirmation email within 1 business day</li>
            <li>The email will include your final pro-rata rent, checkout checklist, and deposit return info</li>
            <li>You&apos;ll receive a reminder 2 weeks before your move-out date</li>
            <li>Continue paying rent as normal until your confirmed move-out date</li>
          </ul>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-md mb-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!moveOutDate || submitting}
          className="w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit notice'}
        </button>

        <p className="text-xs text-neutral-400 mt-md text-center">
          Need to leave sooner?{' '}
          <Link href="/tenant/early-move-out" className="underline">
            Request early move-out
          </Link>
        </p>
      </main>
    </div>
  )
}

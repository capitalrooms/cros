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
  status: string | null
  end_date: string | null
  notice_received_date: string | null
  rescind_requested_at: string | null
  rooms: { name: string } | null
  properties: { address: string } | null
}

export default function RescindNoticePage() {
  const router = useRouter()
  const [loading, setLoading]     = useState(true)
  const [tenancy, setTenancy]     = useState<Tenancy | null>(null)
  const [personId, setPersonId]   = useState<string | null>(null)
  const [note, setNote]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user) { router.push('/login'); return }

      const pid = (user.assignment as any)?.id || null
      setPersonId(pid)

      const supabase = createClient()
      const { data: t } = await supabase
        .from('tenancies')
        .select('id, person_id, status, end_date, notice_received_date, rescind_requested_at, rooms(name), properties(address)')
        .eq('person_id', pid)
        .eq('status', 'on_notice')
        .maybeSingle()

      setTenancy(t as Tenancy | null)
      setLoading(false)
    }
    init()
  }, [router])

  async function handleSubmit() {
    if (!tenancy || !personId) return
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/tenant/rescind-notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenancyId: tenancy.id, personId, note: note || null }),
    })

    if (res.ok) {
      setDone(true)
    } else {
      const j = await res.json()
      setError(j.error || 'Something went wrong. Please try again or contact us directly.')
    }
    setSubmitting(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
      <p className="text-sm text-neutral-400">Loading…</p>
    </div>
  )

  if (!tenancy) return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-3xl text-center">
        <p className="text-neutral-500 text-sm">
          You don&apos;t have an active notice to rescind.{' '}
          <Link href="/tenant" className="underline">Back to home</Link>
        </p>
      </main>
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-3xl text-center">
        <div className="text-5xl mb-lg">📬</div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-sm">Request sent</h1>
        <p className="text-sm text-neutral-600 mb-xl">
          We&apos;ve received your request to cancel your notice. Our team will review it and
          get back to you — your notice stays in place until we confirm otherwise.
        </p>
        <Link href="/tenant" className="inline-block bg-neutral-900 text-white text-sm font-bold px-xl py-md rounded-xl hover:bg-neutral-800">
          Back to home
        </Link>
      </main>
    </div>
  )

  // Already has a pending rescind request
  if (tenancy.rescind_requested_at) return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-lg">
        <h1 className="text-2xl font-bold text-neutral-900 mb-xs">Rescind notice</h1>
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-lg mt-lg">
          <p className="text-sm font-semibold text-purple-900 mb-xs">Request pending</p>
          <p className="text-sm text-purple-700">
            Your request to cancel your notice is being reviewed. We&apos;ll be in touch once we&apos;ve made a decision.
            Your notice remains active in the meantime.
          </p>
        </div>
        <Link href="/tenant" className="mt-lg inline-block text-sm text-neutral-500 underline">
          Back to home
        </Link>
      </main>
    </div>
  )

  const moveOutFormatted = tenancy.end_date
    ? new Date(tenancy.end_date + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-lg">
        <h1 className="text-2xl font-bold text-neutral-900 mb-xs">Rescind notice</h1>
        <p className="text-sm text-neutral-500 mb-xl">
          Changed your mind? Send a request to cancel your notice. Our team will review it —
          your notice stays in place until we confirm the cancellation.
        </p>

        {/* Current notice summary */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">Your current notice</p>
          <p className="font-semibold text-neutral-900">
            {tenancy.rooms?.name}, {tenancy.properties?.address}
          </p>
          {moveOutFormatted && (
            <p className="text-sm text-neutral-500 mt-xs">Move-out date: {moveOutFormatted}</p>
          )}
          {tenancy.notice_received_date && (
            <p className="text-sm text-neutral-500">
              Notice given: {new Date(tenancy.notice_received_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Reason */}
        <div className="mb-xl">
          <label className="block text-sm font-semibold text-neutral-700 mb-xs">
            Reason <span className="text-neutral-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. circumstances have changed, made a mistake…"
            className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 resize-none"
          />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-md mb-xl">
          <p className="text-xs text-amber-800">
            <strong>Important:</strong> Submitting this request does not automatically cancel your notice.
            Our team must approve it first. Continue paying rent as normal until you hear back from us.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-md mb-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Sending request…' : 'Send rescind request'}
        </button>
      </main>
    </div>
  )
}

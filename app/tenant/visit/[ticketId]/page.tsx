'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { createClient } from '@/lib/supabase'
import { slotLabel } from '@/lib/booking'

interface Ticket {
  id: string
  title: string
  description: string | null
  category: string | null
  status: string
  booked_date: string | null
  booked_slot: string | null
  arrived_at: string | null
  room_id: string | null
  property_id: string | null
  short_notice: boolean
  short_notice_tenant_approved_at: string | null
  short_notice_pending: boolean
  fallback_date: string | null
  fallback_slot: string | null
  properties: { name: string; address: string } | null
  rooms: { name: string } | null
  contractor: { first_name: string | null; last_name: string | null } | null
}

interface OtherTicket {
  id: string
  title: string
  category: string | null
  status: string
  booked_date: string | null
}

interface VisitRequest {
  id: string
  request_text: string
  status: 'pending' | 'approved' | 'declined'
  admin_response: string | null
  reviewed_at: string | null
  created_at: string
}

function fmtDate(iso: string) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]
  if (iso === today) return 'Today'
  if (iso === tomorrow) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const statusLabel: Record<string, string> = {
  reported: 'Logged',
  assigned: 'Booked',
  in_progress: 'Underway',
  completed: 'Done',
}

export default function VisitDetailPage() {
  const router = useRouter()
  const { ticketId } = useParams<{ ticketId: string }>()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [otherTickets, setOtherTickets] = useState<OtherTicket[]>([])
  const [requests, setRequests] = useState<VisitRequest[]>([])
  const [personId, setPersonId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [respondingAccess, setRespondingAccess] = useState(false)
  const [requestText, setRequestText] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [requestDone, setRequestDone] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        // Auth check — get session token to pass to the API route
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData?.session) { router.push('/login'); return }
        const accessToken = sessionData.session.access_token
        setAccessToken(accessToken)

        // Fetch ticket + other tickets + requests via API route (bypasses RLS safely)
        const res = await fetch(`/api/tenant/visit-ticket?ticketId=${ticketId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          setError(json.error === 'Access denied' ? 'You don\'t have access to this visit.' : 'Visit not found.')
          setLoading(false)
          return
        }
        const json = await res.json()
        setTicket(json.ticket)
        setOtherTickets(json.otherTickets || [])
        setRequests(json.requests || [])
        setPersonId(json.personId)
      } catch (e) {
        console.error(e)
        setError('Something went wrong loading this visit.')
      } finally {
        setLoading(false)
      }
    }
    if (ticketId) load()
  }, [ticketId])

  // ── Short-notice approve/decline ────────────────────────────────────────
  async function respondToAccess(approved: boolean) {
    if (!ticket || !personId) return
    setRespondingAccess(true)
    try {
      if (approved) {
        await supabase
          .from('maintenance_tickets')
          .update({
            short_notice_tenant_approved_at: new Date().toISOString(),
            short_notice_tenant_approved_by: personId,
          })
          .eq('id', ticket.id)
        setTicket(prev => prev ? {
          ...prev,
          short_notice_tenant_approved_at: new Date().toISOString(),
        } : prev)
      } else {
        // Decline: clear the short-notice booking date (move to fallback if available)
        if (ticket.short_notice_pending && ticket.fallback_date) {
          await supabase
            .from('maintenance_tickets')
            .update({
              booked_date: ticket.fallback_date,
              booked_slot: ticket.fallback_slot,
              short_notice_pending: false,
              short_notice: false,
            })
            .eq('id', ticket.id)
          setTicket(prev => prev ? {
            ...prev,
            booked_date: ticket.fallback_date,
            booked_slot: ticket.fallback_slot,
            short_notice_pending: false,
            short_notice: false,
          } : prev)
        } else {
          await supabase
            .from('maintenance_tickets')
            .update({ booked_date: null, booked_slot: null, short_notice: false })
            .eq('id', ticket.id)
          setTicket(prev => prev ? {
            ...prev,
            booked_date: null,
            booked_slot: null,
            short_notice: false,
          } : prev)
        }
      }
    } finally {
      setRespondingAccess(false)
    }
  }

  // ── Submit add-on request ───────────────────────────────────────────────
  async function submitRequest() {
    if (!requestText.trim() || submittingRequest) return
    setSubmittingRequest(true)
    try {
      const res = await fetch('/api/tenant/visit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ ticketId, requestText }),
      })
      if (!res.ok) throw new Error('Failed to submit')
      const json = await res.json()
      setRequests(prev => [json.request, ...prev])
      setRequestText('')
      setRequestDone(true)
    } catch {
      alert('Could not send your request. Please try again.')
    } finally {
      setSubmittingRequest(false)
    }
  }

  // ── Derived state ───────────────────────────────────────────────────────
  const needsShortNoticeApproval = ticket && (
    (ticket.short_notice && !ticket.short_notice_tenant_approved_at) ||
    (ticket.short_notice_pending && !ticket.short_notice_tenant_approved_at)
  )

  const hasFallback = ticket?.short_notice_pending && ticket.fallback_date

  const contractorName = ticket?.contractor
    ? [ticket.contractor.first_name, ticket.contractor.last_name].filter(Boolean).join(' ') || 'Your contractor'
    : null

  const pendingRequest = requests.find(r => r.status === 'pending')
  const canAddRequest = !pendingRequest && ticket?.booked_date && ticket.status !== 'completed'

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/tenant" />} />
        <main className="mx-auto max-w-xl px-lg pt-xl">
          <div className="space-y-md">
            <div className="h-32 rounded-2xl bg-neutral-100 animate-pulse" />
            <div className="h-20 rounded-2xl bg-neutral-100 animate-pulse" />
            <div className="h-20 rounded-2xl bg-neutral-100 animate-pulse" />
          </div>
        </main>
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/tenant" />} />
        <main className="mx-auto max-w-xl px-lg pt-xl text-center">
          <p className="text-4xl mb-md">🔍</p>
          <p className="font-bold text-neutral-700">{error || 'Visit not found'}</p>
          <Link href="/tenant" className="mt-lg inline-block text-sm font-semibold text-neutral-500 underline">
            Back to home
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />

      <main className="mx-auto max-w-xl px-lg pb-2xl pt-md space-y-lg">

        {/* ── Short-notice approval — most prominent element ─────────────── */}
        {needsShortNoticeApproval && (
          <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-lg">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-sm">
              ⚠️ Your approval needed
            </p>
            <p className="text-2xl font-extrabold text-neutral-900 leading-tight">
              {ticket.booked_date ? fmtDate(ticket.booked_date) : 'Short notice'}
            </p>
            {ticket.booked_slot && (
              <p className="text-lg font-semibold text-neutral-700 mt-xs">
                {slotLabel(ticket.booked_slot)}
              </p>
            )}
            <p className="mt-md text-sm text-neutral-700 border-t border-amber-200 pt-md">
              A contractor needs to enter <strong>your room</strong> at less than 24 hours notice.
              We need your approval before anyone can enter.
            </p>
            {hasFallback && (
              <p className="mt-sm text-sm text-neutral-500">
                If you decline, your booking will move to{' '}
                <strong>
                  {ticket.fallback_date ? fmtDate(ticket.fallback_date) : ''}
                  {ticket.fallback_slot ? ` at ${slotLabel(ticket.fallback_slot)}` : ''}
                </strong>.
              </p>
            )}
            <div className="mt-lg flex gap-sm">
              <button
                disabled={respondingAccess}
                onClick={() => respondToAccess(true)}
                className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white active:scale-[0.99] disabled:opacity-50"
              >
                I approve access
              </button>
              <button
                disabled={respondingAccess}
                onClick={() => respondToAccess(false)}
                className="flex-1 rounded-xl border border-neutral-300 bg-white py-md text-sm font-semibold text-neutral-700 active:scale-[0.99] disabled:opacity-50"
              >
                {hasFallback ? 'Use later date' : 'Not suitable'}
              </button>
            </div>
          </div>
        )}

        {/* ── Approval confirmed banner ──────────────────────────────────── */}
        {ticket.short_notice && ticket.short_notice_tenant_approved_at && (
          <div className="rounded-2xl bg-green-50 border border-green-200 p-lg">
            <p className="text-sm font-semibold text-green-800">
              ✅ You approved access for this visit.
            </p>
          </div>
        )}

        {/* ── Visit summary card ─────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-neutral-200 p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">
            {ticket.room_id ? 'Visit to your room' : 'Visit to the house'}
          </p>
          <p className="text-2xl font-extrabold text-neutral-900 leading-tight">
            {ticket.booked_date ? fmtDate(ticket.booked_date) : 'Date TBC'}
          </p>
          {ticket.booked_slot && (
            <p className="text-lg font-semibold text-neutral-600 mt-xs">
              {slotLabel(ticket.booked_slot)}
            </p>
          )}

          <div className="mt-lg space-y-sm border-t border-neutral-100 pt-md">
            {/* Job */}
            <div className="flex gap-sm">
              <span className="text-base shrink-0">🔧</span>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{ticket.title}</p>
                {ticket.description && (
                  <p className="text-sm text-neutral-500 mt-xs">{ticket.description}</p>
                )}
              </div>
            </div>

            {/* Contractor */}
            {contractorName && (
              <div className="flex gap-sm items-center">
                <span className="text-base shrink-0">👷</span>
                <p className="text-sm text-neutral-700">{contractorName}</p>
              </div>
            )}

            {/* Property */}
            {ticket.properties && (
              <div className="flex gap-sm items-center">
                <span className="text-base shrink-0">🏠</span>
                <p className="text-sm text-neutral-700">
                  {ticket.rooms?.name ? `${ticket.rooms.name} · ` : ''}{ticket.properties.name}
                </p>
              </div>
            )}

            {/* Status */}
            <div className="flex gap-sm items-center">
              <span className="text-base shrink-0">📋</span>
              <p className="text-sm text-neutral-700">
                {ticket.arrived_at
                  ? `✓ Arrived ${new Date(ticket.arrived_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                  : statusLabel[ticket.status] ?? ticket.status}
              </p>
            </div>
          </div>
        </div>

        {/* ── Other open tickets in this room ───────────────────────────── */}
        {otherTickets.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">
              Other open jobs in your room
            </h2>
            <div className="space-y-sm">
              {otherTickets.map(t => (
                <div
                  key={t.id}
                  className="rounded-xl border border-neutral-200 bg-white px-md py-sm flex items-center justify-between gap-sm"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-800 truncate">{t.title}</p>
                    <p className="text-xs text-neutral-400 mt-xs">
                      {statusLabel[t.status] ?? t.status}
                      {t.booked_date ? ` · ${new Date(t.booked_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                  </div>
                  <span className="text-neutral-300 shrink-0">›</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Add-on request flow ───────────────────────────────────────── */}
        {canAddRequest && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
            <h2 className="font-bold text-neutral-900 mb-xs">Ask them to also look at…</h2>
            <p className="text-sm text-neutral-500 mb-md">
              If there's something else in your room that needs attention, you can ask the contractor to check it.
              Capital Rooms will review your request before passing it on.
            </p>

            {requestDone ? (
              <div className="rounded-xl bg-green-50 border border-green-200 p-md text-sm font-semibold text-green-800">
                ✅ Request sent — Capital Rooms will review and let you know.
              </div>
            ) : (
              <>
                <textarea
                  value={requestText}
                  onChange={e => setRequestText(e.target.value)}
                  placeholder="e.g. The bathroom tap is also dripping — could they have a quick look?"
                  rows={3}
                  className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-md py-sm text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none resize-none"
                />
                <button
                  disabled={!requestText.trim() || submittingRequest}
                  onClick={submitRequest}
                  className="mt-sm w-full rounded-xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40 active:scale-[0.99]"
                >
                  {submittingRequest ? 'Sending…' : 'Send request'}
                </button>
              </>
            )}
          </section>
        )}

        {/* ── Existing requests ─────────────────────────────────────────── */}
        {requests.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">
              Your add-on requests
            </h2>
            <div className="space-y-sm">
              {requests.map(r => (
                <div
                  key={r.id}
                  className={`rounded-xl border p-md ${
                    r.status === 'approved'
                      ? 'border-green-200 bg-green-50'
                      : r.status === 'declined'
                      ? 'border-neutral-200 bg-neutral-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex items-start gap-sm justify-between">
                    <p className="text-sm text-neutral-800 leading-snug flex-1">{r.request_text}</p>
                    <span className={`shrink-0 text-xs font-bold px-sm py-xs rounded-full ${
                      r.status === 'approved' ? 'bg-green-200 text-green-800'
                      : r.status === 'declined' ? 'bg-neutral-200 text-neutral-600'
                      : 'bg-amber-200 text-amber-800'
                    }`}>
                      {r.status === 'approved' ? '✅ Approved' : r.status === 'declined' ? 'Declined' : '⏳ Pending'}
                    </span>
                  </div>
                  {r.admin_response && (
                    <p className="mt-sm text-sm text-neutral-600 italic">{r.admin_response}</p>
                  )}
                  <p className="mt-xs text-xs text-neutral-400">{timeAgo(r.created_at)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Access info ───────────────────────────────────────────────── */}
        <div className="rounded-xl border border-neutral-200 bg-white p-md">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
            Before the visit
          </p>
          <ul className="space-y-xs text-sm text-neutral-600">
            <li>• Make sure your room is accessible on the day</li>
            <li>• Store any valuables safely before the visit</li>
            <li>• You'll get a notification when the contractor arrives</li>
          </ul>
          <Link
            href="/tenant/property-info"
            className="mt-md inline-block text-xs font-semibold text-neutral-500 underline"
          >
            View house access info →
          </Link>
        </div>

      </main>
    </div>
  )
}

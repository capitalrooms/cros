'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { getActiveTenancy } from '@/lib/tenancy'
import { formatBooking, slotLabel } from '@/lib/booking'
import AppBar from '@/components/AppBar'
import { TenantDashboardSkeleton } from '@/app/components/SkeletonLoading'
import Link from 'next/link'

interface Tenancy {
  start_date: string
  rent_amount: number | null
  rent_due_day: number | null
  properties: { name: string; address: string; id: string } | null
  rooms: { name: string } | null
}

interface PropertyNote {
  id: string
  title: string
  content: string
  note_type: 'cleaner' | 'agent' | 'admin'
  created_at: string
  people: { full_name: string; email: string } | null
}

const todayISO = () => new Date().toISOString().split('T')[0]

function dayLabel(iso: string) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (iso === todayISO()) return 'Today'
  if (iso === tomorrow) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function nextRentDate(dueDay: number | null) {
  if (!dueDay) return null
  const today = new Date()
  const next = new Date(today.getFullYear(), today.getMonth(), dueDay)
  if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    next.setMonth(next.getMonth() + 1)
  }
  return next
}

function daysUntil(date: Date | null) {
  if (!date) return null
  const t = new Date()
  const midnight = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  return Math.round((date.getTime() - midnight.getTime()) / 86400000)
}

export default function TenantDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tenancy, setTenancy] = useState<Tenancy | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessRequests, setAccessRequests] = useState<any[]>([])
  const [personId, setPersonId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [upcoming, setUpcoming] = useState<any[]>([])
  const [notes, setNotes] = useState<PropertyNote[]>([])

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login')
        return
      }
      setUser(data.user)

      const supabase = createClient()
      const a = data.assignment as any

      // Single source of truth: the ACTIVE tenancy. Once its end_date passes,
      // this returns null and every query below is skipped — so a former tenant
      // stops receiving anything automatically, with no admin action needed.
      const active = await getActiveTenancy(a?.id)
      setTenancy(active as any)

      if (!active) {
        setPersonId(a?.id ?? null)
        setRoomId(null)
        setLoading(false)
        return
      }

      if (active.room_id) {
        const { data: reqs } = await supabase
          .from('maintenance_tickets')
          .select('id, category, location, booked_date, booked_slot, rooms(name)')
          .eq('room_id', active.room_id)
          .eq('short_notice', true)
          .is('short_notice_tenant_approved_at', null)
          .not('booked_date', 'is', null)
        setAccessRequests(reqs || [])
      }

      if (a?.property_id) {
        const { data: up } = await supabase
          .from('maintenance_tickets')
          .select('id, category, location, room_id, booked_date, booked_slot, status, rooms(name)')
          .eq('property_id', a.property_id)
          .gte('booked_date', todayISO())
          .neq('status', 'completed')
          .order('booked_date')
        setUpcoming(up || [])

        // Fetch property notes
        const res = await fetch(`/api/property-notes?propertyId=${a.property_id}`)
        if (res.ok) {
          const { notes: propertyNotes } = await res.json()
          setNotes(propertyNotes || [])
        }
      }

      setPersonId(a?.id ?? null)
      setRoomId(active.room_id ?? null)
      setLoading(false)
    }
    checkAuth()
  }, [router])

  async function respondToAccess(ticketId: string, approved: boolean) {
    const supabase = createClient()
    if (approved) {
      await supabase
        .from('maintenance_tickets')
        .update({
          short_notice_tenant_approved_at: new Date().toISOString(),
          short_notice_tenant_approved_by: personId,
        })
        .eq('id', ticketId)
    } else {
      await supabase
        .from('maintenance_tickets')
        .update({ booked_date: null, booked_slot: null, short_notice: false })
        .eq('id', ticketId)
    }
    setAccessRequests((prev) => prev.filter((r) => r.id !== ticketId))
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  if (loading) {
    return <TenantDashboardSkeleton />
  }

  const rentDate = nextRentDate(tenancy?.rent_due_day ?? null)
  const rentIn = daysUntil(rentDate)

  const inMyRoom = upcoming.filter((u) => u.room_id === roomId)
  const atProperty = upcoming.filter((u) => u.room_id !== roomId)
  const nextVisit = upcoming[0]
  const nextIsMyRoom = nextVisit?.room_id === roomId

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <button
            onClick={handleSignOut}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Dark band, matching the contractor view */}
        <section
          className="-mb-3xl bg-neutral-950 pb-3xl text-white"
          style={{ marginInline: '-16px', paddingInline: '16px' }}
        >
          <p className="pt-lg text-xs font-medium uppercase tracking-widest text-white/40">
            Your tenancy
          </p>
          <p className="mt-xs text-xl font-bold leading-tight">
            {tenancy?.rooms?.name ? `${tenancy.rooms.name}, ` : ''}
            {tenancy?.properties?.name ?? 'No active tenancy'}
          </p>
          <p className="text-sm text-white/50">{tenancy?.properties?.address}</p>

          {tenancy && (
            <div className="mt-lg grid grid-cols-3 gap-md border-t border-white/15 pt-lg">
              <Stat
                label="Rent"
                value={
                  tenancy.rent_amount != null
                    ? `£${Number(tenancy.rent_amount).toLocaleString('en-GB')}`
                    : '—'
                }
                sub="per month"
              />
              <Stat
                label="Next due"
                value={
                  rentDate
                    ? rentDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : '—'
                }
                sub={rentIn === 0 ? 'today' : rentIn != null ? `in ${rentIn} days` : ''}
              />
              <Stat
                label="Started"
                value={
                  tenancy.start_date
                    ? new Date(tenancy.start_date).toLocaleDateString('en-GB', {
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'
                }
                sub="contract"
              />
            </div>
          )}

          {/*
            Access approval is the loudest thing on this screen. Someone entering
            your bedroom is a big deal and it happens rarely — it must not read
            like another row in a list.
          */}
          {accessRequests.map((req) => (
            <div key={req.id} className="mt-lg rounded-2xl bg-white p-lg text-neutral-900 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Your approval needed
              </p>
              <p className="mt-sm text-3xl font-bold leading-tight">
                {dayLabel(req.booked_date)}
              </p>
              <p className="text-xl font-semibold text-neutral-700">{slotLabel(req.booked_slot)}</p>

              <p className="mt-lg border-t border-neutral-200 pt-md text-sm">
                Someone needs to come into <strong>your room</strong> for{' '}
                {String(req.category ?? '').replace(/-/g, ' ')} work.
              </p>
              <p className="mt-xs text-sm text-neutral-500">
                This is less than 24 hours away, so we need your approval before anyone enters.
              </p>

              <div className="mt-lg flex gap-sm">
                <button
                  onClick={() => respondToAccess(req.id, true)}
                  className="flex-1 rounded-xl bg-neutral-950 py-md text-sm font-bold text-white active:scale-[0.99]"
                >
                  I approve access
                </button>
                <button
                  onClick={() => respondToAccess(req.id, false)}
                  className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-semibold"
                >
                  Not suitable
                </button>
              </div>
            </div>
          ))}

          {/* Next visit, given the same weight as the contractor's next job */}
          {accessRequests.length === 0 && nextVisit && (
            <div className="mt-lg rounded-2xl bg-white p-lg text-neutral-900 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                {nextIsMyRoom ? 'Coming into your room' : 'Coming to your house'}
              </p>
              <p className="mt-sm text-3xl font-bold leading-tight">
                {dayLabel(nextVisit.booked_date)}
              </p>
              <p className="text-xl font-semibold text-neutral-700">
                {slotLabel(nextVisit.booked_slot)}
              </p>
              <p className="mt-lg border-t border-neutral-200 pt-md text-sm text-neutral-600">
                {String(nextVisit.category ?? '').replace(/-/g, ' ')} —{' '}
                {nextVisit.rooms?.name ?? nextVisit.location}
              </p>
            </div>
          )}

          {accessRequests.length === 0 && !nextVisit && (
            <p className="mt-lg rounded-2xl border border-white/15 p-lg text-sm text-white/50">
              Nothing booked at your property right now.
            </p>
          )}
        </section>

        <section className="mt-3xl pt-md">
          <h2 className="text-xl font-bold text-neutral-900">What&apos;s coming up</h2>
          <div className="mt-md grid gap-md md:grid-cols-2">
            <UpcomingPanel
              title="In your room"
              items={inMyRoom}
              emptyText="No appointments in your room"
            />
            <UpcomingPanel
              title="At your property"
              items={atProperty}
              emptyText="Nothing booked at the property"
            />
          </div>
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Property notes</h2>
          {notes.length === 0 ? (
            <p className="mt-md text-sm text-neutral-400">
              No notes yet. Cleaners, agents, and admins can post updates here.
            </p>
          ) : (
            <div className="mt-md space-y-md">
              {notes.map((note) => (
                <PropertyNoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Anything wrong?</h2>
          <div className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            <ActionCard
              href="/tenant/maintenance"
              title="Report an issue"
              description="Something broken or not working"
              primary
            />
            <ActionCard
              href="/tenant/requests"
              title="My requests"
              description="Track what you've reported"
            />
            <ActionCard title="House notices" description="Updates for your house" />
            <ActionCard title="Give notice" description="Planning to move out" />
          </div>
          <p className="mt-lg text-xs text-neutral-400">{user?.email}</p>
        </section>
      </main>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-xs text-base font-semibold">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  )
}

function UpcomingPanel({
  title,
  items,
  emptyText,
}: {
  title: string
  items: any[]
  emptyText: string
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-md text-sm text-neutral-400">{emptyText}</p>
      ) : (
        <ul className="mt-md space-y-md">
          {items.map((item) => (
            <li key={item.id} className="border-l-2 border-neutral-900 pl-md">
              <p className="text-sm font-bold text-neutral-900">
                {formatBooking(item.booked_date, item.booked_slot)}
              </p>
              <p className="text-sm text-neutral-500">
                {String(item.category ?? '').replace(/-/g, ' ')} —{' '}
                {item.rooms?.name ?? item.location}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ActionCard({
  href,
  title,
  description,
  primary,
}: {
  href?: string
  title: string
  description: string
  primary?: boolean
}) {
  const body = (
    <div
      className={`h-full rounded-2xl border p-lg transition-all ${
        href
          ? 'cursor-pointer border-neutral-900 border-2 bg-white hover:shadow-md'
          : 'border-neutral-200 bg-white/50'
      }`}
    >
      <h3 className={`font-bold ${href ? 'text-neutral-900' : 'text-neutral-400'}`}>{title}</h3>
      <p className={`mt-xs text-sm ${href ? 'text-neutral-600' : 'text-neutral-400'}`}>
        {href ? description : 'Coming soon'}
      </p>
      {primary && (
        <p className="mt-md rounded-xl bg-neutral-950 py-md text-center text-sm font-bold text-white">
          Report now
        </p>
      )}
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

function PropertyNoteCard({ note }: { note: PropertyNote }) {
  const typeColors = {
    cleaner: 'bg-green-50 border-green-200',
    agent: 'bg-blue-50 border-blue-200',
    admin: 'bg-purple-50 border-purple-200',
  }

  const typeLabels = {
    cleaner: '🧹 Cleaner Note',
    agent: '🏠 Agent Note',
    admin: '⚙️ Admin Update',
  }

  const createdDate = new Date(note.created_at).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`rounded-xl border p-lg ${typeColors[note.note_type]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
            {typeLabels[note.note_type]}
          </p>
          <p className="mt-xs text-sm font-bold text-neutral-900">{note.title}</p>
          <p className="mt-md text-sm text-neutral-700 whitespace-pre-wrap">{note.content}</p>
          <p className="mt-md text-xs text-neutral-500">
            {note.people?.full_name || 'Unknown'} • {createdDate}
          </p>
        </div>
      </div>
    </div>
  )
}

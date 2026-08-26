'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { getActiveTenancy } from '@/lib/tenancy'
import { formatBooking, slotLabel } from '@/lib/booking'
import AppBar from '@/components/AppBar'
import EnableNotifications from '@/app/components/EnableNotifications'
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
  room_id: string | null
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

/** A live "the contractor is on it" line for a visit the tenant can see, or null. */
function liveStatus(item: any): string | null {
  if (item?.status === 'in_progress') return '🔨 Work underway'
  if (item?.arrived_at)
    return `✓ Arrived ${new Date(item.arrived_at).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  return null
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
  const [compliance, setCompliance] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])

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
          .select('id, category, location, room_id, booked_date, booked_slot, status, arrived_at, rooms(name)')
          .eq('property_id', a.property_id)
          .gte('booked_date', todayISO())
          .neq('status', 'completed')
          .order('booked_date')

        // Communal cleans booked by the cleaner are property-wide visits too, so
        // they belong alongside repairs under "at your property". They carry no
        // room, so the room/property split places them correctly on their own.
        const { data: cleansData } = await supabase
          .from('cleans')
          .select('id, clean_date, clean_time, status')
          .eq('property_id', a.property_id)
          .eq('notify_tenants', true)
          .gte('clean_date', todayISO())
          .neq('status', 'completed')

        const cleanItems = (cleansData || []).map((c: any) => ({
          id: `clean-${c.id}`,
          category: 'Communal clean',
          location: c.clean_time ? String(c.clean_time).slice(0, 5) : 'Whole house',
          room_id: null,
          booked_date: c.clean_date,
          booked_slot: null,
          status: c.status,
          rooms: null,
        }))

        // Viewings raised by lettings/admin. The whole house should know a viewing
        // is happening; only the tenant whose own room it is sees it as theirs.
        // We don't name the room to other tenants — a viewing outs the leaver.
        const { data: viewingsData } = await supabase
          .from('viewings')
          .select('id, viewing_date, viewing_slot, room_id, viewing_status, rooms(name, property_id)')
          .eq('viewing_status', 'scheduled')
          .gte('viewing_date', todayISO())

        const viewingItems = (viewingsData || [])
          .filter((v: any) => v.rooms?.property_id === a.property_id)
          .map((v: any) => {
            // viewing_slot may be a 3-hour code ("12-15") or a 15-min time ("10:30").
            const time = v.viewing_slot ? slotLabel(v.viewing_slot) || v.viewing_slot : ''
            return {
              id: `viewing-${v.id}`,
              category: 'Viewing',
              location: time ? `A prospective tenant · ${time}` : 'A prospective tenant',
              room_id: v.room_id,
              booked_date: v.viewing_date,
              booked_slot: null,
              status: v.viewing_status,
              rooms: null,
            }
          })

        // Property appointments (inspections, gas safety, landlord visits…) the
        // admin booked and chose to notify tenants about. These belong in the
        // tenant's "what's coming up" just like a repair or clean.
        // NB: the live property_appointments table has no room_id column, so
        // these are treated as property-wide (they land under "at your property").
        const { data: apptData } = await supabase
          .from('property_appointments')
          .select('id, appointment_type, appointment_date, appointment_time, visitor_name, notify_tenants')
          .eq('property_id', a.property_id)
          .eq('notify_tenants', true)
          .gte('appointment_date', todayISO())

        const apptItems = (apptData || []).map((ap: any) => ({
          id: `appt-${ap.id}`,
          category: String(ap.appointment_type || 'appointment').replace(/_/g, ' '),
          location: ap.appointment_time ? String(ap.appointment_time).slice(0, 5) : (ap.visitor_name || 'Appointment'),
          room_id: null,
          booked_date: ap.appointment_date,
          booked_slot: ap.appointment_time ? String(ap.appointment_time).slice(0, 5) : null,
          status: 'scheduled',
          rooms: null,
        }))

        const merged = [...(up || []), ...cleanItems, ...viewingItems, ...apptItems].sort((x, y) =>
          String(x.booked_date ?? '').localeCompare(String(y.booked_date ?? ''))
        )
        setUpcoming(merged)

        // Fetch property notes
        const res = await fetch(`/api/property-notes?propertyId=${a.property_id}`)
        if (res.ok) {
          const { notes: propertyNotes } = await res.json()
          setNotes(propertyNotes || [])
        }
      }

      // Property safety certificates — shown to the tenant as reassurance.
      const { data: prop } = await supabase
        .from('properties')
        .select('gas_safe_cert_expiry, electrical_cert_expiry')
        .eq('id', active.property_id)
        .maybeSingle()
      setCompliance(prop || null)

      // Notifications sent to this tenant (Quick Notify, cleaner/lettings alerts).
      // RLS scopes this to the logged-in tenant, so no filter is needed here.
      const { data: notifs } = await supabase
        .from('notifications')
        .select('id, title, body, type, link, read, created_at')
        .order('created_at', { ascending: false })
        .limit(20)
      setMessages(notifs || [])

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

  async function markMessagesRead() {
    const unread = messages.filter((m) => !m.read).map((m) => m.id)
    if (unread.length === 0) return
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })))
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).in('id', unread)
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

      <main className="mx-auto max-w-6xl px-lg pb-2xl">
        {/* Dark band butts against the app bar (no light gap between them) */}
        <section
          className="-mb-3xl bg-neutral-900 pb-3xl text-white"
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
                  className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white active:scale-[0.99]"
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
                {nextIsMyRoom ? 'Visiting your room' : 'Coming to your house'}
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
              {liveStatus(nextVisit) && (
                <p className="mt-md inline-block rounded-full bg-green-100 px-md py-xs text-sm font-bold text-green-800">
                  {liveStatus(nextVisit)}
                </p>
              )}
            </div>
          )}

          {accessRequests.length === 0 && !nextVisit && (
            <p className="mt-lg rounded-2xl border border-white/15 p-lg text-sm text-white/50">
              Nothing booked at your property right now.
            </p>
          )}
        </section>

        {/* Sits below the dark hero, which pulls the next element up by -mb-3xl;
            the extra pt clears that overlap so the button isn't cramped against it. */}
        <div className="mt-3xl pt-lg">
          <EnableNotifications />
        </div>

        {messages.length > 0 && (
          <section className="mt-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">
                Messages
                {messages.some((m) => !m.read) && (
                  <span className="ml-sm rounded-full bg-blue-600 px-sm py-0.5 text-xs font-bold text-white align-middle">
                    {messages.filter((m) => !m.read).length} new
                  </span>
                )}
              </h2>
              {messages.some((m) => !m.read) && (
                <button onClick={markMessagesRead} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900">
                  Mark all read
                </button>
              )}
            </div>
            <div className="mt-md space-y-md">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-2xl border p-lg ${
                    m.read ? 'border-neutral-200 bg-white' : 'border-blue-300 bg-blue-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-md">
                    <p className="font-bold text-neutral-900">{m.title}</p>
                    {!m.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                  </div>
                  {m.body && <p className="mt-xs text-sm text-neutral-700 whitespace-pre-wrap">{m.body}</p>}
                  <p className="mt-md text-xs text-neutral-400">
                    {new Date(m.created_at).toLocaleDateString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-3xl pt-md">
          <h2 className="text-xl font-bold text-neutral-900">What&apos;s coming up</h2>
          <div className="mt-md grid gap-md md:grid-cols-2">
            <UpcomingPanel
              title="Visits to your room"
              items={inMyRoom}
              emptyText="No visits scheduled for your room"
            />
            <UpcomingPanel
              title="At your property"
              items={atProperty}
              emptyText="Nothing booked at the property"
            />
          </div>
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Meet your housemates</h2>
          <p className="mt-xs text-sm text-neutral-500">
            Say hello and see who else lives here.
          </p>
          <div className="mt-md grid gap-md sm:grid-cols-2">
            <ActionCard
              href="/tenant/housemates"
              title="Meet your housemates"
              description="See who you share the house with"
            />
            <ActionCard
              href="/tenant/icebreaker"
              title="Your profile"
              description="A few light questions about you"
            />
          </div>
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Property notes</h2>
          {(() => {
            // House-wide notes reach everyone; a room-specific note only its own room.
            const visibleNotes = notes.filter((n) => !n.room_id || n.room_id === roomId)
            return visibleNotes.length === 0 ? (
              <p className="mt-md text-sm text-neutral-400">
                No notes yet. Cleaners, agents, and admins can post updates here.
              </p>
            ) : (
              <div className="mt-md space-y-md">
                {visibleNotes.map((note) => (
                  <PropertyNoteCard key={note.id} note={note} isForMyRoom={!!note.room_id} />
                ))}
              </div>
            )
          })()}
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Guides &amp; Property Safety</h2>
          <p className="mt-xs text-sm text-neutral-500">
            Your home&apos;s safety certificates and a few handy guides.
          </p>
          <div className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            <SafetyCard
              title="Gas safety certificate"
              expiry={compliance?.gas_safe_cert_expiry}
            />
            <SafetyCard
              title="Electrical safety (EICR)"
              expiry={compliance?.electrical_cert_expiry}
            />
            <GuideCard title="Preventing damp &amp; mould" emoji="🪟" />
            <GuideCard title="Fire safety in your home" emoji="🔥" />
            <GuideCard title="Using the fire blanket" emoji="🧯" />
          </div>
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Safety Checks</h2>
          <p className="mt-xs text-sm text-neutral-500">
            Monthly checks on fire doors and smoke alarms help keep your home safe.
          </p>
          <div className="mt-md">
            <ActionCard
              href="/tenant/safety-checks"
              title="Safety Checks"
              description="Fire door & smoke alarm checks"
              primary
            />
          </div>
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Property Information</h2>
          <p className="mt-xs text-sm text-neutral-500">
            Evacuation plans, emergency contacts, and house information
          </p>
          <div className="mt-md">
            <ActionCard
              href="/tenant/property-info"
              title="Property Documents"
              description="Safety plans, emergency contacts, utilities"
            />
          </div>
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Important Notices</h2>
          <p className="mt-xs text-sm text-neutral-500">
            Messages from your landlord that may need your acknowledgment
          </p>
          <div className="mt-md">
            <ActionCard
              href="/tenant/acknowledgment-notes"
              title="Important Notices"
              description="Messages requiring your acknowledgment"
            />
          </div>
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Anything wrong?</h2>
          <p className="mt-xs text-sm text-neutral-500">
            Report something that needs fixing, or check on what you&apos;ve already reported.
          </p>
          <div className="mt-md grid gap-md sm:grid-cols-2">
            <ActionCard
              href="/tenant/maintenance-choose"
              title="Report an issue"
              description="Something broken or not working"
              primary
            />
            <ActionCard
              href="/tenant/requests"
              title="My requests"
              description="Track what you've reported"
            />
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
              {liveStatus(item) && (
                <p className="mt-xs text-xs font-bold text-green-700">{liveStatus(item)}</p>
              )}
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
        <p className="mt-md rounded-xl bg-neutral-900 py-md text-center text-sm font-bold text-white">
          Report now
        </p>
      )}
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

function SafetyCard({ title, expiry }: { title: string; expiry?: string | null }) {
  // Reassurance, not alarm: while a renewal is pending we still show the cert as
  // on file rather than flashing "out of date" at the tenant.
  const inDate = !!expiry && new Date(expiry) >= new Date()
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <p className="text-sm font-bold text-neutral-900">{title}</p>
      {inDate ? (
        <p className="mt-sm text-sm font-semibold text-green-700">
          ✓ In date · valid to{' '}
          {new Date(expiry!).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
        </p>
      ) : (
        <p className="mt-sm text-sm text-neutral-500">
          On file with your agent{expiry ? ' · renewal in progress' : ''}
        </p>
      )}
    </div>
  )
}

const GUIDE_TIPS: Record<string, string> = {
  'Preventing damp & mould':
    'Wipe condensation off windows, keep trickle vents open, and ventilate when drying washing indoors.',
  'Fire safety in your home':
    'Keep escape routes clear, never wedge fire doors open, and test your smoke alarms monthly.',
  'Using the fire blanket':
    'Kept by the kitchen. Pull the tabs, hold it in front of you, and smother the flames — never move a burning pan.',
}

function GuideCard({ title, emoji }: { title: string; emoji: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <p className="text-2xl">{emoji}</p>
      <p className="mt-sm text-sm font-bold text-neutral-900">{title}</p>
      <p className="mt-xs text-xs text-neutral-600">{GUIDE_TIPS[title]}</p>
    </div>
  )
}

function PropertyNoteCard({ note, isForMyRoom }: { note: PropertyNote; isForMyRoom?: boolean }) {
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
            {isForMyRoom && <span className="ml-sm text-neutral-500">· Your room</span>}
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

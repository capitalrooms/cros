'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser, signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import { displayName } from '@/lib/people'
import RoleGreeting from '@/app/components/RoleGreeting'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import SendOfferForm from '@/components/SendOfferForm'
import LettingsDiaryView from '@/app/components/LettingsDiaryView'
import UpcomingList, { UpcomingItem } from '@/app/components/UpcomingList'
import AddLetOnlyModal from '@/app/components/AddLetOnlyModal'
import RoomDetailTags from '@/app/components/RoomDetailTags'

interface AvailableRoom {
  id: string
  name: string
  property_id: string
  property_name: string
  property_address: string
  current_asking_rent: number | null
  available_date: string | null
  days_on_market: number | null
  is_let_only?: boolean
  has_ensuite?: boolean | null
  has_shared_bathroom?: boolean | null
  has_lounge?: boolean | null
}

interface BookingRoom {
  id: string
  name: string
  property_id: string
  properties: { id: string; name: string } | null
}

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '1½ hours', value: 90 },
  { label: '2 hours', value: 120 },
]

const blankViewingForm = (date = '', time = '') => ({
  room_id: '',
  viewing_date: date,
  viewing_slot: time,
  duration_minutes: 60,
  visitor_name: '',
  visitor_email: '',
  visitor_phone: '',
  feedback: '',
  notifyTenants: true,
  notifyMessage: '',
})

function defaultNotifyMsg(propertyName: string, date: string, time: string) {
  const d = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
  const t = time ? ` at ${time}` : ''
  const prop = propertyName || 'the property'
  return `🔑 A viewing has been arranged at ${prop} on ${d}${t}. We will have a management set of keys for access. Thank you for your hospitality whilst we visit and we hope not to disturb you for too long.`
}

export default function LettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [viewings, setViewings] = useState<any[]>([])
  const [bookingRooms, setBookingRooms] = useState<BookingRoom[]>([])
  const [showAddLetOnly, setShowAddLetOnly] = useState(false)
  const [personId, setPersonId] = useState<string | undefined>()
  const [addingViewing, setAddingViewing] = useState(false)
  const [viewingForm, setViewingForm] = useState(blankViewingForm())
  const [savingViewing, setSavingViewing] = useState(false)
  const [viewingBanner, setViewingBanner] = useState('')
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const [calendarJumpDate, setCalendarJumpDate] = useState<string | undefined>()

  // Invite to Apply modal
  const [inviteViewing, setInviteViewing] = useState<any | null>(null)
  const [inviteMethod, setInviteMethod] = useState<'email' | 'sms' | 'both'>('email')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteResult, setInviteResult] = useState<any | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data) {
        router.push('/login')
        return
      }
      // Role guard — only lettings agents and admins may access this page
      const role = data.assignment?.role
      if (!['lettings', 'administrator', 'admin'].includes(role)) {
        router.push('/login')
        return
      }
      // Friendly greeting name + person id for created_by on let-only listings
      if (data.user?.email) {
        const { data: person } = await supabase
          .from('people')
          .select('id, full_name, first_name, last_name')
          .eq('email', data.user.email)
          .maybeSingle()
        setName(displayName(person) || data.user.email.split('@')[0] || '')
        setPersonId(person?.id)
      }
      await loadData()

      // Load rooms for the inline booking modal
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, name, property_id, properties(id, name)')
        .order('name')
      setBookingRooms((roomsData as any) || [])

      setLoading(false)
    }
    init()
  }, [router])

  async function loadData() {
    // Load upcoming viewings for the calendar
    const today = new Date().toISOString().split('T')[0]
    const { data: viewingsData } = await supabase
      .from('viewings')
      .select('id, viewing_date, viewing_slot, duration_minutes, visitor_name, property_id, room_id, properties(name), rooms(name)')
      .gte('viewing_date', today)
      .order('viewing_date', { ascending: true })
      .limit(50)
    setViewings(viewingsData || [])

    const { data: availableData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, available_date, marketing_status, days_on_market, has_ensuite, has_shared_bathroom, has_lounge, properties(name, address)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    // Let-only rooms from active listings
    const { data: letOnlyData } = await supabase
      .from('let_only_rooms')
      .select('id, room_name, monthly_rent, available_date, has_ensuite, has_shared_bathroom, has_lounge, let_only_listings(id, address, postcode, is_active)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    const managed = (availableData || []).map((room: any) => ({
      id: room.id,
      name: room.name,
      property_id: room.property_id,
      property_name: room.properties?.name || 'Unknown',
      property_address: room.properties?.address || '',
      current_asking_rent: room.current_asking_rent,
      available_date: room.available_date,
      days_on_market: room.days_on_market,
      has_ensuite: room.has_ensuite,
      has_shared_bathroom: room.has_shared_bathroom,
      has_lounge: room.has_lounge,
    }))

    const letOnly = (letOnlyData || [])
      .filter((r: any) => r.let_only_listings?.is_active)
      .map((r: any) => {
        const listing = r.let_only_listings
        return {
          id: r.id,
          name: r.room_name,
          property_id: listing.id,
          property_name: listing.address,
          property_address: listing.postcode ? `${listing.address}, ${listing.postcode}` : listing.address,
          current_asking_rent: r.monthly_rent,
          available_date: r.available_date,
          days_on_market: null,
          is_let_only: true,
          has_ensuite: r.has_ensuite,
          has_shared_bathroom: r.has_shared_bathroom,
          has_lounge: r.has_lounge,
        }
      })

    setAvailableRooms([...managed, ...letOnly])
  }

  async function handleCreateViewing() {
    if (!viewingForm.viewing_date || !viewingForm.room_id) {
      setViewingBanner('A date and room are required')
      return
    }
    setSavingViewing(true)
    try {
      const room = bookingRooms.find(r => r.id === viewingForm.room_id)
      const { error } = await supabase.from('viewings').insert({
        room_id: viewingForm.room_id,
        property_id: room?.property_id ?? '',
        viewing_date: viewingForm.viewing_date,
        viewing_slot: viewingForm.viewing_slot || null,
        duration_minutes: viewingForm.duration_minutes,
        visitor_name: viewingForm.visitor_name || null,
        visitor_email: viewingForm.visitor_email || null,
        visitor_phone: viewingForm.visitor_phone || null,
        feedback: viewingForm.feedback || null,
        viewing_status: 'scheduled',
      })
      if (error) throw new Error(error.message)

      // Notify tenants if requested (push + in-app for managed tenants)
      if (viewingForm.notifyTenants && room?.property_id) {
        const msg = viewingForm.notifyMessage ||
          defaultNotifyMsg(room.properties?.name || '', viewingForm.viewing_date, viewingForm.viewing_slot)
        await fetch('/api/cleaner/quick-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: room.property_id,
            subject: 'Viewing arranged',
            message: msg,
            notification_type: 'viewing',
          }),
        }).catch(() => {/* best-effort */})
      }

      // Also email let-only contacts if this room is part of a let-only listing
      if (viewingForm.notifyTenants && viewingForm.room_id) {
        const { data: letOnlyRoom } = await supabase
          .from('let_only_rooms')
          .select('let_only_listings(id, is_active)')
          .eq('room_id', viewingForm.room_id)
          .maybeSingle()
        const listing = (letOnlyRoom as any)?.let_only_listings
        if (listing?.is_active) {
          await fetch('/api/let-only/notify-contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listing_id: listing.id,
              event: 'booked',
              viewing_date: viewingForm.viewing_date,
              viewing_time: viewingForm.viewing_slot || '09:00',
              room_name: room?.name,
              sender_name: name,
            }),
          }).catch(() => {/* best-effort */})
        }
      }

      setAddingViewing(false)
      setViewingForm(blankViewingForm())
      await loadData()
      setViewingBanner(viewingForm.notifyTenants ? '✅ Viewing booked & tenants notified' : '✅ Viewing booked')
      setTimeout(() => setViewingBanner(''), 4000)
    } catch (err) {
      setViewingBanner(err instanceof Error ? err.message : 'Failed to book viewing')
    } finally {
      setSavingViewing(false)
    }
  }

  const sendInvite = async () => {
    if (!inviteViewing) return
    setInviteSending(true)
    setInviteResult(null)
    const res = await fetch('/api/lettings/invite-to-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewingId: inviteViewing.id, method: inviteMethod }),
    })
    setInviteResult(await res.json())
    setInviteSending(false)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <div className="flex items-center gap-md">
            <a href="/lettings/profile" className="shrink-0 transition-colors hover:opacity-80 flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10" title="Profile settings">
              <span className="text-lg leading-none">⚙️</span>
            </a>
            <button onClick={async () => { await signOut(); router.push('/login') }} className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm">
              <span>👋</span> Sign out
            </button>
          </div>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Greeting — shared across every role dashboard */}
        <RoleGreeting role="Lettings Dashboard" name={name} subtitle="Ready to let some properties!" />

        {/* Success / error banner */}
        {viewingBanner && (
          <div className="mb-md rounded-xl border border-green-200 bg-green-50 px-lg py-sm text-sm font-semibold text-green-800">
            {viewingBanner}
          </div>
        )}

        {/* Lettings Diary — single-day view with week strip */}
        <div ref={calendarRef}>
          <LettingsDiaryView
            jumpToDate={calendarJumpDate}
            appointments={viewings.map((v: any) => {
              const roomLabel = v.rooms?.name
              const propLabel = v.properties?.name || ''
              const primaryTitle = roomLabel ? `${roomLabel} — ${propLabel}` : (propLabel || '🔑 Viewing')
              return {
                id: v.id,
                viewing_date: v.viewing_date,
                start_time: v.viewing_slot ? v.viewing_slot.slice(0, 5) : undefined,
                duration_minutes: v.duration_minutes ?? 60,
                title: primaryTitle,
                room_name: 'Viewing',
                property_name: propLabel,
                property_id: v.property_id || '',
              }
            })}
            onSlotTap={(date, time) => {
              setViewingForm(blankViewingForm(date, time))
              setAddingViewing(true)
            }}
            onAppointmentReschedule={async (id, newDate, newTime, notifyOpts) => {
              await supabase
                .from('viewings')
                .update({ viewing_date: newDate, viewing_slot: newTime })
                .eq('id', id)
              if (notifyOpts?.notify && notifyOpts.propertyId && notifyOpts.message) {
                await fetch('/api/cleaner/quick-notify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    property_id: notifyOpts.propertyId,
                    subject: 'Viewing rescheduled',
                    message: notifyOpts.message,
                    notification_type: 'viewing',
                  }),
                })
              }
              setViewings(prev => prev.map((v: any) =>
                v.id === id ? { ...v, viewing_date: newDate, viewing_slot: newTime } : v
              ))
            }}
          />
        </div>

        {/* All upcoming viewings */}
        <UpcomingList
          title="All upcoming viewings"
          emptyMessage="No viewings booked yet — tap a slot in the calendar above to add one."
          items={[...viewings]
            .filter(v => v.viewing_date)
            .sort((a: any, b: any) => a.viewing_date.localeCompare(b.viewing_date))
            .map((v: any): UpcomingItem => ({
              id: v.id,
              date: v.viewing_date,
              time: v.viewing_slot ? String(v.viewing_slot).slice(0, 5) : undefined,
              label: v.properties?.name || 'Property',
              sublabel: v.visitor_name ? `👤 ${v.visitor_name}` : undefined,
              badge: v.viewing_status || undefined,
              badgeColor: v.viewing_status === 'completed' ? 'bg-green-100 text-green-700'
                : v.viewing_status === 'scheduled' ? 'bg-blue-100 text-blue-700'
                : 'bg-neutral-100 text-neutral-600',
            }))}
          onItemClick={(item) => {
            setCalendarJumpDate(item.date)
            calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />

        {/* Invite to Apply — per-viewing quick-send strip */}
        {viewings.length > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
            <h2 className="text-base font-semibold text-neutral-900 mb-md">📨 Invite to Apply</h2>
            <div className="space-y-sm">
              {[...viewings]
                .filter(v => v.viewing_date)
                .sort((a: any, b: any) => b.viewing_date.localeCompare(a.viewing_date))
                .slice(0, 8)
                .map((v: any) => {
                  const room = v.rooms?.name || v.properties?.name || 'Viewing'
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-md py-sm border-b border-neutral-100 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">
                          {v.visitor_name || 'Unknown'} — {room}
                        </p>
                        <p className="text-xs text-neutral-400">{v.viewing_date}{v.viewing_slot ? ` · ${String(v.viewing_slot).slice(0,5)}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-xs shrink-0">
                        {v.visitor_email && <span className="text-xs bg-blue-50 text-blue-600 px-xs py-0.5 rounded">✉</span>}
                        {v.visitor_phone && <span className="text-xs bg-green-50 text-green-600 px-xs py-0.5 rounded">📱</span>}
                        <button
                          onClick={() => { setInviteViewing(v); setInviteResult(null); setInviteMethod('email') }}
                          className="text-xs font-semibold bg-neutral-900 text-white px-sm py-xs rounded-lg hover:bg-neutral-700 transition-colors"
                        >
                          Invite
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Invite to Apply modal */}
        {inviteViewing && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-lg pb-lg sm:p-lg" onClick={() => setInviteViewing(null)}>
            <div className="bg-white rounded-2xl p-lg w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-md">
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Invite to Apply</h3>
                  <p className="text-sm text-neutral-500">{inviteViewing.visitor_name} · {inviteViewing.rooms?.name || inviteViewing.properties?.name}</p>
                </div>
                <button onClick={() => setInviteViewing(null)} className="text-neutral-400 hover:text-neutral-700 text-lg font-bold">✕</button>
              </div>

              {/* Method picker */}
              <div className="grid grid-cols-3 gap-sm mb-md">
                {(['email', 'sms', 'both'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setInviteMethod(m)}
                    className={`p-sm rounded-lg border-2 text-xs font-semibold transition-all ${inviteMethod === m ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'}`}
                  >
                    {m === 'email' ? '✉ Email' : m === 'sms' ? '📱 SMS' : '✉+📱 Both'}
                  </button>
                ))}
              </div>

              {/* Contact preview */}
              <div className="bg-neutral-50 rounded-lg p-sm mb-md text-xs space-y-xs text-neutral-600">
                <div><span className="font-medium w-14 inline-block">Email</span>{inviteViewing.visitor_email || <span className="italic text-neutral-400">not recorded</span>}</div>
                <div><span className="font-medium w-14 inline-block">Phone</span>{inviteViewing.visitor_phone || <span className="italic text-neutral-400">not recorded</span>}</div>
              </div>

              <button
                onClick={sendInvite}
                disabled={inviteSending}
                className="w-full bg-neutral-900 text-white py-sm rounded-xl font-semibold text-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors mb-sm"
              >
                {inviteSending ? 'Sending…' : 'Send Invitation'}
              </button>

              {inviteResult && (
                <div className="space-y-xs text-sm">
                  {inviteResult.emailSent && <p className="text-green-700 font-medium">✓ Email sent to {inviteViewing.visitor_email}</p>}
                  {inviteResult.emailError && <p className="text-amber-700">⚠ Email: {inviteResult.emailError}</p>}
                  {inviteResult.smsSent && <p className="text-green-700 font-medium">✓ SMS sent to {inviteViewing.visitor_phone}</p>}
                  {inviteResult.smsError && <p className="text-amber-700">⚠ SMS: {inviteResult.smsError}</p>}
                  {inviteResult.link && (
                    <div className="flex gap-sm mt-xs">
                      <p className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded px-sm py-xs flex-1 break-all">{inviteResult.link}</p>
                      <button
                        onClick={async () => { await navigator.clipboard.writeText(inviteResult.link); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000) }}
                        className="shrink-0 text-xs font-medium bg-neutral-900 text-white px-sm py-xs rounded hover:bg-neutral-800"
                      >
                        {inviteCopied ? '✓' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Primary action heroes — bold black cards, blue accent on the standout */}
        <div className="grid gap-md sm:grid-cols-2">
          <section className="rounded-2xl border-2 border-neutral-950 bg-neutral-900 p-lg text-white flex flex-col">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Your schedule</p>
            <h2 className="mt-xs text-xl font-bold">📅 Diary</h2>
            <p className="mt-xs text-sm text-white/60 flex-1">
              See your viewings by day, book new ones, and check what&apos;s coming up.
            </p>
            <div className="mt-md flex flex-col gap-sm">
              <Link
                href="/lettings/viewings"
                className="rounded-xl bg-blue-600 px-lg py-md text-center text-sm font-bold text-white hover:bg-blue-700"
              >
                Open diary
              </Link>
              <Link
                href="/admin/agency-diary"
                className="rounded-xl border border-white/25 px-lg py-md text-center text-sm font-bold text-white hover:bg-white/10"
              >
                See all property visits
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border-2 border-neutral-950 bg-neutral-900 p-lg text-white flex flex-col">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Available now</p>
            <h2 className="mt-xs text-xl font-bold">🚪 {availableRooms.length} room{availableRooms.length === 1 ? '' : 's'} to let</h2>
            <p className="mt-xs text-sm text-white/60 flex-1">
              Rooms currently on the market across your properties. Send an offer to an applicant below.
            </p>
          </section>
        </div>

        {/* Available rooms */}
        <section className="mt-3xl">
          <div className="flex items-center justify-between mb-lg">
            <h2 className="text-xl font-bold text-neutral-900">Available Rooms</h2>
            <button
              onClick={() => setShowAddLetOnly(true)}
              className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition-colors"
            >
              + Add let-only room
            </button>
          </div>

          {availableRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No available rooms right now.</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border-2 border-neutral-950 bg-neutral-900 overflow-x-auto">
                <table className="w-full text-white">
                  <thead>
                    <tr className="border-b border-neutral-700 text-left">
                      <th className="px-lg py-md text-xs font-bold uppercase tracking-wide text-white/60">Property &amp; Room</th>
                      <th className="px-lg py-md text-xs font-bold uppercase tracking-wide text-white/60">Features</th>
                      <th className="px-lg py-md text-xs font-bold uppercase tracking-wide text-white/60">Available</th>
                      <th className="px-lg py-md text-xs font-bold uppercase tracking-wide text-white/60">Rent (£pcm)</th>
                      <th className="px-lg py-md text-center text-xs font-bold uppercase tracking-wide text-white/60">Days on market</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableRooms.map((room) => (
                      <tr
                        key={room.id}
                        className={`border-b border-neutral-800 last:border-0 ${
                          room.is_let_only ? 'opacity-75 hover:opacity-90' : 'hover:bg-neutral-800/60'
                        }`}
                      >
                        <td className="px-lg py-md text-sm">
                          <p className="font-semibold">{room.name}</p>
                          <p className="text-xs text-white/50">{room.property_address || room.property_name}</p>
                          {room.is_let_only && (
                            <Link
                              href={`/admin/let-only/${room.property_id}`}
                              className="mt-xs inline-block rounded-full bg-purple-900/60 px-sm py-0.5 text-xs font-semibold text-purple-300 hover:bg-purple-800/60 transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              🔑 Let-only →
                            </Link>
                          )}
                        </td>
                        <td className="px-lg py-md text-sm">
                          <RoomDetailTags
                            has_ensuite={room.has_ensuite}
                            has_shared_bathroom={room.has_shared_bathroom}
                            has_lounge={room.has_lounge}
                          />
                        </td>
                        <td className="px-lg py-md text-sm text-white/70">{formatDate(room.available_date)}</td>
                        <td className="px-lg py-md text-sm font-semibold">
                          £{room.current_asking_rent?.toLocaleString() || '—'}
                        </td>
                        <td className="px-lg py-md text-sm text-center text-white/70">
                          {room.days_on_market ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {availableRooms.some(r => r.is_let_only) && (
                <p className="mt-sm text-xs text-neutral-400">
                  🔑 Let-only rooms are landlord-marketed — Capital Rooms runs viewings only.
                </p>
              )}
            </>
          )}
        </section>

        {/* Send Offer — dark hero form (restyled inside the component) */}
        <div id="send-offer" className="mt-3xl scroll-mt-lg">
          <SendOfferForm />
        </div>
      </main>

      {showAddLetOnly && (
        <AddLetOnlyModal
          createdByPersonId={personId}
          onClose={() => setShowAddLetOnly(false)}
          onSave={async () => {
            setShowAddLetOnly(false)
            await loadData()
          }}
        />
      )}

      {/* ── Inline book viewing modal ── */}
      {addingViewing && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-lg"
          onClick={() => !savingViewing && setAddingViewing(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-xl font-bold text-neutral-900">Book a viewing</h2>
              <button
                onClick={() => !savingViewing && setAddingViewing(false)}
                className="text-2xl leading-none text-neutral-400 hover:text-neutral-900"
              >×</button>
            </div>

            {viewingBanner && (
              <div className="mb-md rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">
                {viewingBanner}
              </div>
            )}

            <div className="space-y-md">
              {/* Room */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-xs uppercase tracking-wide">
                  Room <span className="text-red-500">*</span>
                </label>
                <select
                  value={viewingForm.room_id}
                  onChange={(e) => {
                    const room = bookingRooms.find(r => r.id === e.target.value)
                    setViewingForm(f => ({
                      ...f,
                      room_id: e.target.value,
                      notifyMessage: defaultNotifyMsg(room?.properties?.name || '', f.viewing_date, f.viewing_slot),
                    }))
                  }}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="">Select a room…</option>
                  {bookingRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.properties?.name ? `${r.properties.name} — ${r.name}` : r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs uppercase tracking-wide">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={viewingForm.viewing_date}
                    onChange={(e) => setViewingForm(f => ({
                      ...f,
                      viewing_date: e.target.value,
                      notifyMessage: defaultNotifyMsg(
                        bookingRooms.find(r => r.id === f.room_id)?.properties?.name || '',
                        e.target.value,
                        f.viewing_slot,
                      ),
                    }))}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs uppercase tracking-wide">Time</label>
                  <input
                    type="time"
                    value={viewingForm.viewing_slot}
                    onChange={(e) => setViewingForm(f => ({
                      ...f,
                      viewing_slot: e.target.value,
                      notifyMessage: defaultNotifyMsg(
                        bookingRooms.find(r => r.id === f.room_id)?.properties?.name || '',
                        f.viewing_date,
                        e.target.value,
                      ),
                    }))}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900"
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-xs uppercase tracking-wide">
                  Duration
                </label>
                <div className="flex flex-wrap gap-sm">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setViewingForm(f => ({ ...f, duration_minutes: opt.value }))}
                      className={`rounded-lg border px-md py-sm text-xs font-semibold transition-colors ${
                        viewingForm.duration_minutes === opt.value
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-xs text-xs text-neutral-500">
                  {viewingForm.duration_minutes === 15 && 'Good for back-to-back viewings in the same hour'}
                  {viewingForm.duration_minutes === 30 && 'Standard short viewing'}
                  {viewingForm.duration_minutes === 60 && 'Standard full viewing'}
                  {viewingForm.duration_minutes === 90 && 'Detailed viewing with questions'}
                </p>
              </div>

              {/* Visitor details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs uppercase tracking-wide">Visitor name</label>
                  <input
                    type="text"
                    value={viewingForm.visitor_name}
                    onChange={(e) => setViewingForm(f => ({ ...f, visitor_name: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={viewingForm.visitor_email}
                    onChange={(e) => setViewingForm(f => ({ ...f, visitor_email: e.target.value }))}
                    placeholder="jane@example.com"
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs uppercase tracking-wide">Phone</label>
                  <input
                    type="tel"
                    value={viewingForm.visitor_phone}
                    onChange={(e) => setViewingForm(f => ({ ...f, visitor_phone: e.target.value }))}
                    placeholder="07700 000000"
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900"
                  />
                </div>
              </div>

              {/* Notify tenants */}
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-md space-y-sm">
                <div className="flex items-center gap-sm">
                  <input
                    type="checkbox"
                    id="notify-tenants"
                    checked={viewingForm.notifyTenants}
                    onChange={(e) => setViewingForm(f => ({ ...f, notifyTenants: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="notify-tenants" className="text-sm font-bold text-blue-900">
                    Notify tenants at this property
                  </label>
                </div>
                {viewingForm.notifyTenants && (
                  <div className="space-y-xs">
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">📨 Message preview</p>
                    <textarea
                      value={viewingForm.notifyMessage || defaultNotifyMsg(
                        bookingRooms.find(r => r.id === viewingForm.room_id)?.properties?.name || '',
                        viewingForm.viewing_date,
                        viewingForm.viewing_slot,
                      )}
                      onChange={(e) => setViewingForm(f => ({ ...f, notifyMessage: e.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-blue-300 bg-white px-sm py-sm text-xs text-neutral-800"
                    />
                    <p className="text-xs text-blue-700">
                      Sent via push notification + in-app message to all current tenants at the property.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-lg flex gap-md">
              <button
                onClick={handleCreateViewing}
                disabled={savingViewing || !viewingForm.room_id || !viewingForm.viewing_date}
                className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40 hover:bg-neutral-700 transition-colors"
              >
                {savingViewing ? 'Booking…' : viewingForm.notifyTenants ? 'Book & Notify' : 'Book viewing'}
              </button>
              <button
                onClick={() => !savingViewing && setAddingViewing(false)}
                className="rounded-xl border border-neutral-300 px-lg py-md text-sm font-semibold text-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

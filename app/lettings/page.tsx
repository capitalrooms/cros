'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser, signOut } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { displayName } from '@/lib/people'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import AddLetOnlyModal from '@/app/components/AddLetOnlyModal'
import RoomDetailTags from '@/app/components/RoomDetailTags'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import DarkHeroHeader from '@/app/components/DarkHeroHeader'
import SendOfferForm from '@/components/SendOfferForm'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Viewing {
  id: string
  viewing_date: string
  viewing_slot: string | null
  duration_minutes: number | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  viewing_status: string | null
  property_id: string | null
  room_id: string | null
  properties: { name: string } | null
  rooms: { name: string; current_asking_rent: number | null } | null
}

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

interface LetRoom {
  id: string
  name: string
  property_id: string
  property_name: string
  property_address: string
  current_asking_rent: number | null
  tenant_name: string | null
  tenant_email: string | null
}

interface BookingRoom {
  id: string
  name: string
  property_id: string
  properties: { id: string; name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function isoToDate(iso: string) {
  return new Date(iso + 'T00:00:00')
}

function addDays(iso: string, days: number) {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDayHeading(iso: string) {
  const d = isoToDate(iso)
  const today = todayISO()
  const tomorrow = addDays(today, 1)
  if (iso === today) return `Today · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
  if (iso === tomorrow) return `Tomorrow · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

function formatShortDate(iso: string | null) {
  if (!iso) return '—'
  return isoToDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(slot: string | null) {
  if (!slot) return '—'
  return slot.slice(0, 5)
}

function defaultNotifyMsg(propertyName: string, date: string, time: string) {
  const d = date ? isoToDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
  const t = time ? ` at ${time}` : ''
  const prop = propertyName || 'the property'
  return `🔑 A viewing has been arranged at ${prop} on ${d}${t}. We will have a management set of keys for access. Thank you for your hospitality whilst we visit and we hope not to disturb you for too long.`
}

/** Monday of the ISO week containing `iso` */
function weekStart(iso: string) {
  const d = isoToDate(iso)
  const day = d.getDay() // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function weekEnd(iso: string) {
  return addDays(weekStart(iso), 6)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'viewings' | 'available' | 'leads' | 'let'

export default function LettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [viewingAs, setViewingAs] = useState<{ id: string; name: string; role: string } | null>(null)
  const [personId, setPersonId] = useState<string | undefined>()

  const [viewings, setViewings] = useState<Viewing[]>([])
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [letRooms, setLetRooms] = useState<LetRoom[]>([])
  const [bookingRooms, setBookingRooms] = useState<BookingRoom[]>([])

  const [activeTab, setActiveTab] = useState<Tab>('viewings')
  const [selectedDay, setSelectedDay] = useState(todayISO())

  const [showAddLetOnly, setShowAddLetOnly] = useState(false)
  const [addingViewing, setAddingViewing] = useState(false)
  const [viewingForm, setViewingForm] = useState(blankViewingForm())
  const [savingViewing, setSavingViewing] = useState(false)
  const [banner, setBanner] = useState('')

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    // Fetch all future viewings (we filter by day client-side)
    const { data: viewingsData } = await supabase
      .from('viewings')
      .select('id, viewing_date, viewing_slot, duration_minutes, visitor_name, visitor_email, visitor_phone, viewing_status, property_id, room_id, properties(name), rooms(name, current_asking_rent)')
      .gte('viewing_date', todayISO())
      .order('viewing_date', { ascending: true })
      .order('viewing_slot', { ascending: true })
      .limit(200)
    setViewings((viewingsData as Viewing[]) || [])

    // Managed available rooms
    const { data: availableData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, available_date, days_on_market, has_ensuite, has_shared_bathroom, has_lounge, properties(name, address)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    // Let-only available rooms
    const { data: letOnlyData } = await supabase
      .from('let_only_rooms')
      .select('id, room_name, monthly_rent, available_date, has_ensuite, has_shared_bathroom, has_lounge, let_only_listings(id, address, postcode, is_active)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    const managed: AvailableRoom[] = (availableData || []).map((room: any) => ({
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

    const letOnly: AvailableRoom[] = (letOnlyData || [])
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

    // Currently let rooms (occupied, with tenant info via people table)
    const { data: letData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, properties(name, address), people(full_name, first_name, last_name, email)')
      .eq('status', 'occupied')
      .order('name', { ascending: true })

    const letMapped: LetRoom[] = (letData || []).map((room: any) => {
      const tenant = Array.isArray(room.people) ? room.people[0] : room.people
      const tName = tenant
        ? tenant.full_name || [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || null
        : null
      return {
        id: room.id,
        name: room.name,
        property_id: room.property_id,
        property_name: room.properties?.name || 'Unknown',
        property_address: room.properties?.address || '',
        current_asking_rent: room.current_asking_rent,
        tenant_name: tName,
        tenant_email: tenant?.email || null,
      }
    })
    setLetRooms(letMapped)
  }, [supabase])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data) { router.push('/login'); return }

      const role = data.assignment?.role
      if (!['lettings', 'administrator', 'admin'].includes(role)) { router.push('/login'); return }

      // View-as impersonation — admin only
      const asParam = searchParams.get('as')
      const isAdmin = ['administrator', 'admin'].includes(role || '')
      if (asParam && isAdmin) {
        const { data: target } = await supabase
          .from('people')
          .select('id, full_name, first_name, last_name, role')
          .eq('id', asParam)
          .maybeSingle()
        if (!target || target.role !== 'lettings') { router.push('/admin/people'); return }
        setViewingAs({
          id: asParam,
          name: target.full_name || `${target.first_name || ''} ${target.last_name || ''}`.trim() || 'Lettings User',
          role: target.role,
        })
      }

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

      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, name, property_id, properties(id, name)')
        .order('name')
      setBookingRooms((roomsData as any) || [])

      setLoading(false)
    }
    init()
  }, [router, loadData])

  // ── Computed stats ──────────────────────────────────────────────────────────

  const wStart = weekStart(todayISO())
  const wEnd = weekEnd(todayISO())
  const thisWeekCount = viewings.filter(v => v.viewing_date >= wStart && v.viewing_date <= wEnd).length
  const pendingCount = viewings.filter(v => v.viewing_status !== 'confirmed' && v.viewing_status !== 'completed').length
  const dayViewings = viewings.filter(v => v.viewing_date === selectedDay)

  // ── Book viewing ─────────────────────────────────────────────────────────────

  async function handleCreateViewing() {
    if (!viewingForm.viewing_date || !viewingForm.room_id) {
      setBanner('A date and room are required')
      return
    }
    if (!viewingForm.visitor_name.trim()) {
      setBanner('Visitor name is required')
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
        }).catch(() => {})
      }

      setAddingViewing(false)
      setViewingForm(blankViewingForm())
      // Jump to the booked day
      setSelectedDay(viewingForm.viewing_date)
      setActiveTab('viewings')
      await loadData()
      setBanner(viewingForm.notifyTenants ? '✅ Viewing booked & tenants notified' : '✅ Viewing booked')
      setTimeout(() => setBanner(''), 4000)
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Failed to book viewing')
    } finally {
      setSavingViewing(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>

      {/* ── View-as banner ─────────────────────────────────────────────────── */}
      {viewingAs && (
        <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />
      )}

      {/* ── Dark hero header ────────────────────────────────────────────────── */}
      <DarkHeroHeader
        eyebrow="Lettings"
        heading="Diary & Leads"
        topRight={
          <button
            onClick={async () => { await signOut(); router.push('/login') }}
            className="hover:text-white transition-colors"
          >
            Sign out
          </button>
        }
      >
        <div className="grid grid-cols-3 gap-sm">
          <StatTile value={thisWeekCount} label="This week" />
          <StatTile value={pendingCount} label="Pending" valueColor="text-amber-400" />
          <StatTile value={availableRooms.length} label="Available" valueColor="text-green-400" />
        </div>
      </DarkHeroHeader>

      {/* ── Tab strip ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-20 px-lg pt-md pb-0">
        <div className="flex gap-xs">
          {(['viewings', 'available', 'leads', 'let'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-lg py-sm rounded-full text-sm font-bold capitalize transition-all mb-sm ${
                activeTab === tab
                  ? 'bg-neutral-950 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Global banner ──────────────────────────────────────────────────── */}
      {banner && (
        <div className="mx-lg mt-md rounded-xl border border-green-200 bg-green-50 px-lg py-sm text-sm font-semibold text-green-800">
          {banner}
        </div>
      )}

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-lg pb-3xl">

        {/* ── VIEWINGS ─────────────────────────────────────────────────────── */}
        {activeTab === 'viewings' && (
          <div className="pt-lg">
            {/* Day navigation */}
            <div className="flex items-center justify-between mb-lg">
              <button
                onClick={() => setSelectedDay(d => addDays(d, -1))}
                className="w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-50 active:scale-95 transition-all shadow-sm text-lg"
                aria-label="Previous day"
              >
                ‹
              </button>
              <h2 className="text-base font-bold text-neutral-900">{formatDayHeading(selectedDay)}</h2>
              <button
                onClick={() => setSelectedDay(d => addDays(d, 1))}
                className="w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-50 active:scale-95 transition-all shadow-sm text-lg"
                aria-label="Next day"
              >
                ›
              </button>
            </div>

            {/* Viewing cards */}
            {dayViewings.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                <p className="text-sm font-medium text-neutral-400">No viewings on this day</p>
                <button
                  onClick={() => { setViewingForm(blankViewingForm(selectedDay)); setAddingViewing(true) }}
                  className="mt-md inline-flex items-center gap-xs rounded-full bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 transition-colors"
                >
                  + Book a viewing
                </button>
              </div>
            ) : (
              <div className="space-y-md">
                {dayViewings.map(v => (
                  <ViewingCard key={v.id} viewing={v} />
                ))}
              </div>
            )}

            {/* Add viewing CTA (when there are already viewings) */}
            {dayViewings.length > 0 && (
              <button
                onClick={() => { setViewingForm(blankViewingForm(selectedDay)); setAddingViewing(true) }}
                className="mt-lg w-full rounded-2xl border-2 border-dashed border-neutral-300 bg-white py-md text-sm font-bold text-neutral-400 hover:border-neutral-900 hover:text-neutral-900 transition-all"
              >
                + Add another viewing
              </button>
            )}

            {/* Invite to Apply strip — compact, below the day cards */}
            {viewings.length > 0 && (
              <div className="mt-xl rounded-2xl bg-white border border-neutral-200 overflow-hidden">
                <div className="px-lg py-md border-b border-neutral-100">
                  <h3 className="text-sm font-bold text-neutral-900">📨 Invite to Apply</h3>
                </div>
                <div className="divide-y divide-neutral-100">
                  {viewings
                    .filter(v => v.visitor_name)
                    .slice(0, 6)
                    .map(v => (
                      <div key={v.id} className="flex items-center justify-between gap-md px-lg py-sm">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{v.visitor_name}</p>
                          <p className="text-xs text-neutral-400">
                            {v.rooms?.name || v.properties?.name || ''} · {v.viewing_date}
                          </p>
                        </div>
                        <button
                          onClick={() => router.push(`/admin/invite-to-apply?viewingId=${v.id}`)}
                          className="shrink-0 rounded-full bg-neutral-900 px-md py-xs text-xs font-bold text-white hover:bg-neutral-700 transition-colors"
                        >
                          Invite
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AVAILABLE ────────────────────────────────────────────────────── */}
        {activeTab === 'available' && (
          <div className="pt-lg">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-base font-bold text-neutral-900">
                {availableRooms.length} room{availableRooms.length !== 1 ? 's' : ''} to let
              </h2>
              <button
                onClick={() => setShowAddLetOnly(true)}
                className="rounded-full bg-neutral-900 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700 transition-colors"
              >
                + Let-only room
              </button>
            </div>

            {availableRooms.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                <p className="text-sm text-neutral-400">No available rooms right now</p>
              </div>
            ) : (
              <div className="space-y-sm">
                {availableRooms.map(room => (
                  <AvailableRoomCard key={room.id} room={room} />
                ))}
              </div>
            )}

            {availableRooms.some(r => r.is_let_only) && (
              <p className="mt-md text-xs text-neutral-400">
                🔑 Let-only rooms are landlord-managed — Capital Rooms runs viewings only.
              </p>
            )}

            {/* Send offer letter */}
            <div id="send-offer" className="mt-xl scroll-mt-lg">
              <SendOfferForm />
            </div>
          </div>
        )}

        {/* ── LEADS ────────────────────────────────────────────────────────── */}
        {activeTab === 'leads' && (
          <div className="pt-xl">
            <PlaceholderTab
              emoji="👤"
              title="Leads"
              body="Track enquiries and prospects here. This section is coming soon — it will connect to applicant records and let you manage incoming interest in available rooms."
            />
          </div>
        )}

        {/* ── LET ──────────────────────────────────────────────────────────── */}
        {activeTab === 'let' && (
          <div className="pt-lg">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-base font-bold text-neutral-900">
                {letRooms.length} room{letRooms.length !== 1 ? 's' : ''} currently let
              </h2>
            </div>

            {letRooms.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                <p className="text-sm text-neutral-400">No rooms currently showing as occupied</p>
              </div>
            ) : (
              <div className="space-y-sm">
                {letRooms.map(room => (
                  <Link
                    key={room.id}
                    href={`/admin/properties/${room.property_id}`}
                    className="block rounded-2xl bg-white border border-neutral-200 p-lg hover:border-neutral-900 transition-colors shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-md">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-neutral-900">{room.name}</p>
                        <p className="text-sm text-neutral-500 mt-xs truncate">{room.property_address || room.property_name}</p>
                        {room.tenant_name && (
                          <p className="text-xs text-neutral-400 mt-sm">👤 {room.tenant_name}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-black text-neutral-900">
                          {room.current_asking_rent ? `£${room.current_asking_rent.toLocaleString()}` : '—'}
                        </p>
                        <p className="text-xs text-neutral-400">pcm</p>
                        <span className="mt-xs inline-block rounded-full bg-green-100 px-sm py-0.5 text-xs font-bold text-green-700">Let</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── Settings footer ────────────────────────────────────────────────── */}
      <div className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-2xl px-lg py-lg flex items-center justify-between">
          <Link
            href="/lettings/profile"
            className="flex items-center gap-sm text-sm font-semibold text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <span className="text-lg">⚙️</span>
            Settings
          </Link>
          <Link
            href="/admin/agency-diary"
            className="text-sm font-semibold text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Agency diary →
          </Link>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {showAddLetOnly && (
        <AddLetOnlyModal
          createdByPersonId={personId}
          onClose={() => setShowAddLetOnly(false)}
          onSave={async () => { setShowAddLetOnly(false); await loadData() }}
        />
      )}

      {addingViewing && (
        <BookViewingModal
          form={viewingForm}
          setForm={setViewingForm}
          bookingRooms={bookingRooms}
          saving={savingViewing}
          banner={banner}
          onClose={() => { if (!savingViewing) { setAddingViewing(false); setBanner('') } }}
          onSave={handleCreateViewing}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ value, label, valueColor = 'text-white' }: { value: number; label: string; valueColor?: string }) {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-md text-center">
      <p className={`text-3xl font-black tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-xs font-medium text-white/40 mt-xs">{label}</p>
    </div>
  )
}

function ViewingCard({ viewing }: { viewing: Viewing }) {
  const confirmed = viewing.viewing_status === 'confirmed'
  const rent = viewing.rooms?.current_asking_rent
  const propName = viewing.properties?.name || ''
  const roomName = viewing.rooms?.name || ''
  const address = [roomName, propName].filter(Boolean).join(' · ')

  return (
    <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-white shadow-sm">
      {/* Dark time/status band */}
      <div className="flex items-center justify-between bg-neutral-950 px-lg py-md">
        <span className="text-sm font-bold text-white tabular-nums">
          {viewing.viewing_slot ? formatTime(viewing.viewing_slot) : 'Time TBC'}
        </span>
        <span className={`text-xs font-bold ${confirmed ? 'text-green-400' : 'text-amber-400'}`}>
          {confirmed ? 'Confirmed' : 'Unconfirmed'}
        </span>
      </div>
      {/* Card body */}
      <div className="px-lg py-md">
        <p className="text-base font-bold text-neutral-900">{viewing.visitor_name || 'Visitor name unknown'}</p>
        {address && <p className="text-sm text-neutral-500 mt-xs">{address}{rent ? ` · £${rent.toLocaleString()}/mo` : ''}</p>}
        {/* Contact chips */}
        {(viewing.visitor_email || viewing.visitor_phone) && (
          <div className="mt-md flex flex-wrap gap-sm">
            {viewing.visitor_email && (
              <a
                href={`mailto:${viewing.visitor_email}`}
                className="inline-flex items-center gap-xs rounded-full bg-neutral-100 px-md py-xs text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
              >
                <span>✉</span> {viewing.visitor_email}
              </a>
            )}
            {viewing.visitor_phone && (
              <a
                href={`tel:${viewing.visitor_phone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-xs rounded-full bg-neutral-100 px-md py-xs text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
              >
                <span>📞</span> {viewing.visitor_phone}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AvailableRoomCard({ room }: { room: AvailableRoom }) {
  const href = room.is_let_only
    ? `/admin/let-only/${room.property_id}`
    : `/admin/properties/${room.property_id}`

  return (
    <Link
      href={href}
      className="block rounded-2xl bg-white border border-neutral-200 p-lg hover:border-neutral-900 transition-colors group shadow-sm"
    >
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-sm flex-wrap">
            <p className="font-bold text-neutral-900">{room.name}</p>
            {room.is_let_only && (
              <span className="rounded-full bg-purple-100 px-sm py-0.5 text-xs font-bold text-purple-700">
                Let-only
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-xs truncate">{room.property_address || room.property_name}</p>
          <div className="mt-sm">
            <RoomDetailTags
              has_ensuite={room.has_ensuite}
              has_shared_bathroom={room.has_shared_bathroom}
              has_lounge={room.has_lounge}
            />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-black text-neutral-900">
            {room.current_asking_rent ? `£${room.current_asking_rent.toLocaleString()}` : '—'}
          </p>
          <p className="text-xs text-neutral-400">pcm</p>
          {room.days_on_market != null && (
            <p className={`text-xs font-semibold mt-xs ${room.days_on_market > 28 ? 'text-red-500' : room.days_on_market > 14 ? 'text-amber-500' : 'text-neutral-400'}`}>
              {room.days_on_market}d on market
            </p>
          )}
          {room.available_date && (
            <p className="text-xs text-neutral-400 mt-xs">{formatShortDate(room.available_date)}</p>
          )}
        </div>
      </div>
      <span className="sr-only">View details →</span>
    </Link>
  )
}

function PlaceholderTab({ emoji, title, body, note }: { emoji: string; title: string; body: string; note?: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white p-2xl text-center">
      <p className="text-4xl mb-md">{emoji}</p>
      <h2 className="text-lg font-bold text-neutral-900 mb-sm">{title}</h2>
      <p className="text-sm text-neutral-500 max-w-xs mx-auto">{body}</p>
      {note && (
        <p className="mt-md text-xs text-neutral-400 max-w-xs mx-auto">{note}</p>
      )}
    </div>
  )
}

// ─── Book viewing modal ───────────────────────────────────────────────────────

interface BookViewingModalProps {
  form: ReturnType<typeof blankViewingForm>
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof blankViewingForm>>>
  bookingRooms: BookingRoom[]
  saving: boolean
  banner: string
  onClose: () => void
  onSave: () => void
}

function BookViewingModal({ form, setForm, bookingRooms, saving, banner, onClose, onSave }: BookViewingModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-lg"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-lg">
          <h2 className="text-xl font-bold text-neutral-900">Book a viewing</h2>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
        </div>

        {banner && (
          <div className="mb-md rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{banner}</div>
        )}

        <div className="space-y-md">
          {/* Room */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">
              Room <span className="text-red-500">*</span>
            </label>
            <select
              value={form.room_id}
              onChange={e => {
                const room = bookingRooms.find(r => r.id === e.target.value)
                setForm(f => ({
                  ...f,
                  room_id: e.target.value,
                  notifyMessage: defaultNotifyMsg(room?.properties?.name || '', f.viewing_date, f.viewing_slot),
                }))
              }}
              className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900"
            >
              <option value="">Select a room…</option>
              {bookingRooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.properties?.name ? `${r.properties.name} — ${r.name}` : r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.viewing_date}
                onChange={e => setForm(f => ({
                  ...f,
                  viewing_date: e.target.value,
                  notifyMessage: defaultNotifyMsg(bookingRooms.find(r => r.id === f.room_id)?.properties?.name || '', e.target.value, f.viewing_slot),
                }))}
                className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">Time</label>
              <input
                type="time"
                value={form.viewing_slot}
                onChange={e => setForm(f => ({
                  ...f,
                  viewing_slot: e.target.value,
                  notifyMessage: defaultNotifyMsg(bookingRooms.find(r => r.id === f.room_id)?.properties?.name || '', f.viewing_date, e.target.value),
                }))}
                className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">Duration</label>
            <div className="flex flex-wrap gap-sm">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, duration_minutes: opt.value }))}
                  className={`rounded-lg border px-md py-sm text-xs font-semibold transition-colors ${
                    form.duration_minutes === opt.value
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visitor */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">Visitor name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.visitor_name}
                onChange={e => setForm(f => ({ ...f, visitor_name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">Email</label>
              <input
                type="email"
                value={form.visitor_email}
                onChange={e => setForm(f => ({ ...f, visitor_email: e.target.value }))}
                placeholder="jane@example.com"
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">Phone</label>
              <input
                type="tel"
                value={form.visitor_phone}
                onChange={e => setForm(f => ({ ...f, visitor_phone: e.target.value }))}
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
                checked={form.notifyTenants}
                onChange={e => setForm(f => ({ ...f, notifyTenants: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="notify-tenants" className="text-sm font-bold text-blue-900">
                Notify tenants at this property
              </label>
            </div>
            {form.notifyTenants && (
              <textarea
                rows={3}
                value={form.notifyMessage}
                onChange={e => setForm(f => ({ ...f, notifyMessage: e.target.value }))}
                className="w-full rounded-lg border border-blue-300 bg-white px-md py-sm text-sm text-neutral-900"
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-md pt-sm">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Booking…' : 'Book viewing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

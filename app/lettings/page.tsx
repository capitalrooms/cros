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
import StatTile from '@/app/components/StatTile'
import SendOfferForm from '@/components/SendOfferForm'
import MultiDayDiaryGrid, { type DiaryJob } from '@/app/components/MultiDayDiaryGrid'
import DesktopRightRail from '@/app/components/DesktopRightRail'

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

const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildWeekDays(offset = 0): string[] {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const dow = base.getDay()
  const mondayShift = dow === 0 ? -6 : 1 - dow
  base.setDate(base.getDate() + mondayShift + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function isoToDateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return { day: DAY_LABELS[date.getDay()], date: d, month: MONTH_SHORT[m - 1] }
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
  const [weekOffset, setWeekOffset] = useState(0)

  const [showAddLetOnly, setShowAddLetOnly] = useState(false)
  const [addingViewing, setAddingViewing] = useState(false)
  const [viewingForm, setViewingForm] = useState(blankViewingForm())
  const [savingViewing, setSavingViewing] = useState(false)
  const [banner, setBanner] = useState('')

  const [showSettings, setShowSettings] = useState(false)

  const DEFAULT_NOTIF_PREFS = {
    viewing_booked: true,
    viewing_confirmed: true,
    new_application: true,
    deposit_confirmed: true,
    running_late: true,
    offer_sent: false,
  }
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(DEFAULT_NOTIF_PREFS)

  // Hydrate notification preferences from localStorage after mount (safe for SSR)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('lettings_notif_prefs')
      if (stored) setNotifPrefs(JSON.parse(stored))
    } catch {}
  }, [])

  function toggleNotif(key: string) {
    setNotifPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('lettings_notif_prefs', JSON.stringify(next)) } catch {}
      return next
    })
  }

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
      // Sort: extract leading house number numerically, then alphabetically by address, then room number
      const sortedRooms = ((roomsData as any) || []).sort((a: any, b: any) => {
        const pa = a.properties?.name || ''
        const pb = b.properties?.name || ''
        const na = parseInt(pa.match(/^\d+/)?.[0] ?? '9999', 10)
        const nb = parseInt(pb.match(/^\d+/)?.[0] ?? '9999', 10)
        if (na !== nb) return na - nb
        if (pa !== pb) return pa.localeCompare(pb)
        const ra = parseInt(a.name?.match(/\d+/)?.[0] ?? '9999', 10)
        const rb = parseInt(b.name?.match(/\d+/)?.[0] ?? '9999', 10)
        if (ra !== rb) return ra - rb
        return (a.name || '').localeCompare(b.name || '')
      })
      setBookingRooms(sortedRooms)

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

  // ── Lettings diary jobs (for desktop grid) ───────────────────────────────
  const lettingsDiaryJobs: DiaryJob[] = viewings
    .filter(v => v.viewing_date)
    .map(v => ({
      id: v.id,
      date: v.viewing_date,
      time: v.viewing_slot ? String(v.viewing_slot).slice(0, 5) : null,
      label: v.properties?.name ?? (v.rooms?.name ?? 'Unknown'),
      sublabel: v.visitor_name ? `${v.visitor_name}${v.rooms?.name ? ` · ${v.rooms.name}` : ''}` : (v.rooms?.name ?? ''),
      isOverdue: new Date(v.viewing_date + 'T00:00:00') < new Date(new Date().toDateString()),
    }))

  const viewingCountByDay: Record<string, number> = {}
  for (const v of viewings) {
    if (v.viewing_date) viewingCountByDay[v.viewing_date] = (viewingCountByDay[v.viewing_date] || 0) + 1
  }

  return (
    <div className="min-h-screen bg-neutral-100" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>

      {/* ── View-as banner ─────────────────────────────────────────────────── */}
      {viewingAs && (
        <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT (lg+) — 3-column vision spec
      ═══════════════════════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:grid lg:min-h-screen"
        style={{ gridTemplateColumns: '220px 1fr 300px', background: '#F6F3EC', fontFamily: 'Inter,system-ui,sans-serif' }}
      >
        {/* Sidebar */}
        <nav style={{ background: '#181614', color: '#F6F3EC', padding: '22px 16px', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <div style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontWeight: 800, fontSize: 15, letterSpacing: '0.02em' }}>
            CAPITAL ROOMS
            <span style={{ display: 'block', fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', opacity: 0.5, marginTop: 2, textTransform: 'uppercase' }}>Lettings</span>
          </div>
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            {(['viewings', 'available', 'let'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
                  color: activeTab === tab ? '#F6F3EC' : 'rgba(246,243,236,0.6)',
                  background: activeTab === tab ? 'rgba(246,243,236,0.1)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'available' && availableRooms.length > 0 && (
                  <span style={{ background: '#4B6358', color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 6px' }}>{availableRooms.length}</span>
                )}
                {tab === 'viewings' && pendingCount > 0 && (
                  <span style={{ background: '#C97A3D', color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 6px' }}>{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(246,243,236,0.15)', paddingTop: 14, fontSize: 12, color: 'rgba(246,243,236,0.55)', display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={async () => { await signOut(); router.push('/login') }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>Sign out</button>
          </div>
        </nav>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden' }}>
          {/* Dark hero */}
          <div style={{ background: '#181614', color: '#F6F3EC', padding: '26px 32px 22px' }}>
            <h1 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 24, margin: '0 0 3px', fontWeight: 800 }}>Diary &amp; Leads</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(246,243,236,0.6)' }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 20 }}>
              {[
                { num: thisWeekCount,         label: 'This week',  color: undefined },
                { num: pendingCount,           label: 'Pending',    color: pendingCount > 0 ? '#E8836B' : undefined },
                { num: availableRooms.length,  label: 'Available',  color: availableRooms.length > 0 ? '#6EAF8B' : undefined },
              ].map(({ num, label, color }) => (
                <div key={label} style={{ background: 'rgba(246,243,236,0.07)', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 24, fontWeight: 700, color: color ?? '#F6F3EC' }}>{num}</div>
                  <div style={{ fontSize: 11, color: 'rgba(246,243,236,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <main style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 40px' }}>
            {activeTab === 'viewings' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h2 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 18, margin: 0, color: '#181614' }}>Viewings Diary</h2>
                  <button
                    onClick={() => { setViewingForm(blankViewingForm(todayISO())); setAddingViewing(true) }}
                    style={{ background: '#4B6358', color: 'white', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >+ Book viewing</button>
                </div>
                <MultiDayDiaryGrid
                  jobs={lettingsDiaryJobs}
                  startHour={9}
                  endHour={20}
                  todayISO={todayISO()}
                />
              </div>
            )}
            {activeTab === 'available' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h2 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 18, margin: 0, color: '#181614' }}>{availableRooms.length} room{availableRooms.length !== 1 ? 's' : ''} to let</h2>
                  <button onClick={() => setShowAddLetOnly(true)} style={{ background: '#181614', color: 'white', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Let-only room</button>
                </div>
                {availableRooms.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center"><p className="text-sm text-neutral-400">No available rooms</p></div>
                ) : (
                  <div className="space-y-sm">{availableRooms.map(room => <AvailableRoomCard key={room.id} room={room} />)}</div>
                )}
              </div>
            )}
            {activeTab === 'let' && (
              <div>
                <h2 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 18, margin: '0 0 16px', color: '#181614' }}>{letRooms.length} room{letRooms.length !== 1 ? 's' : ''} let</h2>
                {letRooms.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center"><p className="text-sm text-neutral-400">No rooms currently let</p></div>
                ) : (
                  <div className="space-y-sm">
                    {letRooms.map(room => (
                      <Link key={room.id} href={`/admin/properties/${room.property_id}`} className="block rounded-2xl bg-white border border-neutral-200 p-lg hover:border-neutral-900 transition-colors shadow-sm">
                        <div className="flex items-start justify-between gap-md">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-neutral-900">{room.name}</p>
                            <p className="text-sm text-neutral-500 mt-xs truncate">{room.property_address || room.property_name}</p>
                            {room.tenant_name && <p className="text-xs text-neutral-400 mt-sm">👤 {room.tenant_name}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-black text-neutral-900">{room.current_asking_rent ? `£${room.current_asking_rent.toLocaleString()}` : '—'}</p>
                            <p className="text-xs text-neutral-400">pcm</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {/* Right rail */}
        {(() => {
          const today = todayISO()
          const upcomingViewings = viewings
            .filter(v => v.viewing_date >= today && v.viewing_status === 'scheduled')
            .sort((a, b) => a.viewing_date.localeCompare(b.viewing_date))
          const railAlerts = [
            ...(pendingCount > 0 ? [{ title: `${pendingCount} pending viewing${pendingCount !== 1 ? 's' : ''}`, body: 'Awaiting confirmation', variant: 'amber' as const, onClick: () => setActiveTab('viewings') }] : []),
            ...(availableRooms.length > 0 ? [{ title: `${availableRooms.length} room${availableRooms.length !== 1 ? 's' : ''} available`, body: 'Ready to let', variant: 'sage' as const, onClick: () => setActiveTab('available') }] : []),
            ...(thisWeekCount > 0 ? [{ title: `${thisWeekCount} viewing${thisWeekCount !== 1 ? 's' : ''} this week`, body: 'Tap to view diary', variant: 'default' as const, onClick: () => setActiveTab('viewings') }] : []),
          ]
          return (
            <DesktopRightRail
              dateCounts={viewingCountByDay}
              todayISO={today}
              alerts={railAlerts}
              alertsHeading="Viewings"
            >
              {upcomingViewings.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0 0 8px', fontWeight: 700 }}>
                    Coming Up
                  </h3>
                  {upcomingViewings.slice(0, 5).map((v: any) => {
                    const viewDate = new Date(v.viewing_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                    return (
                      <div key={v.id} style={{ background: '#FFFFFF', border: '1px solid #E7E1D4', borderRadius: 12, padding: '10px 12px', marginBottom: 7 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#181614', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.visitor_name || 'Viewing'}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#59544C', marginTop: 2 }}>
                          {v.rooms?.name || ''}{v.rooms?.name ? ' · ' : ''}
                          {v.rooms?.properties?.name || v.property_name || ''}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#59544C', marginTop: 2 }}>
                          📅 {viewDate}{v.viewing_slot ? ` · ${String(v.viewing_slot).slice(0, 5)}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </DesktopRightRail>
          )
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MOBILE LAYOUT — unchanged
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden">

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
      <div
        className="bg-white border-b border-neutral-200 sticky z-40 px-lg pt-md pb-0"
        style={{ top: 'calc(env(safe-area-inset-top) + 52px)' }}
      >
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
            <div className="flex items-center justify-between mb-md">
              <button
                onClick={() => {
                  const d = new Date(selectedDay + 'T00:00:00')
                  d.setDate(d.getDate() - 1)
                  setSelectedDay(d.toISOString().split('T')[0])
                }}
                className="px-md py-sm rounded-xl border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 text-sm font-semibold transition-colors"
              >‹ Prev</button>
              <div className="text-center">
                <p className="text-sm font-bold text-neutral-900">{formatDayHeading(selectedDay)}</p>
                {selectedDay !== todayISO() && (
                  <button
                    onClick={() => setSelectedDay(todayISO())}
                    className="text-xs text-blue-600 underline mt-0.5"
                  >Today</button>
                )}
              </div>
              <button
                onClick={() => {
                  const d = new Date(selectedDay + 'T00:00:00')
                  d.setDate(d.getDate() + 1)
                  setSelectedDay(d.toISOString().split('T')[0])
                }}
                className="px-md py-sm rounded-xl border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 text-sm font-semibold transition-colors"
              >Next ›</button>
            </div>

            {/* Always-present add button */}
            <button
              onClick={() => { setViewingForm(blankViewingForm(selectedDay)); setAddingViewing(true) }}
              className="w-full mb-lg rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 transition-colors"
            >+ Book viewing</button>

            {/* 15-minute time grid: 9am – 8pm */}
            {(() => {
              const START_H = 9, END_H = 20
              // Build slot → viewing lookup using first 5 chars of viewing_slot ("HH:MM")
              const slotMap: Record<string, typeof dayViewings> = {}
              for (const v of dayViewings) {
                const key = (v.viewing_slot ?? '').slice(0, 5) // "09:00"
                if (!slotMap[key]) slotMap[key] = []
                slotMap[key].push(v)
              }
              const rows: { h: number; m: number }[] = []
              for (let h = START_H; h < END_H; h++) {
                for (const m of [0, 15, 30, 45]) rows.push({ h, m })
              }
              const fmtHour = (h: number) => h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
              return (
                <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
                  {rows.map(({ h, m }, i) => {
                    const key = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
                    const slotViewings = slotMap[key] ?? []
                    const isHourStart = m === 0
                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          minHeight: 44,
                          borderTop: isHourStart
                            ? '1px solid #e5e7eb'   // hour line — neutral-200
                            : '1px solid #f3f4f6',  // 15-min line — neutral-100
                        }}
                      >
                        {/* Time label — only at :00 */}
                        <div style={{
                          width: 44,
                          flexShrink: 0,
                          paddingTop: 6,
                          paddingRight: 8,
                          textAlign: 'right',
                          fontSize: 11,
                          fontWeight: 600,
                          color: isHourStart ? '#6b7280' : 'transparent',
                          borderRight: '1px solid #e5e7eb',
                          userSelect: 'none',
                        }}>
                          {isHourStart ? fmtHour(h) : '·'}
                        </div>
                        {/* Slot content */}
                        <div
                          style={{ flex: 1, padding: slotViewings.length ? '4px 8px' : '0 8px', cursor: slotViewings.length === 0 ? 'pointer' : undefined }}
                          onClick={() => {
                            if (slotViewings.length === 0) {
                              setViewingForm(f => ({
                                ...blankViewingForm(selectedDay),
                                viewing_date: selectedDay,
                                viewing_slot: key + ':00',
                              }))
                              setAddingViewing(true)
                            }
                          }}
                        >
                          {slotViewings.map(v => (
                            <div
                              key={v.id}
                              style={{
                                background: '#DCE6DE',
                                borderLeft: '3px solid #4B6358',
                                borderRadius: 7,
                                padding: '5px 8px',
                                marginBottom: 3,
                              }}
                            >
                              <p style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', margin: 0, lineHeight: 1.3 }}>
                                {v.visitor_name || 'Viewing'}
                              </p>
                              <p style={{ fontSize: 11, color: '#4B6358', margin: 0, lineHeight: 1.3 }}>
                                {v.rooms?.name || v.properties?.name || ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
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

        {/* ── Quick-access tiles ────────────────────────────────────────────── */}
        <div className="mt-2xl mb-xl grid grid-cols-2 gap-md">

          {/* Diary View tile */}
          <Link
            href="/admin/agency-diary"
            className="flex flex-col items-start gap-sm rounded-2xl bg-neutral-950 p-lg hover:bg-neutral-900 active:scale-[0.97] transition-all"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <circle cx="8" cy="16" r="1" fill="currentColor" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
                <circle cx="16" cy="16" r="1" fill="currentColor" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Diary View</p>
              <p className="text-xs text-white/40 mt-0.5">Full agency calendar</p>
            </div>
          </Link>

          {/* Settings tile */}
          <button
            onClick={() => setShowSettings(s => !s)}
            className="flex flex-col items-start gap-sm rounded-2xl bg-neutral-950 p-lg hover:bg-neutral-900 active:scale-[0.97] transition-all text-left"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="8" y1="12" x2="20" y2="12" />
                  <line x1="12" y1="18" x2="20" y2="18" />
                  <circle cx="4" cy="12" r="2" fill="currentColor" />
                  <circle cx="8" cy="18" r="2" fill="currentColor" />
                </svg>
              </div>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`text-white/40 transition-transform ${showSettings ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Settings</p>
              <p className="text-xs text-white/40 mt-0.5">Notification preferences</p>
            </div>
          </button>
        </div>

        {/* Notification preferences panel (expands below tiles) */}
        {showSettings && (
          <div className="mb-2xl rounded-2xl bg-neutral-950 border border-neutral-800 overflow-hidden">
            <div className="px-lg py-md border-b border-neutral-800">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Notification preferences</p>
              <p className="text-sm text-white/60 mt-xs">Choose which push notifications you receive</p>
            </div>
            <div className="divide-y divide-neutral-800">
              {[
                { key: 'viewing_booked', label: 'New viewing booked', desc: 'When an applicant books a viewing' },
                { key: 'viewing_confirmed', label: 'Viewing confirmed', desc: 'When a viewer confirms their attendance' },
                { key: 'new_application', label: 'New application', desc: 'When someone applies for a room' },
                { key: 'deposit_confirmed', label: 'Deposit confirmed', desc: 'When an applicant pays their deposit' },
                { key: 'running_late', label: 'Running late alerts', desc: 'Alerts sent for time-sensitive viewings' },
                { key: 'offer_sent', label: 'Offer letter sent', desc: 'Confirmation when an offer is dispatched' },
              ].map(({ key, label, desc }) => (
                <button
                  key={key}
                  onClick={() => toggleNotif(key)}
                  className="w-full flex items-center justify-between gap-md px-lg py-md hover:bg-white/5 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-white/40 mt-0.5">{desc}</p>
                  </div>
                  {/* Toggle pill */}
                  <div className={`relative shrink-0 w-12 h-6 rounded-full transition-colors ${notifPrefs[key] ? 'bg-green-500' : 'bg-neutral-700'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${notifPrefs[key] ? 'translate-x-6' : 'translate-x-0'}`} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      </main>

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
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// StatTile imported from @/app/components/StatTile

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

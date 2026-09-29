'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { getActiveTenancy } from '@/lib/tenancy'
import { formatBooking, slotLabel } from '@/lib/booking'
import { displayName } from '@/lib/people'
import AppBar from '@/components/AppBar'
import SignOutButton from '@/app/components/SignOutButton'
import EnableNotifications from '@/app/components/EnableNotifications'
import InstallPrompt from '@/app/components/InstallPrompt'
import { TenantDashboardSkeleton } from '@/app/components/SkeletonLoading'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import TenantOnboarding from '@/app/components/TenantOnboarding'
import Link from 'next/link'

interface Tenancy {
  start_date: string
  end_date: string | null
  status: string | null
  notice_received_date: string | null
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
  people: { name: string; email: string } | null
}

const todayISO = () => new Date().toISOString().split('T')[0]

function dayLabel(iso: string) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (iso === todayISO()) return 'Today'
  if (iso === tomorrow) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function liveStatus(item: any): string | null {
  if (item?.status === 'in_progress') return '🔨 Work underway'
  if (item?.arrived_at)
    return `✓ Arrived ${new Date(item.arrived_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
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

function condensationRisk(temp: number, humidity: number): { level: 'high' | 'medium' | 'low'; text: string } {
  // Cold + very damp — highest condensation risk
  if (temp < 10 && humidity > 75) {
    return { level: 'high', text: `${temp}°C · ${humidity}% humidity outside — cold, damp conditions increase condensation risk. Open a window for 10 minutes to air your room today.` }
  }
  // Very high humidity regardless of temperature — air is saturated
  if (humidity > 80) {
    return { level: 'high', text: `${temp}°C · ${humidity}% humidity outside — very damp air outside. Open windows to ventilate and reduce moisture build-up, especially after cooking or showering.` }
  }
  // Mild cold + damp
  if (temp < 15 && humidity > 65) {
    return { level: 'medium', text: `${temp}°C · ${humidity}% humidity outside — mild condensation risk. Airing your room briefly when you can helps keep moisture down.` }
  }
  // Moderately humid
  if (humidity > 65) {
    return { level: 'medium', text: `${temp}°C · ${humidity}% humidity outside — air is quite damp. Keep windows ajar when cooking or showering where possible.` }
  }
  return { level: 'low', text: `${temp}°C · ${humidity}% humidity outside — conditions are fine. Keep windows ajar when cooking or showering where possible.` }
}

// ── Accordion ────────────────────────────────────────────────────────────────
function Accordion({ id, title, open, onToggle, children, badge }: {
  id: string; title: string; open: boolean; onToggle: () => void; children: React.ReactNode; badge?: React.ReactNode
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-md px-lg py-md text-left hover:bg-neutral-50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-sm font-semibold text-neutral-900">{title}{badge}</span>
        <span className={`text-neutral-400 text-lg leading-none transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>›</span>
      </button>
      <div
        ref={bodyRef}
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? '2000px' : '0px' }}
      >
        <div className="border-t border-neutral-100 px-lg pb-lg pt-md">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Report sheet ─────────────────────────────────────────────────────────────
function ReportSheet({ isHmo, onClose }: { isHmo: boolean; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.45)' }}
    >
      <div className="w-full max-w-lg rounded-t-3xl bg-white px-lg pb-2xl pt-md animate-in slide-in-from-bottom duration-200">
        <div className="mx-auto mb-md h-1 w-10 rounded-full bg-neutral-200" />
        <h2 className="text-xl font-bold text-neutral-900 mb-xs">What's this about?</h2>
        <p className="text-sm text-neutral-500 mb-lg">Pick the closest match.</p>
        <Link
          href="/tenant/maintenance-choose"
          onClick={onClose}
          className="flex items-start gap-md rounded-2xl border-2 border-neutral-200 p-md hover:border-neutral-400 transition-colors mb-md"
        >
          <span className="text-2xl mt-xs">🔧</span>
          <div>
            <p className="font-bold text-neutral-900">Maintenance issue</p>
            <p className="text-sm text-neutral-500">Something broken, not working, or needs fixing</p>
          </div>
        </Link>
        {isHmo && (
          <Link
            href="/tenant/housemate-concern"
            onClick={onClose}
            className="flex items-start gap-md rounded-2xl border-2 border-neutral-200 p-md hover:border-neutral-400 transition-colors mb-lg"
          >
            <span className="text-2xl mt-xs">🏠</span>
            <div>
              <p className="font-bold text-neutral-900">Trouble with a housemate</p>
              <p className="text-sm text-neutral-500">Having a difficult time with someone you live with</p>
            </div>
          </Link>
        )}
        <button onClick={onClose} className="w-full py-md text-sm text-neutral-500 hover:text-neutral-800">
          Cancel
        </button>
      </div>
    </div>
  )
}

const CACHE_KEY = 'cros-tenant-home-cache'
const CACHE_TTL = 90_000 // 90 seconds

function saveCache(data: Record<string, any>) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), ...data })) } catch { /* noop */ }
}
function loadCache(): Record<string, any> | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null }
    return parsed
  } catch { return null }
}

// ── Main component ────────────────────────────────────────────────────────────
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
  const [houseInfo, setHouseInfo] = useState<Array<{ icon: string; label: string; value: string; sensitive?: boolean }>>([])
  const [heatingSchedule, setHeatingSchedule] = useState<{ on?: string; off?: string; note?: string } | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [messages, setMessages] = useState<any[]>([])
  const [viewingAs, setViewingAs] = useState<{ id: string; name: string; role: string } | null>(null)
  const [guides, setGuides] = useState<Array<{ id: string; slug: string; title: string; emoji: string; acknowledged: boolean; acknowledgment_required: boolean }>>([])
  const [guidesLoaded, setGuidesLoaded] = useState(false)
  const [noticesSummary, setNoticesSummary] = useState<{ count: number; taskCount: number; latest: Array<{ notice_type: string; ai_text: string | null; raw_text: string }> } | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isHmo, setIsHmo] = useState(true)
  const [propLat, setPropLat] = useState<number | null>(null)
  const [propLng, setPropLng] = useState<number | null>(null)
  const [weather, setWeather] = useState<{ temp: number; humidity: number } | null>(null)
  const [showReportSheet, setShowReportSheet] = useState(false)
  const [showOnboarding, setShowOnboarding]   = useState(false)
  const [houseInfoOpen, setHouseInfoOpen] = useState(false)
  const [acc, setAcc] = useState<Set<string>>(new Set())

  const searchParams = useSearchParams()

  function toggleAcc(id: string) {
    setAcc(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  useEffect(() => {
    async function checkAuth() {
      // Restore from cache immediately so navigation back feels instant
      const cached = loadCache()
      if (cached && !searchParams.get('as')) {
        setUser(cached.user)
        setTenancy(cached.tenancy)
        setPersonId(cached.personId)
        setRoomId(cached.roomId)
        setAccessRequests(cached.accessRequests || [])
        setUpcoming(cached.upcoming || [])
        setNotes(cached.notes || [])
        setCompliance(cached.compliance)
        setHouseInfo(cached.houseInfo || [])
        setHeatingSchedule(cached.heatingSchedule || null)
        setIsHmo(cached.isHmo ?? true)
        setPropLat(cached.propLat ?? null)
        setPropLng(cached.propLng ?? null)
        setMessages(cached.messages || [])
        setUnreadCount(cached.unreadCount || 0)
        setLoading(false)
        // Refresh in background after restoring from cache
        checkAuth_fetch(null)
        return
      }

      await checkAuth_fetch(searchParams.get('as'))
    }

    async function checkAuth_fetch(asParam: string | null) {
      const data = await getCurrentUser()
      const isAdmin = ['administrator', 'admin'].includes(data?.assignment?.role || '')

      let effectiveId: string
      // Restore viewingAs from sessionStorage if admin navigated back from a sub-page
      const storedAs = (() => { try { return sessionStorage.getItem('cros-view-as') } catch { return null } })()
      const resolvedAs = asParam || (isAdmin ? storedAs : null)

      if (resolvedAs && isAdmin) {
        const supabase = createClient()
        const { data: target } = await supabase
          .from('people')
          .select('id, first_name, last_name, full_name, email, role')
          .eq('id', resolvedAs)
          .single()
        if (!target || target.role !== 'tenant') { router.push('/admin/people'); return }
        setUser(data!.user)
        setViewingAs({ id: resolvedAs, name: displayName(target), role: target.role })
        effectiveId = resolvedAs
        // Persist so sub-page back-navigations don't lose the context
        try { sessionStorage.setItem('cros-view-as', resolvedAs) } catch { /* noop */ }
      } else if (!data || data.assignment?.role !== 'tenant') {
        // Clear any stale viewingAs from a previous admin session
        try { sessionStorage.removeItem('cros-view-as') } catch { /* noop */ }
        router.push('/login')
        return
      } else {
        setUser(data.user)
        effectiveId = (data.assignment as any)?.id
        // Show onboarding if not yet seen on this device
        try {
          if (!localStorage.getItem('cros-onboarded-tenant')) setShowOnboarding(true)
        } catch { /* private mode — skip */ }
      }

      const supabase = createClient()
      const active = await getActiveTenancy(effectiveId)
      setTenancy(active as any)

      if (!active) {
        setPersonId(effectiveId ?? null)
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

      const propId = (active as any).property_id
      const asParam2 = asParam

      // Run all property-level queries in parallel
      const [upResult, cleansResult, viewingsResult, apptResult, notesResult, propResult, notifsResult] = await Promise.all([
        propId ? supabase
          .from('maintenance_tickets')
          .select('id, category, location, room_id, booked_date, booked_slot, status, arrived_at, rooms(name)')
          .eq('property_id', propId)
          .gte('booked_date', todayISO())
          .neq('status', 'completed')
          .order('booked_date') : Promise.resolve({ data: [] }),

        propId ? supabase
          .from('cleans')
          .select('id, clean_date, clean_time, status')
          .eq('property_id', propId)
          .eq('notify_tenants', true)
          .gte('clean_date', todayISO())
          .neq('status', 'completed') : Promise.resolve({ data: [] }),

        // upcoming viewings at my house — dates, times and rooms only, never who is viewing
        propId ? supabase.rpc('cros_my_house_viewings') : Promise.resolve({ data: [] }),

        propId ? supabase
          .from('property_appointments')
          .select('id, appointment_type, appointment_date, appointment_time, visitor_name, notify_tenants')
          .eq('property_id', propId)
          .eq('notify_tenants', true)
          .gte('appointment_date', todayISO()) : Promise.resolve({ data: [] }),

        propId ? fetch(`/api/property-notes?propertyId=${propId}`).then(r => r.ok ? r.json() : { notes: [] }) : Promise.resolve({ notes: [] }),

        propId ? supabase
          .from('properties')
          .select('gas_safe_cert_expiry, electrical_cert_expiry, house_info, lat, lng, property_type, heating_schedule')
          .eq('id', propId)
          .maybeSingle() : Promise.resolve({ data: null }),

        (() => {
          const nb = supabase
            .from('notifications')
            .select('id, title, body, type, link, read, created_at')
            .order('created_at', { ascending: false })
            .limit(20)
          return asParam2 && isAdmin ? nb.eq('person_id', effectiveId) : nb
        })(),
      ])

      if (propId) {
        const cleanItems = ((cleansResult as any).data || []).map((c: any) => ({
          id: `clean-${c.id}`,
          category: 'Communal clean',
          location: c.clean_time ? String(c.clean_time).slice(0, 5) : 'Whole house',
          room_id: null,
          booked_date: c.clean_date,
          booked_slot: null,
          status: c.status,
          rooms: null,
        }))

        const viewingItems = ((viewingsResult as any).data || [])
          .filter((v: any) => v.rooms?.property_id === propId)
          .map((v: any) => {
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

        const apptItems = ((apptResult as any).data || []).map((ap: any) => ({
          id: `appt-${ap.id}`,
          category: String(ap.appointment_type || 'appointment').replace(/_/g, ' '),
          location: ap.appointment_time ? String(ap.appointment_time).slice(0, 5) : (ap.visitor_name || 'Appointment'),
          room_id: null,
          booked_date: ap.appointment_date,
          booked_slot: ap.appointment_time ? String(ap.appointment_time).slice(0, 5) : null,
          status: 'scheduled',
          rooms: null,
        }))

        const merged = [...((upResult as any).data || []), ...cleanItems, ...viewingItems, ...apptItems].sort((x, y) =>
          String(x.booked_date ?? '').localeCompare(String(y.booked_date ?? ''))
        )
        setUpcoming(merged)
        setNotes((notesResult as any).notes || [])
      }

      const prop = (propResult as any).data
      setCompliance(prop || null)
      setHouseInfo((prop as any)?.house_info?.items || [])
      if ((prop as any)?.heating_schedule) setHeatingSchedule((prop as any).heating_schedule)
      // HMO = default if no property_type set; single_let explicitly opts out
      setIsHmo(!(prop?.property_type === 'single_let'))
      if (prop?.lat && prop?.lng) {
        setPropLat(prop.lat)
        setPropLng(prop.lng)
      }

      const notifs = (notifsResult as any).data || []
      setMessages(notifs)
      setUnreadCount(notifs.filter((n: any) => !n.read).length)

      const finalPersonId = effectiveId ?? null
      const finalRoomId = active.room_id ?? null
      setPersonId(finalPersonId)
      setRoomId(finalRoomId)
      setLoading(false)

      // Cache home data for instant back-navigation (non-admin sessions only)
      if (!resolvedAs) {
        saveCache({
          user: data!.user,
          tenancy: active,
          personId: finalPersonId,
          roomId: finalRoomId,
          accessRequests: active.room_id ? [] : [],
          upcoming: ((upResult as any).data || []),
          notes: (notesResult as any).notes || [],
          compliance: (propResult as any).data || null,
          houseInfo: (propResult as any).data?.house_info?.items || [],
          heatingSchedule: (propResult as any).data?.heating_schedule || null,
          isHmo: !((propResult as any).data?.property_type === 'single_let'),
          propLat: (propResult as any).data?.lat ?? null,
          propLng: (propResult as any).data?.lng ?? null,
          messages: notifs,
          unreadCount: notifs.filter((n: any) => !n.read).length,
        })
      }
    }
    checkAuth()
  }, [router, searchParams])

  // Fetch weather once we have lat/lng
  useEffect(() => {
    if (!propLat || !propLng) return
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${propLat}&longitude=${propLng}&current=temperature_2m,relative_humidity_2m&timezone=auto`
    )
      .then(r => r.json())
      .then(d => {
        if (d?.current) {
          setWeather({
            temp: Math.round(d.current.temperature_2m),
            humidity: Math.round(d.current.relative_humidity_2m),
          })
        }
      })
      .catch(() => {})
  }, [propLat, propLng])

  // Load guides + notice board summary after tenancy is known
  useEffect(() => {
    if (!personId) return
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = {}
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      return fetch('/api/tenant/guides', { headers })
    })
      .then(r => r.json())
      .then(d => { if (d.guides) setGuides(d.guides) })
      .catch(() => {})
      .finally(() => setGuidesLoaded(true))

    supabase.auth.getSession().then(({ data: { session } }) => {
      const h: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
      return fetch('/api/tenant/notices', { headers: h })
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.notices) return
        const active = (d.notices as any[]).filter((n: any) => n.status === 'active')
        const taskCount = active.filter((n: any) => n.notice_type === 'task').length
        setNoticesSummary({
          count: active.length,
          taskCount,
          latest: active.slice(0, 2).map((n: any) => ({
            notice_type: n.notice_type,
            ai_text: n.ai_text,
            raw_text: n.raw_text,
          })),
        })
      })
      .catch(() => {})
  }, [personId])

  async function markMessagesRead() {
    const unread = messages.filter((m) => !m.read).map((m) => m.id)
    if (unread.length === 0) return
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })))
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).in('id', unread)
  }

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

  if (loading) return <TenantDashboardSkeleton />

  const rentDate = nextRentDate(tenancy?.rent_due_day ?? null)
  const rentIn = daysUntil(rentDate)
  const nextVisit = upcoming[0]
  const nextIsMyRoom = nextVisit?.room_id === roomId
  const visibleNotes = notes.filter((n) => !n.room_id || n.room_id === roomId)

  // Build the next-visit description line for the tenancy card
  function visitLine(): string | null {
    if (accessRequests.length > 0) return null // shown as separate card
    if (!nextVisit) return null
    const who = String(nextVisit.category ?? '').replace(/-/g, ' ')
    const where = nextIsMyRoom ? 'your room' : 'the house'
    const when = dayLabel(nextVisit.booked_date)
    const slot = slotLabel(nextVisit.booked_slot)
    return `${who} visiting ${where} — ${when}${slot ? ` · ${slot}` : ''}`
  }

  const vLine = visitLine()

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {viewingAs && <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />}
      <InstallPrompt />
      <AppBar
        right={<SignOutButton onSignOut={handleSignOut} />}
      />

      <main className="mx-auto max-w-lg px-lg pb-2xl">

        {/* ── Dark tenancy pill ─────────────────────────────────────────── */}
        <section
          className="-mb-3xl bg-neutral-900 pb-3xl text-white"
          style={{ marginInline: '-16px', paddingInline: '16px' }}
        >
          <div className="flex items-start justify-between gap-md pt-lg">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium uppercase tracking-widest text-white/40">Your tenancy</p>
              <p className="mt-xs text-xl font-bold leading-tight">
                {tenancy?.rooms?.name ? `${tenancy.rooms.name}, ` : ''}
                {tenancy?.properties?.name ?? 'No active tenancy'}
              </p>
              <p className="text-sm text-white/50">{tenancy?.properties?.address}</p>
            </div>
            <Link
              href="/tenant/inbox"
              className="relative mt-1 shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Inbox"
            >
              <span className="text-lg leading-none">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-extrabold text-white leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          </div>

          {tenancy && (
            <div className="mt-lg grid grid-cols-3 gap-md border-t border-white/15 pt-lg">
              <Stat
                label="Rent"
                value={tenancy.rent_amount != null ? `£${Number(tenancy.rent_amount).toLocaleString('en-GB')}` : '—'}
                sub="per month"
              />
              <Stat
                label="Next due"
                value={rentDate ? rentDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                sub={rentIn === 0 ? 'today' : rentIn != null ? `in ${rentIn} days` : ''}
              />
              <Stat
                label="Started"
                value={tenancy.start_date ? new Date(tenancy.start_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}
                sub="contract"
              />
            </div>
          )}

          {/* Single merged next-visit line — no repeated empty states */}
          <p className="mt-lg border-t border-white/15 pt-md text-sm text-white/50">
            {vLine ?? 'Nothing booked at your property right now.'}
          </p>

          {/* ── Short-notice access requests (loud — needs approval) ──── */}
          {accessRequests.map((req) => (
            <Link
              key={req.id}
              href={`/tenant/visit/${req.id}`}
              className="mt-lg block rounded-2xl bg-white p-lg text-neutral-900 shadow-lg hover:shadow-xl transition-shadow"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-amber-600">⚠️ Your approval needed</p>
              <p className="mt-sm text-3xl font-bold leading-tight">{dayLabel(req.booked_date)}</p>
              <p className="text-xl font-semibold text-neutral-700">{slotLabel(req.booked_slot)}</p>
              <p className="mt-lg border-t border-neutral-200 pt-md text-sm">
                Someone needs to come into <strong>your room</strong> for{' '}
                {String(req.category ?? '').replace(/-/g, ' ')} work.
              </p>
              <p className="mt-xs text-sm text-neutral-500">Tap to view details and approve or decline.</p>
              <div className="mt-md">
                <span className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white">View & respond →</span>
              </div>
            </Link>
          ))}

          {/* ── Normal visit — purely informational, no approval framing ── */}
          {accessRequests.length === 0 && nextVisit && (() => {
            const isMaintenanceTicket = !String(nextVisit.id).startsWith('clean-') &&
              !String(nextVisit.id).startsWith('viewing-') &&
              !String(nextVisit.id).startsWith('appt-')
            const isClean = String(nextVisit.id).startsWith('clean-')
            const rawCleanId = isClean ? String(nextVisit.id).replace('clean-', '') : null

            const inner = (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  {nextIsMyRoom ? 'Next visit to your room' : 'Next visit to the house'}
                </p>
                <p className="mt-xs text-2xl font-bold leading-tight">{dayLabel(nextVisit.booked_date)}</p>
                {slotLabel(nextVisit.booked_slot) && (
                  <p className="text-base font-semibold text-neutral-600">{slotLabel(nextVisit.booked_slot)}</p>
                )}
                <p className="mt-md text-sm text-neutral-600">
                  {String(nextVisit.category ?? '').replace(/-/g, ' ')}
                  {nextVisit.rooms?.name ? ` — ${nextVisit.rooms.name}` : ''}
                </p>
                {liveStatus(nextVisit) && (
                  <p className="mt-sm inline-block rounded-full bg-green-100 px-md py-xs text-sm font-bold text-green-800">{liveStatus(nextVisit)}</p>
                )}
                {(isMaintenanceTicket || isClean) && (
                  <p className="mt-sm text-xs text-neutral-400">
                    {isMaintenanceTicket ? 'Tap to add something for this visit →' : 'Tap to request cleaning extras →'}
                  </p>
                )}
              </>
            )

            const cls = 'mt-lg block rounded-2xl bg-white p-md text-neutral-900 shadow-md'
            if (isMaintenanceTicket)
              return <Link href={`/tenant/visit/${nextVisit.id}`} className={cls}>{inner}</Link>
            if (isClean)
              return <Link href={`/tenant/cleaner-extras/${rawCleanId}`} className={cls}>{inner}</Link>
            return <div className={cls}>{inner}</div>
          })()}
        </section>

        {/* ── Below dark band ───────────────────────────────────────────── */}
        <div className="mt-3xl pt-lg space-y-md">
          <EnableNotifications />

          {/* Humidity today — sits at top like a weather widget */}
          {weather && (
            <div className={`rounded-2xl border p-md ${
              condensationRisk(weather.temp, weather.humidity).level === 'high'
                ? 'border-amber-300 bg-amber-50'
                : condensationRisk(weather.temp, weather.humidity).level === 'medium'
                ? 'border-yellow-200 bg-yellow-50'
                : 'border-neutral-200 bg-white'
            }`}>
              <div className="flex items-start gap-sm">
                <span className="text-xl mt-0.5">💧</span>
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900 text-sm">Humidity today</p>
                  <p className="text-sm text-neutral-600 mt-xs leading-snug">
                    {condensationRisk(weather.temp, weather.humidity).text}
                  </p>
                  <p className="text-xs text-neutral-400 mt-sm">Live local reading powered by Open-Meteo.</p>
                </div>
              </div>
            </div>
          )}

          {/* Notice Board */}
          <Link
            href="/tenant/notices"
            className="block rounded-2xl border border-neutral-200 bg-white overflow-hidden hover:border-neutral-400 transition-colors"
          >
            <div className="h-0.5 bg-gradient-to-r from-blue-400 to-amber-400 w-full" />
            <div className="px-lg py-md flex items-center justify-between gap-md">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-sm mb-xs">
                  <span className="text-base">📋</span>
                  <p className="font-bold text-neutral-900">Notice Board</p>
                  {noticesSummary && noticesSummary.taskCount > 0 && (
                    <span className="rounded-full bg-amber-400 px-sm py-0.5 text-xs font-extrabold text-neutral-900">
                      {noticesSummary.taskCount} task{noticesSummary.taskCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {noticesSummary && noticesSummary.latest.length > 0 ? (
                  <div className="space-y-xs">
                    {noticesSummary.latest.map((n, i) => (
                      <p key={i} className="text-sm text-neutral-600 truncate">
                        <span className="font-medium">{n.notice_type === 'task' ? '✅' : n.notice_type === 'house_reminder' ? '🏠' : '📢'}</span>{' '}
                        {(n.ai_text || n.raw_text).slice(0, 70)}{(n.ai_text || n.raw_text).length > 70 ? '…' : ''}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">Shared updates and tasks for your house</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-xs">
                <span className="text-neutral-400 text-lg">›</span>
                {noticesSummary && noticesSummary.count > 0 && (
                  <span className="text-xs text-neutral-400">{noticesSummary.count} active</span>
                )}
              </div>
            </div>
          </Link>

          {/* House Info accordion */}
          {houseInfo.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
              <button
                onClick={() => setHouseInfoOpen(v => !v)}
                className="flex w-full items-start justify-between gap-md px-lg py-md text-left hover:bg-neutral-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-neutral-900">🏠 House Info</p>
                  <p className="text-sm text-neutral-500 mt-xs truncate">
                    {houseInfo.slice(0, 3).map(i => `${i.icon} ${i.label}`).join(' · ')}
                    {houseInfo.length > 3 ? ` · +${houseInfo.length - 3} more` : ''}
                  </p>
                </div>
                <span className={`mt-1 text-neutral-400 text-lg leading-none transition-transform duration-200 ${houseInfoOpen ? 'rotate-180' : ''}`}>›</span>
              </button>
              <div
                className="overflow-hidden transition-all duration-300"
                style={{ maxHeight: houseInfoOpen ? '2000px' : '0px' }}
              >
                <div className="border-t border-neutral-100 px-lg pb-lg pt-md space-y-md">
                  {/* Heating schedule — shown first if set */}
                  {heatingSchedule?.on && (
                    <div className="flex items-start gap-md pb-md border-b border-neutral-100 mb-xs">
                      <span className="text-xl shrink-0">🌡️</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Heating</p>
                        <p className="mt-xs text-sm font-semibold text-neutral-900">
                          On {heatingSchedule.on} · Off {heatingSchedule.off}
                        </p>
                        {heatingSchedule.note && (
                          <p className="mt-xs text-sm text-neutral-600">{heatingSchedule.note}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {houseInfo.map((item, idx) => {
                    const isRevealed = revealed.has(idx)
                    return (
                      <div key={idx} className="flex items-center gap-md">
                        <span className="text-xl shrink-0">{item.icon || '📌'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{item.label}</p>
                          {item.sensitive && !isRevealed ? (
                            <button onClick={() => setRevealed(prev => new Set([...prev, idx]))} className="mt-xs text-sm font-semibold text-blue-600 hover:text-blue-800">
                              Tap to reveal
                            </button>
                          ) : (
                            <p className="mt-xs text-sm font-semibold text-neutral-900 break-words whitespace-pre-line">{item.value || '—'}</p>
                          )}
                        </div>
                        {item.sensitive && isRevealed && (
                          <button onClick={() => setRevealed(prev => { const s = new Set(prev); s.delete(idx); return s })} className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700">
                            Hide
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Report an issue — moved to bottom now screen has more content above */}
          <button
            onClick={() => setShowReportSheet(true)}
            className="w-full rounded-2xl bg-neutral-800 py-md text-center text-base font-bold text-white hover:bg-neutral-700 transition-colors active:scale-[0.98]"
          >
            ⚠️ Report an issue
          </button>

          {/* ── Everything else ─ collapsed accordions ─────────────────── */}
          <div>
            <p className="mb-md text-xs font-bold uppercase tracking-widest text-neutral-400">Everything else</p>
            <div className="space-y-sm">

              {/* Messages history */}
              <Accordion
                id="messages"
                title="Messages"
                open={acc.has('messages')}
                onToggle={() => toggleAcc('messages')}
                badge={
                  messages.some(m => !m.read)
                    ? <span className="ml-xs rounded-full bg-blue-600 px-sm py-0.5 text-xs font-bold text-white">{messages.filter(m => !m.read).length} new</span>
                    : undefined
                }
              >
                {messages.length === 0 ? (
                  <p className="text-sm text-neutral-400">No messages yet.</p>
                ) : (
                  <div className="space-y-sm">
                    {messages.some(m => !m.read) && (
                      <button onClick={markMessagesRead} className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 mb-xs">
                        Mark all read
                      </button>
                    )}
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-xl border p-md ${m.read ? 'border-neutral-100 bg-neutral-50' : 'border-blue-200 bg-blue-50'}`}
                      >
                        <div className="flex items-start justify-between gap-sm">
                          <p className="text-sm font-bold text-neutral-900">{m.title}</p>
                          {!m.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                        </div>
                        {m.body && <p className="mt-xs text-sm text-neutral-700 whitespace-pre-wrap">{m.body}</p>}
                        <p className="mt-sm text-xs text-neutral-400">
                          {new Date(m.created_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {m.link && (
                          <Link href={m.link} className="mt-sm inline-block text-xs font-semibold text-blue-600 hover:underline">
                            View →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Accordion>

              {/* Guides & safety checks */}
              <Accordion
                id="guides"
                title="Guides & safety"
                open={acc.has('guides')}
                onToggle={() => toggleAcc('guides')}
                badge={
                  guides.some(g => g.acknowledgment_required && !g.acknowledged)
                    ? <span className="ml-xs rounded-full bg-amber-500 px-sm py-0.5 text-xs font-bold text-white">Action needed</span>
                    : undefined
                }
              >
                <div className="space-y-sm">
                  {/* Safety certs */}
                  <div className="flex gap-sm">
                    <SafetyBadge title="Gas safety" expiry={compliance?.gas_safe_cert_expiry} />
                    <SafetyBadge title="EICR" expiry={compliance?.electrical_cert_expiry} />
                  </div>
                  {/* Guide cards */}
                  {!guidesLoaded && (
                    <div className="space-y-sm">
                      {[1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-neutral-100 animate-pulse" />)}
                    </div>
                  )}
                  {guides.map(guide => (
                    <a
                      key={guide.id}
                      href={`/tenant/guides/${guide.slug}`}
                      className="flex items-start gap-sm rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors"
                    >
                      <span className="text-xl flex-shrink-0">{guide.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-neutral-900 leading-snug">{guide.title}</p>
                        {guide.acknowledgment_required && (
                          <p className="mt-xs text-xs">
                            {guide.acknowledged
                              ? <span className="text-green-600">✓ Read & confirmed</span>
                              : <span className="text-amber-600">Confirmation required</span>}
                          </p>
                        )}
                      </div>
                    </a>
                  ))}
                  <Link href="/tenant/safety-checks" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                    <div className="flex items-center gap-sm">
                      <span className="text-xl">🔥</span>
                      <p className="text-sm font-bold text-neutral-900">Monthly safety checks</p>
                    </div>
                    <span className="text-neutral-400 text-base">›</span>
                  </Link>
                </div>
              </Accordion>

              {/* Property info & housemates */}
              <Accordion
                id="property"
                title="Property info & housemates"
                open={acc.has('property')}
                onToggle={() => toggleAcc('property')}
              >
                <div className="space-y-sm">
                  <Link href="/tenant/property-info" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                    <div className="flex items-center gap-sm">
                      <span className="text-xl">📄</span>
                      <p className="text-sm font-bold text-neutral-900">Property documents</p>
                    </div>
                    <span className="text-neutral-400 text-base">›</span>
                  </Link>
                  <Link href="/tenant/acknowledgment-notes" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                    <div className="flex items-center gap-sm">
                      <span className="text-xl">📩</span>
                      <p className="text-sm font-bold text-neutral-900">Important notices</p>
                    </div>
                    <span className="text-neutral-400 text-base">›</span>
                  </Link>
                  <Link href="/tenant/housemates" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                    <div className="flex items-center gap-sm">
                      <span className="text-xl">👥</span>
                      <p className="text-sm font-bold text-neutral-900">Meet your housemates</p>
                    </div>
                    <span className="text-neutral-400 text-base">›</span>
                  </Link>
                  <Link href="/tenant/profile" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                    <div className="flex items-center gap-sm">
                      <span className="text-xl">👤</span>
                      <p className="text-sm font-bold text-neutral-900">Your profile</p>
                    </div>
                    <span className="text-neutral-400 text-base">›</span>
                  </Link>
                  <Link href="/tenant/icebreaker" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                    <div className="flex items-center gap-sm">
                      <span className="text-xl">😊</span>
                      <p className="text-sm font-bold text-neutral-900">Housemate profile</p>
                    </div>
                    <span className="text-neutral-400 text-base">›</span>
                  </Link>
                  {/* House contributions */}
                  <Link href="/tenant/contributions" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                    <div className="flex items-center gap-sm">
                      <span className="text-xl">🎉</span>
                      <p className="text-sm font-bold text-neutral-900">House contributions</p>
                    </div>
                    <span className="text-neutral-400 text-base">›</span>
                  </Link>
                  {/* My maintenance requests */}
                  <Link href="/tenant/requests" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                    <div className="flex items-center gap-sm">
                      <span className="text-xl">🔧</span>
                      <p className="text-sm font-bold text-neutral-900">My maintenance requests</p>
                    </div>
                    <span className="text-neutral-400 text-base">›</span>
                  </Link>
                  {/* Property notes */}
                  {visibleNotes.length > 0 && (
                    <div className="mt-sm space-y-sm">
                      <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Property notes</p>
                      {visibleNotes.map((note) => (
                        <PropertyNoteCard key={note.id} note={note} isForMyRoom={!!note.room_id} />
                      ))}
                    </div>
                  )}
                </div>
              </Accordion>

              {/* Moving out */}
              <Accordion
                id="moving"
                title="Moving out?"
                open={acc.has('moving')}
                onToggle={() => toggleAcc('moving')}
              >
                <div className="space-y-sm">
                  <p className="text-sm text-neutral-600">Standard notice is 2 months. Need to leave sooner? Submit a date and Capital Rooms will review it.</p>
                  {tenancy?.notice_received_date ? (
                    <>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-md">
                        <p className="text-sm font-semibold text-amber-900">Notice in progress</p>
                        <p className="mt-xs text-xs text-amber-700">
                          You've given notice to leave{tenancy.end_date ? ` on ${new Date(tenancy.end_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}. Your team will send checkout details shortly.
                        </p>
                      </div>
                      <Link href="/tenant/rescind-notice" className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-md hover:border-neutral-200 transition-colors">
                        <p className="text-sm font-bold text-neutral-900">Changed your mind?</p>
                        <span className="text-neutral-400">›</span>
                      </Link>
                    </>
                  ) : (
                    <Link href="/tenant/give-notice" className="flex items-center justify-between rounded-xl border border-neutral-900 bg-neutral-900 p-md hover:bg-neutral-800 transition-colors">
                      <p className="text-sm font-bold text-white">Give notice (2 months)</p>
                      <span className="text-white/60">›</span>
                    </Link>
                  )}
                  <Link href="/tenant/early-move-out" className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-md hover:border-neutral-400 transition-colors">
                    <p className="text-sm font-bold text-neutral-900">Request an earlier date</p>
                    <span className="text-neutral-400">›</span>
                  </Link>
                </div>
              </Accordion>

            </div>
          </div>

          <p className="mt-lg text-center text-xs text-neutral-400">{user?.email}</p>
        </div>
      </main>

      {/* Report sheet */}
      {showReportSheet && (
        <ReportSheet isHmo={isHmo} onClose={() => setShowReportSheet(false)} />
      )}

      {/* Tenant onboarding — shown once on first login */}
      {showOnboarding && (
        <TenantOnboarding onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-xs text-base font-semibold">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  )
}

function SafetyBadge({ title, expiry }: { title: string; expiry?: string | null }) {
  const inDate = !!expiry && new Date(expiry) >= new Date()
  return (
    <div className={`flex-1 rounded-xl border p-sm text-center ${inDate ? 'border-green-200 bg-green-50' : 'border-neutral-100 bg-neutral-50'}`}>
      <p className="text-xs font-bold text-neutral-700">{title}</p>
      <p className={`text-xs mt-xs ${inDate ? 'text-green-700' : 'text-neutral-400'}`}>
        {inDate ? `✓ valid to ${new Date(expiry!).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : 'On file'}
      </p>
    </div>
  )
}

function PropertyNoteCard({ note, isForMyRoom }: { note: PropertyNote; isForMyRoom?: boolean }) {
  const typeColors = { cleaner: 'bg-green-50 border-green-100', agent: 'bg-blue-50 border-blue-100', admin: 'bg-purple-50 border-purple-100' }
  const typeLabels = { cleaner: '🧹 Cleaner note', agent: '🏠 Agent note', admin: '⚙️ Admin update' }
  return (
    <div className={`rounded-xl border p-md ${typeColors[note.note_type]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {typeLabels[note.note_type]}
        {isForMyRoom && <span className="ml-sm text-neutral-400">· Your room</span>}
      </p>
      <p className="mt-xs text-sm font-bold text-neutral-900">{note.title}</p>
      <p className="mt-xs text-sm text-neutral-700 whitespace-pre-wrap">{note.content}</p>
      <p className="mt-sm text-xs text-neutral-400">
        {(note.people as any)?.name || 'Unknown'} · {new Date(note.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  )
}

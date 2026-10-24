'use client'

import { useState, useEffect, useCallback } from 'react'
import PoppingByVisit from '@/app/components/PoppingByVisit'
import PhoneTabBar, { ICONS } from '@/app/components/PhoneTabBar'
import AddLetOnlyModal from '@/app/components/AddLetOnlyModal'
import { createClient } from '@/lib/supabase'
import { getCurrentUser, signOut } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { displayName } from '@/lib/people'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { fullAddressLine } from '@/lib/formatAddress'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import DarkHeroHeader from '@/app/components/DarkHeroHeader'
import StatTile from '@/app/components/StatTile'
import SendOfferForm from '@/components/SendOfferForm'
import MultiDayDiaryGrid, { type DiaryJob } from '@/app/components/MultiDayDiaryGrid'
import DesktopRightRail from '@/app/components/DesktopRightRail'
import LettingsQuickNotify, { type NotifyMode } from './LettingsQuickNotify'
import ViewingSheet, { notifyLetOnlyContacts } from './ViewingSheet'
import LeadsTab from './LeadsTab'
import StaffNotificationBell from '@/app/components/StaffNotificationBell'
import EnableNotifications from '@/app/components/EnableNotifications'

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
  id: string                  // the tenancy — each one opens its letting file
  name: string
  property_id: string
  property_name: string
  property_address: string
  rent: number | null         // the tenancy's rent
  tenant_name: string | null
  tenant_email: string | null
  state: 'let' | 'on_notice' | 'let_agreed'
  date: string | null         // moves out (on notice) or moves in (let agreed)
}

interface BookingRoom {
  id: string
  name: string
  property_id: string
  status: string | null
  properties: { id: string; name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
]

const blankViewingForm = (date = '', time = '') => ({
  room_id: '',
  viewing_date: date,
  viewing_slot: time,
  duration_minutes: 15,   // a viewing is 15 minutes unless changed (Harry, 17 Oct 2026)
  visitor_name: '',
  visitor_email: '',
  visitor_phone: '',
  feedback: '',
  kind: 'viewing' as 'viewing' | 'photos' | 'other',   // Book appointment: a viewing, photos, or anything else
  property_id: '',      // photos / other can be for the whole house (no room)
  what: '',             // "Other": what it's for
  notifyTenants: true,
  textTenants: true,     // email AND text the house (16 Oct 2026)
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
  if (iso === today) return `Today · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}`
  if (iso === tomorrow) return `Tomorrow · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}`
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatShortDate(iso: string | null) {
  if (!iso) return '—'
  return isoToDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
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

/** The tenants' message for photos / another visit */
function visitNotifyMsg(kind: string, what: string, propertyName: string, date: string, time: string, roomName?: string) {
  const d = date ? isoToDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
  const t = time ? ` at ${String(time).slice(0, 5)}` : ''
  const prop = propertyName || 'the property'
  return kind === 'photos'
    ? `📷 We'll be visiting ${prop} on ${d}${t} to take photos${roomName ? ` of ${roomName}` : ''}. We'll use the management keys and won't go into anyone else's room. Thank you!`
    : `🔑 We'll be visiting ${prop} on ${d}${t} (${what}). We'll use the management keys. Thank you!`
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
  const [quickMenu, setQuickMenu] = useState(false)
  // who can go to a photos / other appointment — the office, contractors and cleaners (17 Oct 2026)
  const [goers, setGoers] = useState<{ id: string; name: string; role: string }[]>([])
  useEffect(() => {
    supabase.from('people').select('id, salutation, first_name, last_name, full_name, company, role, email').in('role', ['administrator', 'admin', 'lettings', 'contractor', 'cleaner']).order('first_name')
      // real people only — not the example / test accounts or a shared inbox with no name
      .then(({ data }) => setGoers(((data ?? []) as any[]).filter(p => !/@example\.com$|\+test@/i.test(p.email ?? '') && (p.first_name || p.company))
        .map(p => ({ id: p.id, role: p.role, name: displayName(p) || p.company || '' })).filter(p => p.name && p.name !== '—')))
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const [popOpen, setPopOpen] = useState(0)
  useEffect(() => {
    if (!quickMenu) return
    const away = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-quick-menu]')) setQuickMenu(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [quickMenu])
  // photos and other visits booked from here (property_appointments) — shown in the diary beside viewings
  const [visits, setVisits] = useState<{ id: string; appointment_type: string; appointment_date: string; appointment_time: string | null; visitor_name: string | null; notes: string | null; property_id: string; properties: { name: string } | null; rooms: { name: string } | null }[]>([])
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [letRooms, setLetRooms] = useState<LetRoom[]>([])
  const [bookingRooms, setBookingRooms] = useState<BookingRoom[]>([])
  // an address that isn't in CROS yet: added as a let-only house from the booking window, then picked for the viewing
  const [addingLetOnly, setAddingLetOnly] = useState(false)

  const [activeTab, setActiveTab] = useState<Tab>('viewings')
  const [selectedDay, setSelectedDay] = useState(todayISO())
  const [weekOffset, setWeekOffset] = useState(0)

  const [addingViewing, setAddingViewing] = useState(false)
  const [viewingForm, setViewingForm] = useState(blankViewingForm())
  const [savingViewing, setSavingViewing] = useState(false)
  const [banner, setBanner] = useState('')

  const [showSettings, setShowSettings] = useState(false)
  const [quickNotify, setQuickNotify] = useState<{ mode: NotifyMode; propertyId?: string; viewingId?: string } | null>(null)
  const [sheetViewingId, setSheetViewingId] = useState<string | null>(null)

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
    const { data: visitData } = await supabase
      .from('property_appointments')
      .select('id, appointment_type, appointment_date, appointment_time, visitor_name, notes, property_id, properties(name)')   // appointments are for a house, not a room (the rooms(name) join made the whole query fail — 21 Oct 2026)
      .in('appointment_type', ['photos', 'other'])
      .gte('appointment_date', todayISO())
      .order('appointment_date', { ascending: true })
      .limit(200)
    setVisits((visitData as any) || [])

    // All available rooms — both managed and let-only properties (unified via properties table)
    const { data: availableData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, available_date, days_on_market, has_ensuite, has_shared_bathroom, has_lounge, properties(name, address, letting_type)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    const allAvailable: AvailableRoom[] = (availableData || []).map((room: any) => ({
      id: room.id,
      name: room.name,
      property_id: room.property_id,
      property_name: room.properties?.name || 'Unknown',
      property_address: room.properties?.address || '',
      current_asking_rent: room.current_asking_rent,
      available_date: room.available_date,
      days_on_market: room.days_on_market,
      is_let_only: room.properties?.letting_type === 'let_only',
      has_ensuite: room.has_ensuite,
      has_shared_bathroom: room.has_shared_bathroom,
      has_lounge: room.has_lounge,
    }))

    setAvailableRooms(allAvailable)

    // Every current and incoming tenancy, by property — each opens its letting file
    const today = new Date().toISOString().slice(0, 10)
    const { data: letData } = await supabase
      .from('tenancies')
      .select('id, start_date, end_date, notice_received_date, rent_amount, property_id, rooms(name), properties(name, address), people!person_id(full_name, salutation, first_name, last_name, email)')
      .or(`end_date.is.null,end_date.gte.${today}`)

    const letMapped: LetRoom[] = (letData || []).map((t: any) => {
      const p = t.people
      const incoming = t.start_date > today
      return {
        id: t.id,
        name: t.rooms?.name || 'Room',
        property_id: t.property_id,
        property_name: t.properties?.name || 'Unknown',
        property_address: t.properties?.address || '',
        rent: t.rent_amount != null ? Number(t.rent_amount) : null,
        tenant_name: p ? [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || null : null,
        tenant_email: p?.email || null,
        state: incoming ? 'let_agreed' : t.notice_received_date ? 'on_notice' : 'let',
        date: incoming ? t.start_date : t.notice_received_date ? t.end_date : null,
      } as LetRoom
    }).sort((a, b) => (a.property_address || a.property_name).localeCompare(b.property_address || b.property_name, undefined, { numeric: true })
      || a.name.localeCompare(b.name, undefined, { numeric: true }) || (a.state === 'let_agreed' ? 1 : -1))
    setLetRooms(letMapped)
  }, [supabase])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data) { router.push('/login'); return }

      const role = data.assignment?.role
      if (!['lettings', 'administrator', 'admin'].includes(role)) { router.push('/login'); return }
      // this phone's "Share to CROS" key (lib/shareKey)
      supabase.auth.getSession().then(({ data: s }) => { if (s.session?.access_token) fetch('/api/auth/share-key', { method: 'POST', headers: { Authorization: `Bearer ${s.session.access_token}` } }).catch(() => {}) })

      // a notification link can open a tab (?tab=available)
      const tabParam = searchParams.get('tab')
      if (tabParam && ['viewings', 'available', 'leads', 'let'].includes(tabParam)) setActiveTab(tabParam as Tab)

      // View-as impersonation — admin only
      const asParam = searchParams.get('as')
      const isAdmin = ['administrator', 'admin'].includes(role || '')
      if (asParam && isAdmin) {
        const { data: target } = await supabase
          .from('people')
          .select('id, full_name, salutation, first_name, last_name, role')
          .eq('id', asParam)
          .maybeSingle()
        if (!target || target.role !== 'lettings') { router.push('/admin/people'); return }
        setViewingAs({
          id: asParam,
          name: [target.salutation, target.first_name, target.last_name].filter(Boolean).join(' ') || target.full_name || 'Lettings User',
          role: target.role,
        })
      }

      if (data.user?.email) {
        const { data: person } = await supabase
          .from('people')
          .select('id, full_name, salutation, first_name, last_name')
          .eq('email', data.user.email)
          .maybeSingle()
        setName(displayName(person) || data.user.email.split('@')[0] || '')
        setPersonId(person?.id)
      }

      await loadData()
      await loadBookingRooms()

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


  // rooms to book viewings in (also reloaded after a new let-only house is added from the booking window)
  async function loadBookingRooms(): Promise<BookingRoom[]> {
    const { data: roomsData } = await createClient()
      .from('rooms')
      .select('id, name, property_id, status, properties(id, name)')
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
    return sortedRooms
  }

  // ── Book viewing ─────────────────────────────────────────────────────────────

  async function handleCreateViewing() {
    if (viewingForm.kind !== 'viewing') return handleCreateVisit()
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

      // Tell the house (push + email) and any let-only contacts, and report what actually went out
      const told: string[] = []
      let notTold = ''
      if (viewingForm.notifyTenants && room?.property_id) {
        const msg = viewingForm.notifyMessage ||
          defaultNotifyMsg(room.properties?.name || '', viewingForm.viewing_date, viewingForm.viewing_slot)
        const res = await fetch('/api/admin/quick-notify-lettings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: room.property_id,
            subject: 'Viewing arranged',
            message: msg,
            notification_type: 'viewing',
            channels: viewingForm.textTenants ? 'push_email_sms' : 'push_email',
          }),
        }).catch(() => null)
        const d = await res?.json().catch(() => ({}))
        if (res?.ok && d?.success !== false) {
          told.push(d?.recipientCount ? `${d.recipientCount} tenant${d.recipientCount === 1 ? '' : 's'} emailed` : 'no current tenants to notify')
          if (viewingForm.textTenants && d?.recipientCount) told.push(`${d.smsCount ?? 0} texted`)
          if (d?.smsFailed?.length) notTold = ` — NOT texted: ${d.smsFailed.join(', ')}`
        }
        else notTold = ` — tenants NOT notified${d?.error || d?.message ? ` (${d.error || d.message})` : ''}`
      }
      if (viewingForm.notifyTenants && await notifyLetOnlyContacts(viewingForm.room_id, 'booked', viewingForm.viewing_date, viewingForm.viewing_slot, room?.name ?? '', name)) {
        told.push('let-only contacts emailed')
      }

      setAddingViewing(false)
      setViewingForm(blankViewingForm())
      // Jump to the booked day
      setSelectedDay(viewingForm.viewing_date)
      setActiveTab('viewings')
      await loadData()
      setBanner(`✅ Viewing booked${told.length ? ` · ${told.join(' · ')}` : ''}${notTold}`)
      setTimeout(() => setBanner(''), notTold ? 10000 : 5000)
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Failed to book viewing')
    } finally {
      setSavingViewing(false)
    }
  }

  // Photos / anything else (17 Oct 2026 — Harry: "Book appointment … it could be photography or a viewing"):
  // a visit to the house (room optional), saved as an appointment so it never counts as a viewing
  async function handleCreateVisit() {
    const f = viewingForm
    const room = bookingRooms.find(r => r.id === f.room_id)
    const propertyId = room?.property_id || f.property_id
    if (!f.viewing_date || !propertyId) { setBanner('Choose the property and the date'); return }
    if (f.kind === 'other' && !f.what.trim()) { setBanner('Say what the appointment is for'); return }
    setSavingViewing(true)
    try {
      const label = f.kind === 'photos' ? 'Photos' : f.what.trim()
      const { error } = await supabase.from('property_appointments').insert({
        property_id: propertyId, room_id: f.room_id || null, appointment_type: f.kind,
        appointment_date: f.viewing_date, appointment_time: f.viewing_slot || null, duration_minutes: f.duration_minutes,
        visitor_name: f.visitor_name.trim() || null, notes: f.kind === 'other' ? label : (f.feedback || null),
        notify_tenants: f.notifyTenants, created_by: personId ?? null,
      })
      if (error) throw new Error(error.message)
      const told: string[] = []
      let notTold = ''
      if (f.notifyTenants) {
        const res = await fetch('/api/admin/quick-notify-lettings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: propertyId, subject: f.kind === 'photos' ? 'Photos being taken' : 'Visit arranged',
            message: f.notifyMessage || visitNotifyMsg(f.kind, label, room?.properties?.name || '', f.viewing_date, f.viewing_slot, room?.name),
            notification_type: 'viewing', channels: f.textTenants ? 'push_email_sms' : 'push_email' }),
        }).catch(() => null)
        const d = await res?.json().catch(() => ({}))
        if (res?.ok && d?.success !== false) {
          told.push(d?.recipientCount ? `${d.recipientCount} tenant${d.recipientCount === 1 ? '' : 's'} emailed` : 'no current tenants to notify')
          if (f.textTenants && d?.recipientCount) told.push(`${d.smsCount ?? 0} texted`)
          if (d?.smsFailed?.length) notTold = ` — NOT texted: ${d.smsFailed.join(', ')}`
        } else notTold = ` — tenants NOT notified${d?.error || d?.message ? ` (${d.error || d.message})` : ''}`
      }
      setAddingViewing(false)
      setViewingForm(blankViewingForm())
      setSelectedDay(f.viewing_date)
      setActiveTab('viewings')
      await loadData()
      setBanner(`✅ ${label} booked${told.length ? ` · ${told.join(' · ')}` : ''}${notTold}`)
      setTimeout(() => setBanner(''), notTold ? 10000 : 5000)
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Could not book it')
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
    .concat(visits.map(a => ({
      id: a.id, date: a.appointment_date, time: a.appointment_time ? String(a.appointment_time).slice(0, 5) : null,
      label: `${a.appointment_type === 'photos' ? '📷 Photos' : `🔑 ${a.notes || 'Visit'}`} · ${a.properties?.name ?? ''}`,
      sublabel: [a.rooms?.name, a.visitor_name].filter(Boolean).join(' · '),
      isOverdue: false,
    })))

  // Properties (from every room) and upcoming viewings, for Quick Notify and the viewing sheet
  const notifyProperties = Array.from(new Map(bookingRooms
    .filter(r => r.properties?.name)
    .map(r => [r.property_id, { id: r.property_id, name: r.properties!.name }])).values())
  const notifyViewings = viewings.map(v => ({
    id: v.id, viewing_date: v.viewing_date, viewing_slot: v.viewing_slot,
    visitor_name: v.visitor_name, visitor_email: v.visitor_email, visitor_phone: v.visitor_phone,
    property_id: v.property_id, property_name: v.properties?.name ?? '',
  }))
  const sheetViewing = (() => {
    const v = viewings.find(x => x.id === sheetViewingId)
    return v ? { ...notifyViewings.find(x => x.id === v.id)!, room_id: v.room_id, room_name: v.rooms?.name ?? '' } : null
  })()

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h1 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 24, margin: '0 0 3px', fontWeight: 800 }}>Diary &amp; Leads</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PoppingByVisit className="rounded-xl bg-white/10 px-md py-sm text-sm font-bold text-white hover:bg-white/20" />
                <StaffNotificationBell />
              </div>
            </div>
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
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setQuickNotify({ mode: 'tenants' })}
                      style={{ background: 'white', color: '#181614', border: '1px solid #D8D2C4', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >⚡ Quick Notify</button>
                    <button
                      onClick={() => { setViewingForm(blankViewingForm(todayISO())); setAddingViewing(true) }}
                      style={{ background: '#4B6358', color: 'white', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >+ Book appointment</button>
                  </div>
                </div>
                {banner && !addingViewing && (
                  <div className="mb-md rounded-xl border border-green-200 bg-green-50 px-lg py-sm text-sm font-semibold text-green-800">{banner}</div>
                )}
                <p style={{ fontSize: 12, color: '#59544C', margin: '0 0 10px' }}>Click an empty slot to book a viewing, or a viewing to move it or message people.</p>
                <MultiDayDiaryGrid
                  jobs={lettingsDiaryJobs}
                  startHour={9}
                  endHour={20}
                  todayISO={todayISO()}
                  onSlotClick={(date, time) => { setViewingForm(blankViewingForm(date, `${time}:00`)); setAddingViewing(true) }}
                  onJobClick={id => setSheetViewingId(id)}
                />
              </div>
            )}
            {activeTab === 'available' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h2 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 18, margin: 0, color: '#181614' }}>Availability <span style={{ fontSize: 13, color: '#78716c', fontWeight: 600 }}>· {availableRooms.length}</span></h2>
                  <span style={{ display: 'flex', gap: 8 }}><a href="/lettings/board" style={{ background: 'white', color: '#181614', border: '1px solid #D8D2C4', textDecoration: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, display: 'inline-block' }}>Marketing board</a><a href="/admin/let-only-properties" style={{ background: '#181614', color: 'white', textDecoration: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-block' }}>+ Let-only property</a></span>
                </div>
                {availableRooms.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center"><p className="text-sm text-neutral-400">No available rooms</p></div>
                ) : (
                  <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">{availableRooms.map(room => <AvailableRoomCard key={room.id} room={room} />)}</div>
                )}
              </div>
            )}
            {activeTab === 'let' && (
              <div>
                <h2 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 18, margin: '0 0 16px', color: '#181614' }}>{letRooms.filter(r => r.state !== 'let_agreed').length} rooms let · {letRooms.filter(r => r.state === 'let_agreed').length} let agreed</h2>
                {letRooms.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center"><p className="text-sm text-neutral-400">No rooms currently let</p></div>
                ) : (
                  <div className="space-y-sm">
                    {letRooms.map(room => (
                      <Link key={room.id} href={`/admin/lettings/${room.id}?from=/lettings`} className="block rounded-2xl bg-white border border-neutral-200 p-lg hover:border-neutral-900 transition-colors shadow-sm">
                        <div className="flex items-start justify-between gap-md">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-neutral-900">{room.name}</p>
                            <p className="text-sm text-neutral-500 mt-xs truncate">{room.property_address || room.property_name}</p>
                            {room.tenant_name && <p className="text-xs text-neutral-400 mt-sm">👤 {room.tenant_name}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-black text-neutral-900">{room.rent ? `£${room.rent.toLocaleString()}` : '—'}</p>
                            <p className="text-xs text-neutral-400">pcm</p>
                            <LetBadge room={room} />
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
                    const viewDate = new Date(v.viewing_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
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
      {/* phone: the same bottom tab bar as the admin app (17 Oct 2026) — replaces the pill strip at the top */}
      <PhoneTabBar fixed className="lg:hidden" label="Lettings sections" tabs={[
        { key: 'viewings', label: 'Diary', icon: ICONS.calendar, onClick: () => { setActiveTab('viewings'); window.scrollTo({ top: 0 }) }, active: activeTab === 'viewings' },
        { key: 'available', label: 'Availability', icon: ICONS.key, onClick: () => { setActiveTab('available'); window.scrollTo({ top: 0 }) }, active: activeTab === 'available' },
        { key: 'leads', label: 'Leads', icon: ICONS.people, onClick: () => { setActiveTab('leads'); window.scrollTo({ top: 0 }) }, active: activeTab === 'leads' },
        { key: 'let', label: 'Let', icon: ICONS.check, onClick: () => { setActiveTab('let'); window.scrollTo({ top: 0 }) }, active: activeTab === 'let' },
        { key: 'me', label: 'Me', icon: ICONS.me, href: '/lettings/profile', active: false },
      ]} />

      {/* ── Dark hero header ────────────────────────────────────────────────── */}
      <DarkHeroHeader
        eyebrow="Lettings"
        heading="Diary & Leads"
        
      >
        <div className="grid grid-cols-3 gap-sm">
          <StatTile value={thisWeekCount} label="This week" />
          <StatTile value={pendingCount} label="Pending" valueColor="text-amber-400" />
          <StatTile value={availableRooms.length} label="Available" valueColor="text-green-400" />
        </div>
      </DarkHeroHeader>

      {/* ── Global banner ──────────────────────────────────────────────────── */}
      {banner && (
        <div className="mx-lg mt-md rounded-xl border border-green-200 bg-green-50 px-lg py-sm text-sm font-semibold text-green-800">
          {banner}
        </div>
      )}

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-lg pb-[120px]">
        <div className="pt-md"><EnableNotifications /></div>
        {/* one slim button for the quick things (Harry, 17 Oct 2026 — the three big buttons wasted the top of the screen) */}
        <div className="relative mt-sm" data-quick-menu>
          <button type="button" onClick={() => setQuickMenu(m => !m)} aria-expanded={quickMenu}
            className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm font-bold text-neutral-900">
            <span>⚡ Quick notify</span><span aria-hidden="true" className="text-neutral-400">{quickMenu ? '▴' : '▾'}</span>
          </button>
          {quickMenu && (
            <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm shadow-lg">
              <button type="button" onClick={() => { setQuickMenu(false); setQuickNotify({ mode: 'tenants' }) }} className="block w-full px-md py-sm text-left font-semibold hover:bg-neutral-50">✉️ Message the tenants at a house</button>
              <button type="button" onClick={() => { setQuickMenu(false); setPopOpen(k => k + 1) }} className="block w-full border-t border-neutral-100 px-md py-sm text-left font-semibold hover:bg-neutral-50">🔑 Popping by a property (key safe)</button>
              <a href="/planner" className="block border-t border-neutral-100 px-md py-sm font-semibold hover:bg-neutral-50">🗂️ Notes, jobs &amp; photos with Capital Rooms</a>
            </div>
          )}
        </div>
        <PoppingByVisit hideButton openKey={popOpen} />

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

            {/* Always-present action (Quick notify is the menu at the top) */}
            <div className="mb-sm">
              <button
                onClick={() => { setViewingForm(blankViewingForm(selectedDay)); setAddingViewing(true) }}
                className="w-full rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 transition-colors"
              >+ Book appointment</button>
            </div>
            <p className="text-xs text-neutral-500 mb-lg text-center">Tap an empty time to book · tap a viewing to move it or message people</p>

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
              const visitMap: Record<string, typeof visits> = {}
              for (const a of visits.filter(x => x.appointment_date === selectedDay)) {
                const key = (a.appointment_time ?? '09:00').slice(0, 5)
                ;(visitMap[key] ??= []).push(a)
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
                    const slotVisits = visitMap[key] ?? []
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
                          style={{ flex: 1, padding: slotViewings.length || slotVisits.length ? '4px 8px' : '0 8px', cursor: slotViewings.length + slotVisits.length === 0 ? 'pointer' : undefined }}
                          onClick={() => {
                            if (slotViewings.length + slotVisits.length === 0) {
                              setViewingForm(f => ({
                                ...blankViewingForm(selectedDay),
                                viewing_date: selectedDay,
                                viewing_slot: key + ':00',
                              }))
                              setAddingViewing(true)
                            }
                          }}
                        >
                          {slotVisits.map(a => (
                            <div key={a.id} style={{ background: '#F3E8D2', borderLeft: '3px solid #A9782F', borderRadius: 7, padding: '5px 8px', marginBottom: 3 }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', margin: 0, lineHeight: 1.3 }}>
                                {a.appointment_type === 'photos' ? '📷 Photos' : `🔑 ${a.notes || 'Visit'}`}{a.visitor_name ? ` · ${a.visitor_name}` : ''}
                              </p>
                              <p style={{ fontSize: 11, color: '#7A5A22', margin: 0, lineHeight: 1.3 }}>{[a.rooms?.name, a.properties?.name].filter(Boolean).join(', ')}</p>
                            </div>
                          ))}
                          {slotViewings.map(v => (
                            <div
                              key={v.id}
                              role="button"
                              onClick={e => { e.stopPropagation(); setSheetViewingId(v.id) }}
                              style={{
                                cursor: 'pointer',
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
                Availability <span className="text-sm font-semibold text-neutral-500">· {availableRooms.length}</span>
              </h2>
              <a href="/lettings/board" className="mr-xs rounded-xl border border-neutral-300 bg-white px-md py-xs text-xs font-bold text-neutral-900">Board</a>
              <a
                href="/admin/let-only-properties"
                className="rounded-full bg-neutral-900 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700 transition-colors"
              >
                + Let-only property
              </a>
            </div>

            {availableRooms.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                <p className="text-sm text-neutral-400">No available rooms right now</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                {availableRooms.map(room => (
                  <AvailableRoomCard key={room.id} room={room} />
                ))}
              </div>
            )}

            {/* Send offer letter */}
            <div id="send-offer" className="mt-xl scroll-mt-lg">
              <SendOfferForm />
            </div>
          </div>
        )}

        {/* ── LEADS ────────────────────────────────────────────────────────── */}
        {activeTab === 'leads' && (
          <div className="pt-lg">
            <LeadsTab />
          </div>
        )}

        {/* ── LET ──────────────────────────────────────────────────────────── */}
        {activeTab === 'let' && (
          <div className="pt-lg">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-base font-bold text-neutral-900">
                {letRooms.filter(r => r.state !== 'let_agreed').length} rooms let · {letRooms.filter(r => r.state === 'let_agreed').length} let agreed
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
                    href={`/admin/lettings/${room.id}?from=/lettings`}
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
                          {room.rent ? `£${room.rent.toLocaleString()}` : '—'}
                        </p>
                        <p className="text-xs text-neutral-400">pcm</p>
                        <LetBadge room={room} />
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

      </div>

      {/* ── Modals — outside the mobile-only wrapper so they open on desktop too ── */}

      {addingViewing && (
        <BookViewingModal
          form={viewingForm}
          setForm={setViewingForm}
          bookingRooms={bookingRooms}
          saving={savingViewing}
          banner={banner}
          onClose={() => { if (!savingViewing) { setAddingViewing(false); setBanner('') } }}
          onSave={handleCreateViewing}
          onAddProperty={() => setAddingLetOnly(true)}
          me={name}
          goers={goers}
        />
      )}

      {addingLetOnly && (
        <AddLetOnlyModal
          createdByPersonId={personId}
          onClose={() => setAddingLetOnly(false)}
          onSave={async (property: any, roomIds: string[]) => {
            setAddingLetOnly(false)
            const rooms = await loadBookingRooms()
            // the room just added (not simply the house's first room — that may be one already let)
            const first = rooms.find(r => r.id === roomIds[0]) ?? rooms.filter(r => r.property_id === property?.id)
              .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { numeric: true }))[0]
            if (first) setViewingForm(f => ({ ...f, room_id: first.id, notifyMessage: defaultNotifyMsg(first.properties?.name || '', f.viewing_date, f.viewing_slot) }))
          }}
        />
      )}

      {sheetViewing && (
        <ViewingSheet
          viewing={sheetViewing}
          senderName={name}
          onClose={() => setSheetViewingId(null)}
          onChanged={async summary => {
            setSheetViewingId(null)
            await loadData()
            setBanner(summary)
            setTimeout(() => setBanner(''), 8000)
          }}
          onQuickNotify={mode => {
            setSheetViewingId(null)
            setQuickNotify({ mode, propertyId: sheetViewing.property_id ?? undefined, viewingId: sheetViewing.id })
          }}
        />
      )}

      {quickNotify && (
        <LettingsQuickNotify
          properties={notifyProperties}
          viewings={notifyViewings}
          initialMode={quickNotify.mode}
          initialPropertyId={quickNotify.propertyId}
          initialViewingId={quickNotify.viewingId}
          onClose={() => setQuickNotify(null)}
          onSent={summary => {
            setQuickNotify(null)
            setBanner(summary)
            setTimeout(() => setBanner(''), 8000)
          }}
        />
      )}
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

// One room to let — two tight lines (Harry, 17 Oct 2026: the cards were far too big, the address and the date hard to
// find): the full address and the rent, then the room, when it's free, and what's notable. Days empty are counted
// from the available date (the stored days_on_market was never kept up to date — it read 0 everywhere).
function AvailableRoomCard({ room }: { room: AvailableRoom }) {
  const href = `/lettings/listing/${room.id}`   // the room's listing: photos, details, share link (17 Oct 2026)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const from = room.available_date ? String(room.available_date).slice(0, 10) : null
  const empty = from && from <= today ? Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000) : null
  const when = !from ? 'Date not set' : from <= today ? 'Available now' : `From ${formatShortDate(from)}`
  const tag = 'rounded px-1 py-px text-[10px] font-bold uppercase leading-none tracking-wide'
  return (
    <Link href={href} className="flex items-center gap-md px-md py-sm hover:bg-neutral-50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-neutral-900">{fullAddressLine({ address: room.property_address, name: room.property_name })}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-sm gap-y-0.5 text-xs text-neutral-500">
          <span className="font-semibold text-neutral-700">{room.name}</span>
          <span className={from && from <= today ? 'font-semibold text-emerald-700' : ''}>{when}</span>
          {room.is_let_only && <span className={`${tag} bg-purple-100 text-purple-700`}>Let-only</span>}
          {room.has_ensuite === true && <span className={`${tag} bg-emerald-50 text-emerald-700`}>En-suite</span>}
          {room.has_lounge === true && <span className={`${tag} bg-neutral-100 text-neutral-600`}>Lounge</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-black tabular-nums text-neutral-900">{room.current_asking_rent ? `£${room.current_asking_rent.toLocaleString()}` : '—'}</p>
        {empty != null && empty > 0 && (
          <p className={`text-[11px] font-semibold ${empty > 28 ? 'text-red-600' : empty > 14 ? 'text-amber-600' : 'text-neutral-400'}`}>{empty}d empty</p>
        )}
      </div>
    </Link>
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
  onAddProperty: () => void
  /** the person booking — "Who's going" starts as them */
  me?: string
  goers?: { id: string; name: string; role: string }[]
}

function BookViewingModal({ form, setForm, bookingRooms, saving, banner, onClose, onSave, onAddProperty, me = '', goers = [] }: BookViewingModalProps) {
  // photos / other: whoever's booking is going, unless they pick someone else (a contractor going in that nobody has
  // told the tenants about, the cleaner, another of the office)
  useEffect(() => {
    if (form.kind !== 'viewing' && !form.visitor_name && me) setForm(f => ({ ...f, visitor_name: me }))
    if (form.kind === 'viewing' && form.visitor_name === me) setForm(f => ({ ...f, visitor_name: '' }))
  }, [form.kind])   // eslint-disable-line react-hooks/exhaustive-deps
  const ROLE: Record<string, string> = { administrator: 'Office', admin: 'Office', lettings: 'Lettings', contractor: 'Contractor', cleaner: 'Cleaner' }
  const [propertyId, setPropertyId] = useState(() => bookingRooms.find(r => r.id === form.room_id)?.property_id ?? '')
  // a room picked from outside (a let-only house just added) brings its property with it
  useEffect(() => {
    const p = bookingRooms.find(r => r.id === form.room_id)?.property_id
    if (p && p !== propertyId) setPropertyId(p)
  }, [form.room_id, bookingRooms])   // eslint-disable-line react-hooks/exhaustive-deps
  // bookingRooms is already sorted by address, so properties keep that order
  const propertyOptions = Array.from(bookingRooms.reduce((m, r) => {
    const p = m.get(r.property_id) ?? { id: r.property_id, name: r.properties?.name || 'Unnamed property', available: 0 }
    if (r.status === 'available') p.available++
    return m.set(r.property_id, p)
  }, new Map<string, { id: string; name: string; available: number }>()).values())
  const roomOptions = bookingRooms.filter(r => r.property_id === propertyId)
    .sort((a, b) => Number(b.status === 'available') - Number(a.status === 'available'))
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
          <h2 className="text-xl font-bold text-neutral-900">Book an appointment</h2>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
        </div>

        {banner && (
          <div className="mb-md rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{banner}</div>
        )}

        {/* What it's for — a viewing, photos, or anything else (never blocked: photos / other don't need a room) */}
        <div className="mb-md flex gap-xs" role="radiogroup" aria-label="Appointment type">
          {([['viewing', 'Viewing'], ['photos', '📷 Photos'], ['other', 'Other']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={form.kind === k}
              onClick={() => setForm(f => ({ ...f, kind: k, notifyMessage: '' }))}
              className={`flex-1 rounded-xl border px-md py-sm text-sm font-bold ${form.kind === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700'}`}>{l}</button>
          ))}
        </div>
        {form.kind === 'other' && (
          <input value={form.what} onChange={e => setForm(f => ({ ...f, what: e.target.value }))} placeholder="What's it for? e.g. Measure up, inventory, key handover"
            className="mb-md w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900" />
        )}

        <div className="space-y-md">
          {/* Property, then room — available rooms first */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">
                Property <span className="text-red-500">*</span>
              </label>
              <select
                value={propertyId}
                onChange={e => {
                  setPropertyId(e.target.value)
                  const rooms = bookingRooms.filter(r => r.property_id === e.target.value)
                  // One room (or one available room) → pick it straight away
                  const only = rooms.length === 1 ? rooms[0] : rooms.filter(r => r.status === 'available').length === 1 ? rooms.find(r => r.status === 'available') : undefined
                  setForm(f => ({
                    ...f,
                    property_id: e.target.value,
                    room_id: f.kind === 'viewing' ? (only?.id ?? '') : '',
                    notifyMessage: f.kind === 'viewing' ? defaultNotifyMsg(rooms[0]?.properties?.name || '', f.viewing_date, f.viewing_slot) : '',
                  }))
                }}
                className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900"
              >
                <option value="">Select a property…</option>
                {propertyOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.available ? ` · ${p.available} available` : ''}</option>
                ))}
              </select>
              <button type="button" onClick={onAddProperty} className="mt-xs text-xs font-semibold text-blue-700 hover:underline">
                Address not listed? Add it as a let-only property
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">
                Room {form.kind === 'viewing' ? <span className="text-red-500">*</span> : <span className="font-normal normal-case text-neutral-400">(optional — whole house if blank)</span>}
              </label>
              <select
                value={form.room_id}
                disabled={!propertyId}
                onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}
                className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
              >
                <option value="">{propertyId ? 'Select a room…' : 'Choose the property first'}</option>
                {roomOptions.map(r => (
                  <option key={r.id} value={r.id}>{r.name}{r.status === 'available' ? ' · available' : ''}</option>
                ))}
              </select>
            </div>
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
                  notifyMessage: defaultNotifyMsg(propertyOptions.find(p => p.id === propertyId)?.name || '', e.target.value, f.viewing_slot),
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
                  notifyMessage: defaultNotifyMsg(propertyOptions.find(p => p.id === propertyId)?.name || '', f.viewing_date, e.target.value),
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
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">{form.kind === 'viewing' ? <>Visitor name <span className="text-red-500">*</span></> : <>Who&apos;s going <span className="font-normal normal-case text-neutral-400">(optional)</span></>}</label>
              {form.kind !== 'viewing' && (goers.length > 0) && !(form.visitor_name && !goers.some(g => g.name === form.visitor_name) && form.visitor_name !== me) ? (
                <select value={form.visitor_name} onChange={e => setForm(f => ({ ...f, visitor_name: e.target.value === '__other' ? ' ' : e.target.value }))}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 bg-white">
                  {me && <option value={me}>{me} (me)</option>}
                  {(['administrator', 'lettings', 'contractor', 'cleaner'] as const).map(r => {
                    const list = goers.filter(g => (r === 'administrator' ? ['administrator', 'admin'].includes(g.role) : g.role === r) && g.name !== me)
                    return list.length ? <optgroup key={r} label={ROLE[r]}>{list.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}</optgroup> : null
                  })}
                  <option value="__other">Someone else…</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={form.visitor_name.trimStart()}
                  onChange={e => setForm(f => ({ ...f, visitor_name: e.target.value }))}
                  placeholder={form.kind === 'viewing' ? 'Jane Smith' : 'Their name'}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900"
                />
              )}
            </div>
            {form.kind === 'viewing' && <>
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
            </>}
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
                Tell the tenants at this property (email)
              </label>
            </div>
            {form.notifyTenants && (
              <label className="flex items-center gap-sm text-sm text-blue-900">
                <input type="checkbox" className="rounded" checked={form.textTenants !== false} onChange={e => setForm(f => ({ ...f, textTenants: e.target.checked }))} />
                Text them too
              </label>
            )}
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
              {saving ? 'Booking…' : form.kind === 'viewing' ? 'Book viewing' : form.kind === 'photos' ? 'Book photos' : 'Book appointment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Let, on notice (moving out) or let agreed (moving in) — on each tenancy in the Let tab
function LetBadge({ room }: { room: LetRoom }) {
  const d = room.date ? new Date(`${room.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''
  const [cls, text] = room.state === 'let_agreed' ? ['bg-amber-100 text-amber-900', `Let agreed${d ? ` · in ${d}` : ''}`]
    : room.state === 'on_notice' ? ['bg-orange-100 text-orange-900', `On notice${d ? ` · out ${d}` : ''}`]
    : ['bg-green-100 text-green-700', 'Let']
  return <span className={`mt-xs inline-block rounded-full px-sm py-0.5 text-xs font-bold ${cls}`}>{text}</span>
}

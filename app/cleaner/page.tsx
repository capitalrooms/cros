'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { displayName } from '@/lib/people'
import DarkHeroHeader from '@/app/components/DarkHeroHeader'
import StatTile from '@/app/components/StatTile'
import EnableNotifications from '@/app/components/EnableNotifications'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import StaffQuickNotifyModal from '@/app/components/StaffQuickNotifyModal'
import MultiDayDiaryGrid, { DiaryJob } from '@/app/components/MultiDayDiaryGrid'
import DesktopRightRail from '@/app/components/DesktopRightRail'
import { isDatePast, isDateToday, isDateFuture, formatDateUK, getDaysUntil } from '@/lib/dateUtils'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

interface ComplianceLog {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  checked_date: string
  notes: string | null
  checked_by_role: string
  people?: { name: string } | null
}

const checkTypeLabels: Record<string, string> = {
  fire_door: '🚪 Fire Door',
  smoke_alarm: '🔔 Smoke Alarm',
}

const sixMonthsAgo = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().split('T')[0]
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
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

type Tab = 'today' | 'upcoming' | 'done' | 'compliance'

// ── Clean card — lettings-style white card ─────────────────────────────────
function CleanCard({ c, onClick }: { c: any; onClick: () => void }) {
  const overdue = isDatePast(c.clean_date)
  const today   = isDateToday(c.clean_date)
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border border-neutral-200 bg-white p-md shadow-sm text-left hover:shadow-md transition-shadow flex items-center justify-between gap-md"
    >
      <div className="min-w-0 flex-1">
        <p className="font-bold text-neutral-900 truncate">{c.properties?.name}</p>
        <p className="text-sm text-neutral-500">
          {formatDateUK(c.clean_date)}{c.clean_time ? ` · ${String(c.clean_time).slice(0, 5)}` : c.status !== 'completed' ? ' · time to confirm' : ''}
        </p>
        {c.properties?.clean_frequency_weeks && (
          <p className="text-xs text-neutral-400 mt-xs">
            {c.properties.clean_frequency_weeks === 1 ? 'Weekly' : `Every ${c.properties.clean_frequency_weeks} weeks`}
          </p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-sm">
        {overdue && (
          <span className="rounded-full bg-red-100 text-red-700 text-xs font-bold px-sm py-xs">
            {Math.abs(getDaysUntil(c.clean_date))}d overdue
          </span>
        )}
        {today && !overdue && (
          <span className="rounded-full bg-blue-100 text-blue-700 text-xs font-bold px-sm py-xs">Today</span>
        )}
        {!today && !overdue && (
          <span className="text-xs text-neutral-400 font-semibold">
            in {getDaysUntil(c.clean_date)}d
          </span>
        )}
        <span className="text-neutral-400 text-sm">›</span>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CleanerDashboard() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading]         = useState(true)
  const [me, setMe]                   = useState<any>(null)
  const [personId, setPersonId]       = useState<string>('')
  const [cleanerName, setCleanerName] = useState<string>('')
  const [viewingAs, setViewingAs]     = useState<{ id: string; name: string; role: string } | null>(null)
  const [properties, setProperties]   = useState<any[]>([])
  const [cleans, setCleans]           = useState<any[]>([])
  const [complianceLogs, setComplianceLogs] = useState<ComplianceLog[]>([])
  const [error, setError]             = useState('')

  // booking form state (used by modal)
  const [propertyId, setPropertyId]   = useState('')
  const [cleanDate, setCleanDate]     = useState(new Date().toISOString().split('T')[0])
  const [cleanTime, setCleanTime]     = useState('10:00')
  const [booking, setBooking]         = useState(false)
  const [bookedNotice, setBookedNotice] = useState('')

  // compliance modal
  const [showAddComplianceModal, setShowAddComplianceModal] = useState(false)
  const [savingCompliance, setSavingCompliance]             = useState(false)
  const [complianceForm, setComplianceForm] = useState({ check_type: 'fire_door' as const, date: new Date().toISOString().split('T')[0], notes: '' })
  const [compliancePropertyId, setCompliancePropertyId]    = useState('')

  // log past clean modal
  const [showLogPastCleanModal, setShowLogPastCleanModal] = useState(false)
  const [pastCleanForm, setPastCleanForm] = useState({ propertyId: '', cleanDate: new Date().toISOString().split('T')[0], notes: '' })
  const [savingPastClean, setSavingPastClean] = useState(false)

  // book clean modal
  const [showBookCleanModal, setShowBookCleanModal] = useState(false)

  // assigned jobs
  const [assignedJobs, setAssignedJobs]           = useState<any[]>([])
  const [showAcceptJobModal, setShowAcceptJobModal] = useState<string | null>(null)
  const [acceptJobForm, setAcceptJobForm] = useState({ cleanDate: new Date().toISOString().split('T')[0], cleanTime: '10:00' })
  const [acceptingJob, setAcceptingJob] = useState(false)
  const [decliningJob, setDecliningJob] = useState<string | null>(null)
  const [showDeclineModal, setShowDeclineModal] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')

  // quick notify
  const [showQuickNotifyModal, setShowQuickNotifyModal]   = useState(false)
  const [quickNotifyProperty, setQuickNotifyProperty]     = useState<{ id: string; name: string } | null>(null)

  // pagination
  const [cleansDisplayLimit, setCleansDisplayLimit] = useState(20)

  // UI
  const [activeTab, setActiveTab] = useState<Tab>('today')
  const [showFabMenu, setShowFabMenu] = useState(false)
  const [selectedDay, setSelectedDay] = useState(todayISO())
  const [weekOffset, setWeekOffset] = useState(0)

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const data    = await getCurrentUser()
        const asParam = searchParams.get('as')
        const isAdmin = ['administrator', 'admin'].includes(data?.assignment?.role || '')

        const supabase = createClient()
        let targetPersonId: string

        if (asParam && isAdmin) {
          // Admin viewing as a cleaner
          const { data: target } = await supabase
            .from('people')
            .select('id, full_name, first_name, last_name, role')
            .eq('id', asParam)
            .single()
          if (!target || target.role !== 'cleaner') { router.push('/admin/people'); return }
          setViewingAs({ id: asParam, name: displayName(target), role: target.role })
          setCleanerName(displayName(target))
          targetPersonId = asParam
        } else {
          if (!data || data.assignment?.role !== 'cleaner') { router.push('/login'); return }
          setMe(data.assignment)

          const { data: personData } = await supabase
            .from('people')
            .select('id, full_name, first_name, last_name')
            .eq('email', data.user?.email)
            .single()

          if (!personData?.id) { router.push('/login'); return }
          setCleanerName(displayName(personData))
          targetPersonId = personData.id
        }

        setPersonId(targetPersonId)
        await loadCleans(targetPersonId, cleansDisplayLimit)

        const { data: props } = await supabase
          .from('properties')
          .select('id, name, address, clean_frequency_weeks')
          .order('name')
        setProperties(sortPropertiesNumerically(props || []))
        if (props?.[0]) {
          setPropertyId(props[0].id)
          setCompliancePropertyId(props[0].id)
          await loadComplianceLogs(props[0].id)
        }

        await loadAssignedJobs()
        setLoading(false)
      } catch (err) {
        console.error('Cleaner dashboard init error:', err)
        setLoading(false)
      }
    }
    init()
  }, [router, searchParams])

  // ── Data loaders ──────────────────────────────────────────────────────────
  async function loadCleans(cleanerId: string, limit = 20) {
    const supabase = createClient()
    const { data } = await supabase
      .from('cleans')
      .select('*, properties(id, name, address, clean_frequency_weeks)')
      .eq('cleaner_id', cleanerId)
      .order('clean_date', { ascending: false })
      .limit(limit)
    setCleans(data || [])
  }

  async function loadAssignedJobs() {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const h: Record<string, string> = {}
      if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch('/api/jobs/assigned', { headers: h })
      if (!res.ok) return
      const data = await res.json()
      setAssignedJobs(data.jobs || [])
    } catch {}
  }

  async function loadComplianceLogs(propId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('compliance_logs')
      .select('id, check_type, checked_date, notes, checked_by_role, people(full_name, first_name, last_name)')
      .eq('property_id', propId)
      .gte('checked_date', sixMonthsAgo())
      .order('checked_date', { ascending: false })
      .limit(50)
    setComplianceLogs((data || []) as any)
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function bookClean() {
    if (!propertyId || !cleanDate || booking) return
    setError(''); setBookedNotice(''); setBooking(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('cleans').insert({
      property_id: propertyId,
      cleaner_id: personId,
      clean_date: cleanDate,
      clean_time: cleanTime || null,
    })
    if (err) { setBooking(false); return setError(err.message) }
    await loadCleans(personId)
    setBooking(false)
    const propName = properties.find((p) => p.id === propertyId)?.name || 'the property'
    const when = new Date(cleanDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    setBookedNotice(`✅ Clean booked for ${propName} on ${when}${cleanTime ? ` at ${cleanTime}` : ''}.`)
    setShowBookCleanModal(false)
  }

  async function logPastClean() {
    if (!pastCleanForm.propertyId || !pastCleanForm.cleanDate) { setError('Please fill in property and date'); return }
    setSavingPastClean(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.from('cleans').insert({
        property_id: pastCleanForm.propertyId,
        cleaner_id: personId,
        clean_date: pastCleanForm.cleanDate,
        status: 'completed',
        completed_at: new Date().toISOString(),
        notes: pastCleanForm.notes || null,
      })
      if (err) throw err
      setPastCleanForm({ propertyId: '', cleanDate: new Date().toISOString().split('T')[0], notes: '' })
      setShowLogPastCleanModal(false)
      await loadCleans(personId, cleansDisplayLimit)
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally { setSavingPastClean(false) }
  }

  async function declineJob(jobId: string) {
    setDecliningJob(jobId)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const h: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/jobs/${jobId}/decline`, {
        method: 'PUT',
        headers: h,
        body: JSON.stringify({ reason: declineReason }),
      })
      if (!res.ok) throw new Error('Failed to decline job')
      setShowDeclineModal(null)
      setDeclineReason('')
      await loadAssignedJobs()
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally { setDecliningJob(null) }
  }

  async function acceptJob(jobId: string) {
    if (!acceptJobForm.cleanDate) { setError('Please select a date'); return }
    setAcceptingJob(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const h: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/jobs/${jobId}/accept`, {
        method: 'PUT',
        headers: h,
        body: JSON.stringify({ clean_date: acceptJobForm.cleanDate, clean_time: acceptJobForm.cleanTime }),
      })
      if (!res.ok) throw new Error('Failed to accept job')
      setShowAcceptJobModal(null)
      await loadAssignedJobs()
      await loadCleans(personId, cleansDisplayLimit)
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally { setAcceptingJob(false) }
  }

  async function handleAddComplianceLog() {
    if (!compliancePropertyId || !complianceForm.date || !personId) { alert('Please fill in all fields'); return }
    setSavingCompliance(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('compliance_logs').insert({
        property_id: compliancePropertyId,
        check_type: complianceForm.check_type,
        checked_by: personId,
        checked_by_role: 'cleaner',
        checked_date: complianceForm.date,
        notes: complianceForm.notes || null,
      })
      if (error) throw error
      setComplianceForm({ check_type: 'fire_door', date: new Date().toISOString().split('T')[0], notes: '' })
      setShowAddComplianceModal(false)
      await loadComplianceLogs(compliancePropertyId)
      alert('✅ Check logged')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally { setSavingCompliance(false) }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <div className="bg-neutral-950 pb-xl">
          <div style={{ height: 'calc(env(safe-area-inset-top) + 52px)' }} />
          <div className="px-lg pt-lg">
            <div className="h-2.5 w-14 rounded-full bg-white/20 mb-sm" />
            <div className="h-7 w-44 rounded-xl bg-white/20 mb-xl" />
            <div className="grid grid-cols-3 gap-sm">
              {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-neutral-900 animate-pulse" />)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const scheduledCleans = cleans.filter(c => c.status !== 'completed')
  const overdueCleans   = scheduledCleans.filter(c => c.clean_date && isDatePast(c.clean_date))
  const todayCleans     = scheduledCleans.filter(c => c.clean_date && isDateToday(c.clean_date))
  const upcomingCleans  = scheduledCleans.filter(c => c.clean_date && isDateFuture(c.clean_date))
  const doneCleans      = cleans.filter(c => c.status === 'completed')

  const dayCleans   = scheduledCleans.filter(c => c.clean_date === selectedDay)
  const isViewingToday = selectedDay === todayISO()

  const firstName = cleanerName.split(' ')[0] || me?.email?.split('@')[0] || 'there'

  // ── Desktop computed ─────────────────────────────────────────────────────
  const diaryJobs: DiaryJob[] = scheduledCleans.map((c: any) => ({
    id: c.id,
    date: c.clean_date,
    time: c.clean_time ?? null,
    label: c.properties?.name ?? 'Clean',
    isOverdue: c.clean_date ? isDatePast(c.clean_date) : false,
    href: `/cleaner/clean/${c.id}`,
  }))
  const dateCounts: Record<string, number> = {}
  scheduledCleans.forEach((c: any) => {
    if (c.clean_date) dateCounts[c.clean_date] = (dateCounts[c.clean_date] || 0) + 1
  })
  // Also show assigned-job due dates on the calendar
  assignedJobs.forEach((j: any) => {
    if (j.due_date) dateCounts[j.due_date] = (dateCounts[j.due_date] || 0) + 1
  })
  const railAlerts = [
    ...(overdueCleans.length > 0 ? [{ title: `${overdueCleans.length} overdue clean${overdueCleans.length !== 1 ? 's' : ''}`, body: 'Tap to reschedule', variant: 'red' as const, onClick: () => setActiveTab('today') }] : []),
    ...(assignedJobs.length > 0 ? [{ title: `${assignedJobs.length} job${assignedJobs.length !== 1 ? 's' : ''} need accepting`, body: 'Tap to view & accept', variant: 'amber' as const, onClick: () => setActiveTab('today') }] : []),
    ...(todayCleans.length > 0 ? [{ title: `${todayCleans.length} clean${todayCleans.length !== 1 ? 's' : ''} today`, variant: 'sage' as const, onClick: () => setActiveTab('today') }] : []),
    ...(upcomingCleans.length > 0 ? [{ title: `${upcomingCleans.length} upcoming`, variant: 'default' as const, onClick: () => setActiveTab('upcoming') }] : []),
  ]
  // Next few scheduled cleans for the "Coming Up" rail section
  const comingUpCleans = upcomingCleans.slice(0, 4)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'today',      label: `Today${todayCleans.length + overdueCleans.length > 0 ? ` (${todayCleans.length + overdueCleans.length})` : ''}` },
    { key: 'upcoming',   label: 'Upcoming' },
    { key: 'done',       label: 'Done' },
    { key: 'compliance', label: 'Compliance' },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>

      {/* Dismiss FAB menu on backdrop click */}
      {showFabMenu && (
        <div className="fixed inset-0 z-20" onClick={() => setShowFabMenu(false)} />
      )}

      {/* ── View-as banner ────────────────────────────────────────────────── */}
      {viewingAs && (
        <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />
      )}

      {/* ── DESKTOP 3-column shell (lg+) ──────────────────────────────────── */}
      <div className="hidden lg:grid lg:min-h-screen" style={{ gridTemplateColumns: '220px 1fr 300px', background: '#F6F3EC' }}>

        {/* Left sidebar */}
        <aside style={{ background: '#181614', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <div style={{ padding: '28px 20px 20px' }}>
            <div style={{ fontWeight: 800, fontSize: '12px', letterSpacing: '0.14em', color: '#F6F3EC', textTransform: 'uppercase' }}>Capital Rooms</div>
            <div style={{ fontSize: '11px', color: '#4B6358', fontWeight: 700, marginTop: 2 }}>Cleaner</div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#F6F3EC' }}>Hi {firstName} 👋</div>
          </div>
          <nav style={{ flex: 1, padding: '0 10px' }}>
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 12px', borderRadius: 10, marginBottom: 3,
                  fontSize: '13px', fontWeight: 600,
                  background: activeTab === key ? '#4B6358' : 'transparent',
                  color: activeTab === key ? '#F6F3EC' : '#9ca3af',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div style={{ padding: '20px' }}>
            <button
              onClick={async () => { await signOut(); router.push('/login') }}
              style={{ fontSize: '12px', color: '#9ca3af', background: 'none', border: '1px solid #374151', borderRadius: '6px', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none"><path d="M3 1.5h5.5a.5.5 0 0 1 .5.5v2h1V2A1.5 1.5 0 0 0 8.5.5H3A1.5 1.5 0 0 0 1.5 2v11A1.5 1.5 0 0 0 3 14.5h5.5A1.5 1.5 0 0 0 10 13v-2H9v2a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z" fill="currentColor"/><path d="M6 7.5a.5.5 0 0 1 .5-.5H13a.5.5 0 0 1 0 1H6.5A.5.5 0 0 1 6 7.5zm5.146-2.646a.5.5 0 0 1 .708.708L9.707 7.5l2.147 2.146a.5.5 0 0 1-.708.708l-2.5-2.5a.5.5 0 0 1 0-.708l2.5-2.5z" fill="currentColor"/></svg>
              Log out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main style={{ overflowY: 'auto' }}>
          {/* Dark stats header */}
          <div style={{ background: '#181614', padding: '28px 28px 20px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#F6F3EC', marginBottom: 16 }}>Cleans</h1>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {([
                { value: overdueCleans.length, label: 'Overdue', color: overdueCleans.length > 0 ? '#f87171' : '#F6F3EC' },
                { value: todayCleans.length,   label: 'Today',   color: '#60a5fa' },
                { value: upcomingCleans.length, label: 'Upcoming', color: '#F6F3EC' },
              ] as { value: number; label: string; color: string }[]).map(({ value, label, color }) => (
                <div key={label} style={{ background: '#1f2937', borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Diary */}
          <div style={{ padding: '20px 28px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Diary</p>
            <MultiDayDiaryGrid jobs={diaryJobs} startHour={8} endHour={19} />
          </div>

          {/* Tab-specific content */}
          <div style={{ padding: '4px 28px 40px' }}>
            {activeTab === 'today' && (
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Today</p>
                {dayCleans.length === 0
                  ? <p style={{ fontSize: '14px', color: '#9ca3af' }}>No cleans scheduled for today.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {dayCleans.map((c: any) => (
                        <a key={c.id} href={`/cleaner/clean/${c.id}`} style={{ display: 'block', background: '#fff', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', border: '1px solid #E7E1D4' }}>
                          <div style={{ fontWeight: 700, color: '#181614', fontSize: '14px' }}>{c.properties?.name ?? 'Clean'}</div>
                          {c.clean_time && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>{c.clean_time}</div>}
                        </a>
                      ))}
                    </div>
                }
              </div>
            )}
            {activeTab === 'upcoming' && (
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Upcoming</p>
                {upcomingCleans.length === 0
                  ? <p style={{ fontSize: '14px', color: '#9ca3af' }}>No upcoming cleans.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {upcomingCleans.map((c: any) => (
                        <a key={c.id} href={`/cleaner/clean/${c.id}`} style={{ display: 'block', background: '#fff', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', border: '1px solid #E7E1D4' }}>
                          <div style={{ fontWeight: 700, color: '#181614', fontSize: '14px' }}>{c.properties?.name ?? 'Clean'}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>{formatDateUK(c.clean_date)}</div>
                        </a>
                      ))}
                    </div>
                }
              </div>
            )}
            {activeTab === 'done' && (
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Done</p>
                {doneCleans.length === 0
                  ? <p style={{ fontSize: '14px', color: '#9ca3af' }}>No completed cleans yet.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {doneCleans.map((c: any) => (
                        <a key={c.id} href={`/cleaner/clean/${c.id}`} style={{ display: 'block', background: '#fff', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', border: '1px solid #E7E1D4' }}>
                          <div style={{ fontWeight: 700, color: '#181614', fontSize: '14px' }}>{c.properties?.name ?? 'Clean'}</div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: 2 }}>{formatDateUK(c.clean_date)} · Completed</div>
                        </a>
                      ))}
                    </div>
                }
              </div>
            )}
            {activeTab === 'compliance' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Compliance</p>
                  <button
                    onClick={() => setShowAddComplianceModal(true)}
                    style={{ fontSize: '12px', fontWeight: 700, color: '#4B6358', background: '#DCE6DE', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                  >
                    + Log Check
                  </button>
                </div>
                {complianceLogs.length === 0
                  ? <p style={{ fontSize: '14px', color: '#9ca3af' }}>No compliance checks logged recently.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {complianceLogs.slice(0, 10).map((log) => (
                        <div key={log.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #E7E1D4' }}>
                          <div style={{ fontWeight: 700, color: '#181614', fontSize: '14px' }}>{log.check_type === 'fire_door' ? '🚪 Fire Door' : '🔊 Smoke Alarm'}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>{formatDateUK(log.checked_date)}{log.notes ? ` · ${log.notes}` : ''}</div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}
          </div>
        </main>

        {/* Right rail */}
        <DesktopRightRail dateCounts={dateCounts} alerts={railAlerts} alertsHeading="Your Cleans">
          {comingUpCleans.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0 0 8px', fontWeight: 700 }}>
                Coming Up
              </h3>
              {comingUpCleans.map((c: any) => (
                <a key={c.id} href={`/cleaner/clean/${c.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#FFFFFF', border: '1px solid #E7E1D4', borderRadius: 12, padding: '10px 12px', marginBottom: 7, cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F6F3EC' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF' }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#181614', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.properties?.name || 'Clean'}</div>
                    <div style={{ fontSize: 10.5, color: '#59544C', marginTop: 2 }}>
                      📅 {formatDateUK(c.clean_date)}{c.clean_time ? ` · ${String(c.clean_time).slice(0, 5)}` : c.status !== 'completed' ? ' · time to confirm' : ''}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </DesktopRightRail>
      </div>

      {/* ── MOBILE (< lg) ─────────────────────────────────────────────────── */}
      <div className="lg:hidden min-h-screen bg-neutral-100">

      {/* ── Dark hero ──────────────────────────────────────────────────────── */}
      <DarkHeroHeader
        eyebrow="Cleaner"
        heading={`Hi ${firstName} 👋`}
        topRight={
          <div className="flex items-center gap-md">
            <a
              href="/cleaner/profile"
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors"
              title="Profile"
            >
              <span className="text-lg leading-none">⚙️</span>
            </a>
            <button
              onClick={async () => { await signOut(); router.push('/login') }}
              className="hover:text-white/70 transition-colors"
            >
              Sign out
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-sm mb-lg">
          <StatTile
            value={overdueCleans.length}
            label="Overdue"
            valueColor={overdueCleans.length > 0 ? 'text-red-400' : 'text-white'}
          />
          <StatTile value={todayCleans.length} label="Today" valueColor="text-blue-400" />
          <StatTile value={upcomingCleans.length} label="Upcoming" />
        </div>

        {/* Week tile strip */}
        {(() => {
          const weekDays = buildWeekDays(weekOffset)
          return (
            <div className="flex items-center gap-xs">
              <button
                onClick={() => setWeekOffset(o => o - 1)}
                className="shrink-0 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg leading-none"
                aria-label="Previous week"
              >‹</button>
              <div className="flex gap-xs flex-1 justify-between">
                {weekDays.map(iso => {
                  const { day, date, month } = isoToDateParts(iso)
                  const isToday    = iso === todayISO()
                  const isSelected = iso === selectedDay
                  const count = scheduledCleans.filter(c => c.clean_date === iso).length
                  return (
                    <button
                      key={iso}
                      onClick={() => { setSelectedDay(iso); setActiveTab('today') }}
                      className={`flex-1 flex flex-col items-center rounded-xl px-xs py-sm transition-colors min-w-0 ${
                        isSelected ? 'bg-white text-neutral-900' :
                        isToday    ? 'bg-white/15 text-white border border-white/30' :
                        'bg-neutral-800/60 text-neutral-400 border border-neutral-700'
                      }`}
                    >
                      <span className="text-[10px] font-semibold opacity-70">{day.slice(0,1)}</span>
                      <span className="text-base font-bold leading-none my-xs">{date}</span>
                      {count > 0 ? (
                        <span className={`text-[10px] font-bold rounded-full px-xs ${isSelected ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'}`}>
                          {count}
                        </span>
                      ) : (
                        <span className="text-[10px] opacity-40">{month}</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setWeekOffset(o => o + 1)}
                className="shrink-0 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg leading-none"
                aria-label="Next week"
              >›</button>
            </div>
          )
        })()}
      </DarkHeroHeader>

      {/* ── Tab strip — exact lettings pattern ─────────────────────────────── */}
      <div
        className="bg-white border-b border-neutral-200 sticky z-40 px-lg pt-md pb-0"
        style={{ top: 'calc(env(safe-area-inset-top) + 52px)' }}
      >
        <div className="flex gap-xs overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-lg py-sm rounded-full text-sm font-bold whitespace-nowrap transition-all mb-sm ${
                activeTab === key
                  ? 'bg-neutral-950 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Global notices ─────────────────────────────────────────────────── */}
      {bookedNotice && (
        <div className="mx-lg mt-md rounded-xl border border-green-200 bg-green-50 px-lg py-sm text-sm font-semibold text-green-800">
          {bookedNotice}
        </div>
      )}
      {error && (
        <div className="mx-lg mt-md rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-lg pb-3xl">

        {/* Notifications prompt — shown once at top of first tab */}
        {activeTab === 'today' && (
          <div className="pt-lg pb-sm">
            <EnableNotifications />
            <a href="/planner" className="mt-sm flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-lg py-md text-sm font-bold text-neutral-900">🗂️ With Capital Rooms — notes, jobs &amp; photos<span aria-hidden="true">›</span></a>
          </div>
        )}

        {/* ── TODAY ──────────────────────────────────────────────────────── */}
        {activeTab === 'today' && (
          <div className="space-y-md pt-sm">

            {isViewingToday ? (
              <>
                {/* Assigned jobs that need accepting */}
                {assignedJobs.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wide mb-sm">
                      📌 Assigned — need booking
                    </h2>
                    <div className="space-y-sm">
                      {assignedJobs.map(job => (
                        <div
                          key={job.id}
                          className="rounded-2xl border border-amber-200 bg-amber-50 p-md flex items-start justify-between gap-md"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-neutral-900 truncate">
                              {job.properties?.name}{job.rooms?.name ? ` · ${job.rooms.name}` : ''}
                            </p>
                            {job.notes && <p className="text-sm text-neutral-600 mt-xs">{job.notes}</p>}
                            <p className="text-xs text-amber-700 font-semibold mt-xs">
                              {job.task_type === 'asap' ? '🚨 ASAP' : job.task_type === 'urgent' ? '⚠️ Urgent' : '📌 Normal'}
                            </p>
                          </div>
                          <div className="flex flex-col gap-xs shrink-0">
                            <button
                              onClick={() => { setAcceptJobForm({ cleanDate: new Date().toISOString().split('T')[0], cleanTime: '10:00' }); setShowAcceptJobModal(job.id) }}
                              className="rounded-full bg-neutral-950 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700 transition-colors"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => { setDeclineReason(''); setShowDeclineModal(job.id) }}
                              className="rounded-full border border-red-300 bg-red-50 px-md py-sm text-xs font-bold text-red-700 hover:bg-red-100 transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Overdue */}
                {overdueCleans.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-red-600 uppercase tracking-wide mb-sm">
                      ⚠️ Overdue
                    </h2>
                    <div className="space-y-sm">
                      {overdueCleans.map(c => (
                        <CleanCard key={c.id} c={c} onClick={() => router.push(`/cleaner/clean/${c.id}`)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Today's cleans */}
                {todayCleans.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wide mb-sm">
                      📍 Today
                    </h2>
                    <div className="space-y-sm">
                      {todayCleans.map(c => (
                        <CleanCard key={c.id} c={c} onClick={() => router.push(`/cleaner/clean/${c.id}`)} />
                      ))}
                    </div>
                  </div>
                )}

                {overdueCleans.length === 0 && todayCleans.length === 0 && assignedJobs.length === 0 && (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center mt-lg">
                    <p className="text-sm font-medium text-neutral-400">All clear — nothing for today</p>
                  </div>
                )}
              </>
            ) : (
              /* Viewing another day */
              <div>
                <h2 className="text-sm font-bold text-neutral-700 mb-md">
                  {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                </h2>
                {dayCleans.length > 0 ? (
                  <div className="space-y-sm">
                    {dayCleans.map(c => (
                      <CleanCard key={c.id} c={c} onClick={() => router.push(`/cleaner/clean/${c.id}`)} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center mt-lg">
                    <p className="text-sm font-medium text-neutral-400">Nothing scheduled for this day</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── UPCOMING ───────────────────────────────────────────────────── */}
        {activeTab === 'upcoming' && (
          <div className="pt-lg">
            {upcomingCleans.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                <p className="text-sm font-medium text-neutral-400">No cleans scheduled yet</p>
                <button
                  onClick={() => setShowBookCleanModal(true)}
                  className="mt-md inline-flex items-center gap-xs rounded-full bg-neutral-950 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 transition-colors"
                >
                  + Book a clean
                </button>
              </div>
            ) : (
              <div className="space-y-sm">
                {[...upcomingCleans]
                  .sort((a, b) => a.clean_date.localeCompare(b.clean_date))
                  .map(c => (
                    <CleanCard key={c.id} c={c} onClick={() => router.push(`/cleaner/clean/${c.id}`)} />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ── DONE ───────────────────────────────────────────────────────── */}
        {activeTab === 'done' && (
          <div className="pt-lg">
            {doneCleans.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                <p className="text-sm font-medium text-neutral-400">No completed cleans yet</p>
              </div>
            ) : (
              <div className="space-y-sm">
                {doneCleans.map(c => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/cleaner/clean/${c.id}`)}
                    className="w-full rounded-2xl border border-neutral-200 bg-white p-md shadow-sm text-left hover:shadow-md transition-shadow flex items-center justify-between gap-md"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-neutral-900 truncate">{c.properties?.name}</p>
                      <p className="text-sm text-neutral-500">
                        {formatDateUK(c.clean_date)}
                        {c.special_jobs?.length ? ` · ${c.special_jobs.length} extra job${c.special_jobs.length !== 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-green-100 text-green-700 text-xs font-bold px-sm py-xs">
                      Done ✓
                    </span>
                  </button>
                ))}
                {doneCleans.length >= cleansDisplayLimit && (
                  <button
                    onClick={() => { const next = cleansDisplayLimit + 20; setCleansDisplayLimit(next); loadCleans(personId, next) }}
                    className="w-full rounded-2xl border border-neutral-200 bg-white py-md text-sm font-bold text-neutral-500 hover:bg-neutral-50 transition-colors"
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── COMPLIANCE ─────────────────────────────────────────────────── */}
        {activeTab === 'compliance' && (
          <div className="pt-lg">
            <div className="flex items-center justify-between mb-md">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Compliance Checks</h2>
                <p className="text-xs text-neutral-500 mt-xs">
                  {properties.find(p => p.id === compliancePropertyId)?.name || 'All properties'} · Last 6 months
                </p>
              </div>
              <button
                onClick={() => setShowAddComplianceModal(true)}
                className="rounded-full bg-neutral-950 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700 transition-colors"
              >
                + Add Check
              </button>
            </div>

            {/* Property selector */}
            <div className="mb-md">
              <select
                value={compliancePropertyId}
                onChange={e => { setCompliancePropertyId(e.target.value); loadComplianceLogs(e.target.value) }}
                className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
              >
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {complianceLogs.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                <p className="text-sm font-medium text-neutral-400">No compliance checks logged yet</p>
              </div>
            ) : (
              <div className="space-y-sm">
                {complianceLogs.map(log => (
                  <div key={log.id} className="rounded-2xl border border-neutral-200 bg-white p-md shadow-sm">
                    <div className="flex items-start justify-between gap-md">
                      <div className="min-w-0">
                        <p className="font-bold text-neutral-900">{checkTypeLabels[log.check_type]}</p>
                        <p className="text-sm text-neutral-500 mt-xs">
                          {new Date(log.checked_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}
                          {displayName(log.people as any) || 'Unknown'} ({log.checked_by_role})
                        </p>
                        {log.notes && <p className="text-sm text-neutral-600 mt-sm whitespace-pre-wrap">{log.notes}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-green-100 text-green-700 text-xs font-bold px-sm py-xs">✓ Logged</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── FAB ────────────────────────────────────────────────────────────── */}
      <div
        className="fixed z-30 right-lg"
        style={{ bottom: 'max(24px, calc(env(safe-area-inset-bottom) + 16px))' }}
      >
        {showFabMenu && (
          <div className="mb-sm flex flex-col gap-sm items-end">
            <button
              onClick={() => { setShowFabMenu(false); setPropertyId(properties[0]?.id || ''); setShowBookCleanModal(true) }}
              className="rounded-full bg-neutral-950 text-white px-lg py-sm text-sm font-bold shadow-lg whitespace-nowrap hover:bg-neutral-700 transition-colors"
            >
              🧹 Book a clean
            </button>
            <button
              onClick={() => { setShowFabMenu(false); setPastCleanForm({ propertyId: properties[0]?.id || '', cleanDate: new Date().toISOString().split('T')[0], notes: '' }); setShowLogPastCleanModal(true) }}
              className="rounded-full bg-neutral-950 text-white px-lg py-sm text-sm font-bold shadow-lg whitespace-nowrap hover:bg-neutral-700 transition-colors"
            >
              📝 Log past clean
            </button>
          </div>
        )}
        <button
          onClick={() => setShowFabMenu(v => !v)}
          className="w-14 h-14 rounded-full bg-neutral-950 text-white text-2xl font-bold shadow-xl flex items-center justify-center hover:bg-neutral-700 transition-colors"
          aria-label="Book"
        >
          {showFabMenu ? '×' : '＋'}
        </button>
      </div>

      </div>{/* end lg:hidden */}

      {/* ── Book clean modal ───────────────────────────────────────────────── */}
      {showBookCleanModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-lg" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <h2 className="text-xl font-bold text-neutral-900 mb-md">🧹 Book a Clean</h2>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Property</label>
                <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-sm">Date</label>
                  <input type="date" value={cleanDate} onChange={e => setCleanDate(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-sm">Time</label>
                  <input type="time" value={cleanTime} onChange={e => setCleanTime(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
                </div>
              </div>
              <div className="flex gap-sm pt-sm">
                <button onClick={bookClean} disabled={booking} className="flex-1 rounded-xl bg-neutral-950 py-sm font-bold text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors">
                  {booking ? 'Booking…' : 'Book Clean'}
                </button>
                <button onClick={() => setShowBookCleanModal(false)} className="flex-1 rounded-xl border border-neutral-300 py-sm font-semibold text-neutral-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Log past clean modal ───────────────────────────────────────────── */}
      {showLogPastCleanModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-lg" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <h2 className="text-xl font-bold text-neutral-900 mb-md">📝 Log Past Clean</h2>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Property</label>
                <select value={pastCleanForm.propertyId} onChange={e => setPastCleanForm({ ...pastCleanForm, propertyId: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  <option value="">Select property</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Date Cleaned</label>
                <input type="date" value={pastCleanForm.cleanDate} onChange={e => setPastCleanForm({ ...pastCleanForm, cleanDate: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Notes (optional)</label>
                <textarea rows={2} value={pastCleanForm.notes} onChange={e => setPastCleanForm({ ...pastCleanForm, notes: e.target.value })} placeholder="e.g. Emergency clean, extra rooms" className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm resize-none" />
              </div>
              <div className="flex gap-sm">
                <button onClick={logPastClean} disabled={savingPastClean} className="flex-1 rounded-xl bg-neutral-950 py-sm font-bold text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors">
                  {savingPastClean ? 'Saving…' : 'Log Clean'}
                </button>
                <button onClick={() => setShowLogPastCleanModal(false)} className="flex-1 rounded-xl border border-neutral-300 py-sm font-semibold text-neutral-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add compliance check modal ─────────────────────────────────────── */}
      {showAddComplianceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
            <h2 className="text-xl font-bold text-neutral-900 mb-md">Log Compliance Check</h2>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Property</label>
                <select value={compliancePropertyId} onChange={e => setCompliancePropertyId(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  <option value="">Select a property</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Check Type</label>
                <div className="flex gap-sm">
                  {(['fire_door', 'smoke_alarm'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setComplianceForm({ ...complianceForm, check_type: type })}
                      className={`flex-1 rounded-xl border px-md py-sm text-xs font-semibold transition-colors ${complianceForm.check_type === type ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-300 text-neutral-700'}`}
                    >
                      {checkTypeLabels[type]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Date Checked</label>
                <input type="date" value={complianceForm.date} onChange={e => setComplianceForm({ ...complianceForm, date: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Notes (optional)</label>
                <textarea rows={2} value={complianceForm.notes} onChange={e => setComplianceForm({ ...complianceForm, notes: e.target.value })} placeholder="e.g. All tests passed" className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm resize-none" />
              </div>
              <div className="flex gap-sm pt-sm">
                <button onClick={handleAddComplianceLog} disabled={savingCompliance} className="flex-1 rounded-xl bg-neutral-950 py-sm font-bold text-white disabled:opacity-50">
                  {savingCompliance ? 'Saving…' : 'Log Check'}
                </button>
                <button onClick={() => setShowAddComplianceModal(false)} className="flex-1 rounded-xl border border-neutral-300 py-sm font-semibold text-neutral-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Accept job modal ───────────────────────────────────────────────── */}
      {showAcceptJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
          <div className="w-full max-w-md rounded-3xl bg-white p-lg">
            <h2 className="text-xl font-bold text-neutral-900 mb-md">Accept & Book Clean</h2>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Date</label>
                <input type="date" value={acceptJobForm.cleanDate} onChange={e => setAcceptJobForm({ ...acceptJobForm, cleanDate: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Time (optional)</label>
                <input type="time" value={acceptJobForm.cleanTime} onChange={e => setAcceptJobForm({ ...acceptJobForm, cleanTime: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              {error && <div className="rounded-xl bg-red-50 p-md text-sm text-red-800 font-semibold">{error}</div>}
              <div className="flex gap-sm">
                <button onClick={() => acceptJob(showAcceptJobModal!)} disabled={acceptingJob} className="flex-1 rounded-xl bg-neutral-950 py-sm font-bold text-white disabled:opacity-50">
                  {acceptingJob ? 'Accepting…' : 'Accept & Book'}
                </button>
                <button onClick={() => setShowAcceptJobModal(null)} className="flex-1 rounded-xl border border-neutral-300 py-sm font-semibold text-neutral-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Decline job modal ─────────────────────────────────────────────── */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
          <div className="w-full max-w-md rounded-3xl bg-white p-lg">
            <h2 className="text-xl font-bold text-neutral-900 mb-xs">Decline this job?</h2>
            <p className="text-sm text-neutral-500 mb-md">Admin will be notified and the job will be reassigned to another cleaner.</p>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Reason (optional)</label>
                <textarea
                  rows={3}
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  placeholder="e.g. Unavailable that week, already fully booked…"
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm resize-none"
                />
              </div>
              <div className="flex gap-sm">
                <button
                  onClick={() => declineJob(showDeclineModal!)}
                  disabled={!!decliningJob}
                  className="flex-1 rounded-xl bg-red-600 py-sm font-bold text-white disabled:opacity-50 hover:bg-red-700 transition-colors"
                >
                  {decliningJob ? 'Declining…' : 'Yes, decline'}
                </button>
                <button onClick={() => setShowDeclineModal(null)} className="flex-1 rounded-xl border border-neutral-300 py-sm font-semibold text-neutral-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick notify modal ─────────────────────────────────────────────── */}
      {showQuickNotifyModal && quickNotifyProperty && (
        <StaffQuickNotifyModal
          role="cleaner"
          propertyId={quickNotifyProperty.id}
          propertyName={quickNotifyProperty.name}
          onClose={() => { setShowQuickNotifyModal(false); setQuickNotifyProperty(null) }}
          onSuccess={() => { setShowQuickNotifyModal(false); setQuickNotifyProperty(null) }}
        />
      )}

    </div>
  )
}

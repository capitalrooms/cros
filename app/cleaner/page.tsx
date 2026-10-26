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
import { RoleTabBar, type CleanerTab } from '@/app/components/RoleTabBar'
import StaffQuickNotifyModal from '@/app/components/StaffQuickNotifyModal'
import MultiDayDiaryGrid, { DiaryJob } from '@/app/components/MultiDayDiaryGrid'
import DesktopRightRail from '@/app/components/DesktopRightRail'
import { isDatePast, isDateToday, isDateFuture, formatDateUK, getDaysUntil } from '@/lib/dateUtils'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { withNames } from '@/lib/peopleDirectory'
import { useRoleRail, DeskGreeting } from '@/app/components/role/RoleShell'

interface ComplianceLog {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  checked_date: string
  notes: string | null
  checked_by_role: string
  people?: { name: string } | null
}

const checkTypeLabels: Record<string, string> = {
  fire_door: 'Fire Door',
  smoke_alarm: 'Smoke Alarm',
}

const sixMonthsAgo = () => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().split('T')[0]
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildWeekDays(offset = 0): string[] {
  const base = new Date()
  base.setHours(12, 0, 0, 0)   // midday: midnight here became the day before as an ISO date all summer (24 Oct 2026)
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
          <span className="rounded-full bg-amber-100 text-amber-900 text-xs font-bold px-sm py-xs">Today</span>
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
  const [cleanDate, setCleanDate]     = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }))
  const [cleanTime, setCleanTime]     = useState('10:00')
  const [booking, setBooking]         = useState(false)
  const [bookedNotice, setBookedNotice] = useState('')

  // compliance modal
  const [showAddComplianceModal, setShowAddComplianceModal] = useState(false)
  const [savingCompliance, setSavingCompliance]             = useState(false)
  const [complianceForm, setComplianceForm] = useState({ check_type: 'fire_door' as 'fire_door' | 'smoke_alarm', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), notes: '' })
  const [compliancePropertyId, setCompliancePropertyId]    = useState('')

  // log past clean modal
  const [showLogPastCleanModal, setShowLogPastCleanModal] = useState(false)
  const [pastCleanForm, setPastCleanForm] = useState({ propertyId: '', cleanDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), notes: '', hours: '' })
  const [savingPastClean, setSavingPastClean] = useState(false)

  // book clean modal
  const [showBookCleanModal, setShowBookCleanModal] = useState(false)

  // assigned jobs
  const [assignedJobs, setAssignedJobs]           = useState<any[]>([])
  const [showAcceptJobModal, setShowAcceptJobModal] = useState<string | null>(null)
  const [acceptJobForm, setAcceptJobForm] = useState({ cleanDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), cleanTime: '10:00' })
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
  // a tab asked for in the address (the bottom bar on another screen links to /cleaner?tab=upcoming)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null
    if (t && ['today', 'upcoming', 'done', 'compliance'].includes(t)) setActiveTab(t)
  }, [])
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
            .select('id, full_name, salutation, first_name, last_name, role')
            .eq('id', asParam)
            .single()
          if (!target || target.role !== 'cleaner') { router.push('/admin/people'); return }
          setViewingAs({ id: asParam, name: displayName(target), role: target.role })
          setCleanerName(displayName(target))
          targetPersonId = asParam
        } else {
          if (!data || data.assignment?.role !== 'cleaner') { router.push(isAdmin ? '/admin/people' : '/login'); return }
          setMe(data.assignment)

          const { data: personData } = await supabase
            .from('people')
            .select('id, full_name, salutation, first_name, last_name')
            .eq('email', data.user?.email)
            .single()

          if (!personData?.id) { router.push('/login'); return }
          setCleanerName(displayName(personData))
          targetPersonId = personData.id
        }

        setPersonId(targetPersonId)
        await loadCleans(targetPersonId, cleansDisplayLimit)

        // their houses first (26 Oct 2026): where they're the regular cleaner, or have cleaned before
        let { data: props, error: propsErr } = await supabase
          .from('properties')
          .select('id, name, address, clean_frequency_weeks, regular_cleaner_id')
          .order('name')
        if (propsErr) props = (await supabase.from('properties').select('id, name, address, clean_frequency_weeks').order('name')).data as any
        const { data: theirs } = await supabase.from('cleans').select('property_id').eq('cleaner_id', targetPersonId).limit(500)
        const mine = new Set<string>([...(props ?? []).filter((p: any) => p.regular_cleaner_id === targetPersonId).map((p: any) => p.id), ...(theirs ?? []).map((c: any) => c.property_id)])
        props = [...sortPropertiesNumerically((props ?? []).filter((p: any) => mine.has(p.id))).map((p: any) => ({ ...p, mine: true })),
          ...sortPropertiesNumerically((props ?? []).filter((p: any) => !mine.has(p.id)))]
        setProperties(props || [])
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
      .select('id, check_type, checked_date, notes, checked_by_role, checked_by')
      .eq('property_id', propId)
      .gte('checked_date', sixMonthsAgo())
      .order('checked_date', { ascending: false })
      .limit(50)
    // who checked it, from the directory (other people's full records are office-only — migration 244)
    setComplianceLogs((await withNames(supabase, data || [], 'checked_by')) as any)
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function bookClean() {
    if (!propertyId || !cleanDate || booking) return
    setError(''); setBookedNotice('')
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    if (cleanDate < todayIso) return setError('That day has gone — use “Log a past clean” for a clean you’ve already done.')
    setBooking(true)
    const supabase = createClient()
    // one clean per house per day: a second booking used to go straight in
    const { data: same } = await supabase.from('cleans').select('id').eq('property_id', propertyId).eq('clean_date', cleanDate).not('status', 'eq', 'cancelled').limit(1)
    if (same?.length) { setBooking(false); return setError('There’s already a clean booked at this house that day.') }
    const { data: made, error: err } = await supabase.from('cleans').insert({
      property_id: propertyId,
      cleaner_id: personId,
      clean_date: cleanDate,
      clean_time: cleanTime || null,
    }).select('id').single()
    if (err) { setBooking(false); return setError(err.message) }
    // the tenants hear it's booked (email or app, as set on the Cleaning screen — lib/cleans/tenantUpdates)
    if (made?.id) fetch(`/api/cleans/${made.id}/tell-tenants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'booked' }) }).catch(() => {})
    await loadCleans(personId)
    setBooking(false)
    const propName = properties.find((p) => p.id === propertyId)?.name || 'the property'
    const when = new Date(cleanDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    setBookedNotice(`Clean booked for ${propName} on ${when}${cleanTime ? ` at ${cleanTime}` : ''}.`)
    setShowBookCleanModal(false)
  }

  async function logPastClean() {
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    if (!pastCleanForm.propertyId || !pastCleanForm.cleanDate) { setError('Please fill in property and date'); return }
    if (pastCleanForm.cleanDate > todayIso) { setError('A past clean can’t be in the future — use Book a clean instead.'); return }
    if (!(Number(pastCleanForm.hours) > 0)) { setError('Say how long you were there.'); return }
    setSavingPastClean(true)
    try {
      const supabase = createClient()
      const done = {
        clean_date: pastCleanForm.cleanDate, status: 'completed', hours_worked: Number(pastCleanForm.hours),
        completed_at: pastCleanForm.cleanDate === todayIso ? new Date().toISOString() : `${pastCleanForm.cleanDate}T12:00:00.000Z`,
        notes: pastCleanForm.notes || null,
      }
      // a clean already booked here around then (up to today — never one still to come) that was never finished: finish
      // that one, rather than adding a second
      const near = (d: number) => { const x = new Date(`${pastCleanForm.cleanDate}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
      const { data: open } = await supabase.from('cleans').select('id, clean_date').eq('property_id', pastCleanForm.propertyId).eq('cleaner_id', personId)
        .gte('clean_date', near(-14)).lte('clean_date', near(14) < todayIso ? near(14) : todayIso).not('status', 'in', '("completed","cancelled")').order('clean_date').limit(1)
      const save = (f: Record<string, unknown>) => open?.[0]
        ? supabase.from('cleans').update({ ...f, admin_note: open[0].clean_date !== pastCleanForm.cleanDate ? `Logged as done afterwards — booked for ${formatDateUK(open[0].clean_date)}.` : 'Logged as done afterwards.' }).eq('id', open[0].id).select('id').single()
        : supabase.from('cleans').insert({ ...f, property_id: pastCleanForm.propertyId, cleaner_id: personId }).select('id').single()
      let { data: logged, error: err } = await save(done)
      // before migration 247 there's no hours column: log the clean anyway
      if (err && /hours_worked/.test(err.message)) { const { hours_worked: _h, ...rest } = done; ({ data: logged, error: err } = await save(rest)) }
      if (err) throw err
      // and the next clean at the house goes in the diary, as when a clean is finished (lib/cleans/nextClean)
      if (logged?.id) await fetch(`/api/cleans/${logged.id}/next`, { method: 'POST' }).catch(() => null)
      setPastCleanForm({ propertyId: '', cleanDate: todayIso, notes: '', hours: '' })
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
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'The job couldn’t be accepted — try again')
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
      setComplianceForm({ check_type: 'fire_door', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), notes: '' })
      setShowAddComplianceModal(false)
      await loadComplianceLogs(compliancePropertyId)
      alert('Check logged')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally { setSavingCompliance(false) }
  }

  // the side rail on a computer (RoleShell): which section is showing, switched in place, and the day's count
  const dueNow = cleans.filter(c => c.status !== 'completed' && c.clean_date && (isDatePast(c.clean_date) || isDateToday(c.clean_date))).length
  useRoleRail({ active: activeTab, inPage: ['today', 'upcoming', 'done', 'compliance'], pick: k => setActiveTab(k as Tab), badges: { today: dueNow || undefined } })

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <div className="bg-neutral-950 pb-xl">
          <div style={{ height: 'calc(env(safe-area-inset-top) + 56px)' }} />
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
    ...(overdueCleans.length > 0 ? [{ title: `${overdueCleans.length} overdue clean${overdueCleans.length !== 1 ? 's' : ''}`, body: 'Did you do it? Open it to log it or move it', variant: 'red' as const, onClick: () => setActiveTab('today') }] : []),
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


      {/* ── View-as banner ────────────────────────────────────────────────── */}
      {viewingAs && (
        <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />
      )}

      {/* ── DESKTOP (lg+): the diary and a calendar column, beside the shared side rail (RoleShell) ── */}
      <div className="hidden lg:grid lg:min-h-screen" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px', background: 'var(--cr-ivory)' }}>


        {/* Main */}
        <main style={{ overflowY: 'auto' }}>
          {/* Dark stats header */}
          <div style={{ background: 'var(--cr-ink)', padding: '28px 28px 20px' }}>
            <DeskGreeting name={firstName} title="Your cleans" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {([
                { value: overdueCleans.length, label: 'Overdue', color: overdueCleans.length > 0 ? '#f87171' : 'var(--cr-ivory)' },
                { value: todayCleans.length,   label: 'Today',   color: 'var(--cr-gold)' },
                { value: upcomingCleans.length, label: 'Upcoming', color: 'var(--cr-ivory)' },
              ] as { value: number; label: string; color: string }[]).map(({ value, label, color }) => (
                <div key={label} style={{ background: 'rgba(246,243,236,0.07)', borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: '11px', color: 'rgb(var(--n-400))', marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Diary — under Today only, so each section in the side rail opens on its own content */}
          {activeTab === 'today' && <div style={{ padding: '20px 28px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgb(var(--n-500))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Diary</p>
            <MultiDayDiaryGrid jobs={diaryJobs} startHour={8} endHour={19} />
          </div>}

          {/* Tab-specific content */}
          <div style={{ padding: activeTab === 'today' ? '4px 28px 40px' : '24px 28px 40px' }}>
            {activeTab === 'today' && (
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgb(var(--n-500))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Today</p>
                {dayCleans.length === 0
                  ? <p style={{ fontSize: '14px', color: 'rgb(var(--n-400))' }}>No cleans scheduled for today.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {dayCleans.map((c: any) => (
                        <a key={c.id} href={`/cleaner/clean/${c.id}`} style={{ display: 'block', background: '#fff', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', border: '1px solid var(--cr-line)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--cr-ink)', fontSize: '14px' }}>{c.properties?.name ?? 'Clean'}</div>
                          {c.clean_time && <div style={{ fontSize: '12px', color: 'rgb(var(--n-500))', marginTop: 2 }}>{c.clean_time}</div>}
                        </a>
                      ))}
                    </div>
                }
              </div>
            )}
            {activeTab === 'upcoming' && (
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgb(var(--n-500))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Upcoming</p>
                {upcomingCleans.length === 0
                  ? <p style={{ fontSize: '14px', color: 'rgb(var(--n-400))' }}>No upcoming cleans.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {upcomingCleans.map((c: any) => (
                        <a key={c.id} href={`/cleaner/clean/${c.id}`} style={{ display: 'block', background: '#fff', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', border: '1px solid var(--cr-line)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--cr-ink)', fontSize: '14px' }}>{c.properties?.name ?? 'Clean'}</div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--n-500))', marginTop: 2 }}>{formatDateUK(c.clean_date)}</div>
                        </a>
                      ))}
                    </div>
                }
              </div>
            )}
            {activeTab === 'done' && (
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgb(var(--n-500))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Done</p>
                {doneCleans.length === 0
                  ? <p style={{ fontSize: '14px', color: 'rgb(var(--n-400))' }}>No completed cleans yet.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {doneCleans.map((c: any) => (
                        <a key={c.id} href={`/cleaner/clean/${c.id}`} style={{ display: 'block', background: '#fff', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', border: '1px solid var(--cr-line)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--cr-ink)', fontSize: '14px' }}>{c.properties?.name ?? 'Clean'}</div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--n-500))', marginTop: 2 }}>
                            {formatDateUK(c.clean_date)}{c.hours_worked != null ? ` · ${Number(c.hours_worked)} hour${Number(c.hours_worked) === 1 ? '' : 's'}` : ''}{c.supplier_invoice_id ? ' · Invoiced' : ''}
                            {c.hours_worked == null && !c.supplier_invoice_id && <span style={{ marginLeft: 8, fontWeight: 700, color: '#8a5a00', background: '#FDF1D6', borderRadius: 999, padding: '1px 8px' }}>Add hours</span>}
                          </div>
                        </a>
                      ))}
                    </div>
                }
              </div>
            )}
            {activeTab === 'compliance' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgb(var(--n-500))', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Compliance</p>
                  <button
                    onClick={() => setShowAddComplianceModal(true)}
                    style={{ fontSize: '12px', fontWeight: 700, color: '#4B6358', background: '#DCE6DE', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                  >
                    + Log Check
                  </button>
                </div>
                {complianceLogs.length === 0
                  ? <p style={{ fontSize: '14px', color: 'rgb(var(--n-400))' }}>No compliance checks logged recently.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {complianceLogs.slice(0, 10).map((log) => (
                        <div key={log.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--cr-line)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--cr-ink)', fontSize: '14px' }}>{log.check_type === 'fire_door' ? 'Fire Door' : 'Smoke Alarm'}</div>
                          <div style={{ fontSize: '12px', color: 'rgb(var(--n-500))', marginTop: 2 }}>{formatDateUK(log.checked_date)}{log.notes ? ` · ${log.notes}` : ''}</div>
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
              <h3 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgb(var(--n-400))', margin: '0 0 8px', fontWeight: 700 }}>
                Coming Up
              </h3>
              {comingUpCleans.map((c: any) => (
                <a key={c.id} href={`/cleaner/clean/${c.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#FFFFFF', border: '1px solid var(--cr-line)', borderRadius: 12, padding: '10px 12px', marginBottom: 7, cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--cr-ivory)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF' }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--cr-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.properties?.name || 'Clean'}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--cr-muted)', marginTop: 2 }}>
                      {formatDateUK(c.clean_date)}{c.clean_time ? ` · ${String(c.clean_time).slice(0, 5)}` : c.status !== 'completed' ? ' · time to confirm' : ''}
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
      {/* phone: the same bottom tab bar as the admin app (17 Oct 2026) — replaces the pill strip at the top */}
      <RoleTabBar<CleanerTab> role="cleaner" spacer={false} inPage={['today', 'upcoming', 'done', 'compliance']}
        active={activeTab} onPick={k => setActiveTab(k as Tab)}
        badges={{ today: todayCleans.length + overdueCleans.length }} />

      {/* ── Dark hero ──────────────────────────────────────────────────────── */}
      <DarkHeroHeader
        eyebrow="Cleaner"
        heading={`Hi ${firstName}`}
        
      >
        <div className="grid grid-cols-3 gap-sm mb-lg">
          <StatTile
            value={overdueCleans.length}
            label="Overdue"
            valueColor={overdueCleans.length > 0 ? 'text-red-400' : 'text-white'}
          />
          <StatTile value={todayCleans.length} label="Today" valueColor="text-[color:var(--cr-gold)]" />
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
      <main className="mx-auto max-w-2xl px-lg pb-[120px]">

        {/* Notifications prompt, and the two other places — one slim row, not two big buttons (17 Oct 2026) */}
        {activeTab === 'today' && (
          <div className="pt-lg pb-sm">
            <EnableNotifications />
            <div className="mt-sm grid grid-cols-2 gap-sm">
              {/* booking and logging cleans live here now — a floating + covered the Accept/Decline buttons (25 Oct 2026) */}
              <button type="button" onClick={() => { setError(''); setPropertyId(properties[0]?.id || ''); setShowBookCleanModal(true) }}
                className="rounded-xl bg-neutral-950 px-md py-sm text-center text-xs font-bold text-white">Book a clean</button>
              <button type="button" onClick={() => { setError(''); setPastCleanForm({ propertyId: properties[0]?.id || '', cleanDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), notes: '', hours: '' }); setShowLogPastCleanModal(true) }}
                className="rounded-xl border border-neutral-900 bg-white px-md py-sm text-center text-xs font-bold text-neutral-900">Log a past clean</button>
              <a href="/planner" className="rounded-xl border border-neutral-200 bg-white px-md py-sm text-center text-xs font-bold text-neutral-900">Notes with Capital Rooms</a>
              <a href={`/cleaner/invoices${viewingAs ? `?as=${viewingAs.id}` : ''}`} className="rounded-xl border border-neutral-200 bg-white px-md py-sm text-center text-xs font-bold text-neutral-900">Invoice your cleans</a>
            </div>
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
                      Assigned — need booking
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
                            {/* dates as people write them ("2026-11-28" → "28 November 2026") */}
                            {job.notes && <p className="text-sm text-neutral-600 mt-xs">{String(job.notes).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_: string, y: string, m: string, d: string) => new Date(`${y}-${m}-${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>}
                            {job.due_date && job.due_date < new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) && <p className="text-xs font-semibold text-red-700 mt-xs">The move-out date has passed — please book this in or let the office know</p>}
                            <p className="text-xs text-amber-700 font-semibold mt-xs">
                              {job.task_type === 'asap' ? 'ASAP' : job.task_type === 'urgent' ? 'Urgent' : 'Normal'}
                            </p>
                          </div>
                          <div className="flex flex-col gap-xs shrink-0">
                            <button
                              onClick={() => { setError(''); setAcceptJobForm({ cleanDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), cleanTime: '10:00' }); setShowAcceptJobModal(job.id) }}
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
                      Overdue
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
                    <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide mb-sm">
                      Today
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
                  {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
                  onClick={() => { setError(''); setShowBookCleanModal(true) }}
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
                        {c.hours_worked != null ? ` · ${Number(c.hours_worked)} hour${Number(c.hours_worked) === 1 ? '' : 's'}` : ''}
                        {c.special_jobs?.length ? ` · ${c.special_jobs.length} extra job${c.special_jobs.length !== 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                    {/* hours are what the invoice is priced from — a done clean without them asks for them */}
                    {c.hours_worked == null && !c.supplier_invoice_id
                      ? <span className="shrink-0 rounded-full bg-amber-100 text-amber-900 text-xs font-bold px-sm py-xs">Add hours</span>
                      : <span className="shrink-0 rounded-full bg-green-100 text-green-700 text-xs font-bold px-sm py-xs">{c.supplier_invoice_id ? 'Invoiced' : 'Done'}</span>}
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
                + Add a check
              </button>
            </div>

            {/* Property selector */}
            <div className="mb-md">
              <select
                value={compliancePropertyId}
                onChange={e => { setCompliancePropertyId(e.target.value); loadComplianceLogs(e.target.value) }}
                className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
              >
                <HouseOptions houses={properties} />
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
                          {new Date(log.checked_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
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

      </div>{/* end lg:hidden */}

      {/* ── Book clean modal ───────────────────────────────────────────────── */}
      {showBookCleanModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <h2 className="text-xl font-bold text-neutral-900 mb-md">Book a clean</h2>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Property</label>
                <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  <HouseOptions houses={properties} />
                </select>
              </div>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-sm">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-sm">Date</label>
                  <input type="date" value={cleanDate} onChange={e => setCleanDate(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-sm">Time</label>
                  <input type="time" value={cleanTime} onChange={e => setCleanTime(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
                </div>
              </div>
              {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
              <div className="flex gap-sm pt-sm">
                <button onClick={bookClean} disabled={booking} className="flex-1 rounded-xl bg-neutral-950 py-sm font-bold text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors">
                  {booking ? 'Booking…' : 'Book the clean'}
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
          <div className="w-full max-w-md rounded-t-3xl bg-white p-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <h2 className="text-xl font-bold text-neutral-900 mb-md">Log a past clean</h2>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Property</label>
                <select value={pastCleanForm.propertyId} onChange={e => setPastCleanForm({ ...pastCleanForm, propertyId: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  <option value="">Select property</option>
                  <HouseOptions houses={properties} />
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Day you cleaned</label>
                <input type="date" max={new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })} value={pastCleanForm.cleanDate} onChange={e => setPastCleanForm({ ...pastCleanForm, cleanDate: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Hours you were there</label>
                <select value={pastCleanForm.hours} onChange={e => setPastCleanForm({ ...pastCleanForm, hours: e.target.value })} className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm">
                  <option value="">Choose…</option>
                  {Array.from({ length: 24 }, (_, i) => (i + 1) / 2).map(v => <option key={v} value={String(v)}>{v} hour{v === 1 ? '' : 's'}</option>)}
                </select>
                <p className="mt-xs text-xs text-neutral-500">If this clean was booked and you didn’t finish it in the app, it’s marked done — not added twice.</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Notes (optional)</label>
                <textarea rows={2} value={pastCleanForm.notes} onChange={e => setPastCleanForm({ ...pastCleanForm, notes: e.target.value })} placeholder="e.g. Emergency clean, extra rooms" className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm resize-none" />
              </div>
              {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
              <div className="flex gap-sm">
                <button onClick={logPastClean} disabled={savingPastClean} className="flex-1 rounded-xl bg-neutral-950 py-sm font-bold text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors">
                  {savingPastClean ? 'Saving…' : 'Log the clean'}
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
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
            <h2 className="text-xl font-bold text-neutral-900 mb-md">Log Compliance Check</h2>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Property</label>
                <select value={compliancePropertyId} onChange={e => setCompliancePropertyId(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  <option value="">Select a property</option>
                  <HouseOptions houses={properties} />
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
          <div className="w-full max-w-md rounded-3xl bg-white p-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <h2 className="text-xl font-bold text-neutral-900 mb-md">Accept and book the clean</h2>
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
                  {acceptingJob ? 'Accepting…' : 'Accept and book'}
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
          <div className="w-full max-w-md rounded-3xl bg-white p-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
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

/** The house list in the cleaner's pickers: their houses first, then the rest. */
function HouseOptions({ houses }: { houses: any[] }) {
  const mine = houses.filter(h => h.mine), rest = houses.filter(h => !h.mine)
  if (!mine.length) return <>{rest.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</>
  return (<>
    <optgroup label="Your houses">{mine.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
    {rest.length > 0 && <optgroup label="Other houses">{rest.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
  </>)
}


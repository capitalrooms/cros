'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { displayName } from '@/lib/people'
import DarkHeroHeader from '@/app/components/DarkHeroHeader'
import StatTile from '@/app/components/StatTile'
import EnableNotifications from '@/app/components/EnableNotifications'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import Link from 'next/link'
import { getTodayGMT, isDatePast, isDateToday, formatDateUK } from '@/lib/dateUtils'
import MultiDayDiaryGrid, { type DiaryJob } from '@/app/components/MultiDayDiaryGrid'
import DesktopRightRail from '@/app/components/DesktopRightRail'

interface Job {
  id: string
  title: string
  description?: string
  category?: string
  priority: string
  status: string
  booked_date?: string
  booked_slot?: string
  property_id: string
  room_id?: string
  properties: { name: string; address: string }
  rooms?: { name: string }
  contractor_id?: string
  completed_at?: string
  return_needed?: boolean
  return_reason?: string
  return_date?: string
  // Quote fields
  quote_requested?: boolean
  quote_amount?: number | null
  quote_notes?: string | null
  quote_site_visit?: boolean
  quote_visit_date?: string | null
  quote_submitted_at?: string | null
  admin_note?: string | null
  quote_id?: string            // set when this came from a multi-contractor quote request (maintenance_quotes)
}

/** Build 7 days for a given week offset (0 = current week Mon–Sun) */
function buildWeekDays(offset = 0): string[] {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  // Find Monday of the current week
  const dow = base.getDay() // 0=Sun
  const mondayShift = dow === 0 ? -6 : 1 - dow
  base.setDate(base.getDate() + mondayShift + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_SHORT   = ['S','M','T','W','T','F','S']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function isoToDateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return { day: DAY_LABELS[date.getDay()], dayShort: DAY_SHORT[date.getDay()], date: d, month: MONTH_SHORT[m - 1] }
}

type Tab = 'today' | 'quotes' | 'ongoing' | 'waiting' | 'booked' | 'done'

// ── Job card ──────────────────────────────────────────────────────────────────
function JobCard({ job, variant, asParam }: { job: Job; variant?: 'overdue' | 'waiting' | 'ongoing'; asParam?: string }) {
  const category = String(job.category || 'General').replace(/-/g, ' ')
  const borderCls =
    variant === 'overdue'  ? 'border-red-200 bg-red-50'    :
    variant === 'waiting'  ? 'border-amber-200 bg-amber-50' :
    variant === 'ongoing'  ? 'border-amber-200 bg-amber-50' :
    'border-neutral-200 bg-white'

  return (
    <Link href={`/contractor/job/${job.id}${asParam ? `?as=${asParam}` : ''}`}>
      <div className={`rounded-2xl border p-md shadow-sm flex items-center justify-between gap-md hover:shadow-md transition-shadow cursor-pointer ${borderCls}`}>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-neutral-900 truncate">{job.properties?.name}</p>
          <p className="text-sm text-neutral-500 truncate">
            {category}{job.rooms?.name ? ` · ${job.rooms.name}` : ''}
          </p>
          {variant === 'ongoing' && job.return_reason && (
            <p className="text-xs text-amber-700 font-semibold mt-xs">
              {job.return_reason}
              {job.return_date ? ` · Return ${job.return_date}` : ''}
            </p>
          )}
          {job.booked_date && variant !== 'ongoing' && (
            <p className={`text-xs mt-xs font-semibold ${variant === 'overdue' ? 'text-red-600' : 'text-neutral-400'}`}>
              {variant === 'overdue' ? '⚠️ ' : '📅 '}
              {formatDateUK(job.booked_date)}
              {job.booked_slot ? ` · ${String(job.booked_slot).slice(0, 5)}` : ' · time TBC'}
            </p>
          )}
          {variant === 'waiting' && (
            <p className="text-xs mt-xs text-amber-700 font-semibold">Tap to pick a date</p>
          )}
        </div>
        <div className="flex items-center gap-sm shrink-0">
          {job.priority === 'high' && (
            <span className="text-xs font-bold text-red-600 bg-red-100 px-sm py-xs rounded-full">High</span>
          )}
          {variant === 'ongoing' && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-sm py-xs rounded-full">Ongoing</span>
          )}
          <span className="text-neutral-400 text-sm">›</span>
        </div>
      </div>
    </Link>
  )
}

// ── Quote card ────────────────────────────────────────────────────────────────
function QuoteCard({ job, asParam }: { job: Job; asParam?: string }) {
  const submitted = !!job.quote_submitted_at
  return (
    <Link href={`/contractor/job/${job.id}${asParam ? `?as=${asParam}` : job.quote_id ? `?quote=${job.quote_id}` : ''}`}>
      <div className={`rounded-2xl border p-md shadow-sm flex items-center justify-between gap-md hover:shadow-md transition-shadow cursor-pointer ${
        submitted ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'
      }`}>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-neutral-900 truncate">{job.properties?.name}</p>
          <p className="text-sm text-neutral-500 truncate">
            {String(job.category || 'General').replace(/-/g, ' ')}
            {job.rooms?.name ? ` · ${job.rooms.name}` : ''}
          </p>
          {submitted ? (
            <p className="text-xs text-green-700 font-semibold mt-xs">
              ✓ Quote submitted{job.quote_amount ? ` · £${Number(job.quote_amount).toFixed(2)}` : ''}
            </p>
          ) : job.quote_site_visit ? (
            <p className="text-xs text-amber-700 font-semibold mt-xs">
              📍 Site visit needed{job.quote_visit_date ? ` · ${formatDateUK(job.quote_visit_date)}` : ''}
            </p>
          ) : (
            <p className="text-xs text-blue-700 font-semibold mt-xs">Tap to submit your quote</p>
          )}
        </div>
        <div className="flex items-center gap-sm shrink-0">
          {submitted
            ? <span className="text-xs font-bold text-green-700 bg-green-100 px-sm py-xs rounded-full">Submitted</span>
            : <span className="text-xs font-bold text-blue-700 bg-blue-100 px-sm py-xs rounded-full">Quote needed</span>
          }
          <span className="text-neutral-400 text-sm">›</span>
        </div>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ContractorDashboard() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading]               = useState(true)
  const [contractorName, setContractorName] = useState('')
  const [jobs, setJobs]                     = useState<Job[]>([])
  const [completedJobs, setCompletedJobs]   = useState<Job[]>([])
  const [selectedDay, setSelectedDay]       = useState<string>(getTodayGMT())
  const [weekOffset, setWeekOffset]         = useState<number>(0)
  const [viewingAs, setViewingAs]           = useState<{ id: string; name: string; role: string } | null>(null)
  const [activeTab, setActiveTab]           = useState<Tab>('today')
  const tabStripRef                         = useRef<HTMLDivElement>(null)

  // Desktop click-to-schedule panel
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false)
  const [schedulingId, setSchedulingId]         = useState<string | null>(null)
  const [pickDate, setPickDate]                 = useState('')
  const [pickTime, setPickTime]                 = useState('09:00')
  const [pickFallbackDate, setPickFallbackDate] = useState('')
  const [pickFallbackTime, setPickFallbackTime] = useState('09:00')
  const [schedulePhase, setSchedulePhase]       = useState<'pick'|'fallback'|'submitting'|'done'>('pick')
  const [scheduleMsg, setScheduleMsg]           = useState('')

  function goToTab(tab: Tab) {
    setActiveTab(tab)
    setTimeout(() => tabStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const diaryDays = buildWeekDays(weekOffset)

  useEffect(() => {
    async function checkAuth() {
      const data    = await getCurrentUser()
      const asParam = searchParams.get('as')
      const isAdmin = ['administrator', 'admin'].includes(data?.assignment?.role || '')

      let contractorId: string

      if (asParam && isAdmin) {
        const supabase = createClient()
        const { data: target } = await supabase
          .from('people')
          .select('id, first_name, last_name, full_name, email, role')
          .eq('id', asParam)
          .single()
        if (!target || target.role !== 'contractor') { router.push('/admin/people'); return }
        setViewingAs({ id: asParam, name: displayName(target), role: target.role })
        contractorId = asParam
        setContractorName(displayName(target))
      } else if (!data || data.assignment?.role !== 'contractor') {
        router.push('/login')
        return
      } else {
        contractorId = (data.assignment as any).id
        const supabase = createClient()
        const { data: personData } = await supabase
          .from('people')
          .select('full_name, first_name, last_name')
          .eq('id', contractorId)
          .single()
        if (personData) setContractorName(displayName(personData))
      }

      const supabase = createClient()

      const { data: jobsData } = await supabase
        .from('maintenance_tickets')
        .select('*, properties(name, address), rooms(name)')
        .eq('contractor_id', contractorId)
        .neq('status', 'completed')
        .order('booked_date', { ascending: true })
      // Quote requests don't assign the job, so they come from their own list and join the Quotes tab.
      let quoteJobsData: Job[] = []
      if (!(asParam && isAdmin)) {
        const qr = await fetch('/api/contractor/quotes').then(r => r.ok ? r.json() : { quotes: [] }).catch(() => ({ quotes: [] }))
        quoteJobsData = ((qr.quotes ?? []) as any[])
          .filter(q => q.maintenance_tickets && (q.status === 'requested' || q.status === 'submitted'))
          .map(q => ({
            ...q.maintenance_tickets,
            quote_requested: true, quote_id: q.id,
            quote_amount: q.amount, quote_notes: q.notes, quote_site_visit: q.site_visit,
            quote_visit_date: q.visit_date, quote_submitted_at: q.submitted_at,
          }))
      }
      const assigned = (jobsData || []) as Job[]
      const assignedIds = new Set(assigned.map(j => j.id))
      setJobs([...assigned, ...quoteJobsData.filter(j => !assignedIds.has(j.id))])

      const { data: doneData } = await supabase
        .from('maintenance_tickets')
        .select('*, properties(name, address), rooms(name)')
        .eq('contractor_id', contractorId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(20)
      setCompletedJobs(doneData || [])

      setLoading(false)
    }
    checkAuth()
  }, [router, searchParams])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <div className="bg-neutral-950 pb-xl">
          <div style={{ height: 'calc(env(safe-area-inset-top) + 52px)' }} />
          <div className="px-lg pt-lg">
            <div className="h-2.5 w-14 rounded-full bg-white/20 mb-sm" />
            <div className="h-7 w-44 rounded-xl bg-white/20 mb-xl" />
            <div className="grid grid-cols-2 gap-sm">
              {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-neutral-900 animate-pulse" />)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Derived categories ────────────────────────────────────────────────────
  const quoteJobs   = jobs.filter(j => j.quote_requested === true)
  const quoteJobIds = new Set(quoteJobs.map(j => j.id))

  const nonQuote    = jobs.filter(j => !quoteJobIds.has(j.id))

  const ongoing     = nonQuote.filter(j => (j.return_needed === true && !j.booked_date) || j.status === 'in_progress')
  const ongoingIds  = new Set(ongoing.map(j => j.id))

  const overdue     = nonQuote.filter(j => j.booked_date && isDatePast(j.booked_date) && !ongoingIds.has(j.id))
  const toSchedule  = nonQuote.filter(j => !j.booked_date && j.status === 'assigned' && !ongoingIds.has(j.id))
  const bookedAhead = nonQuote.filter(j => j.booked_date && !isDatePast(j.booked_date) && !ongoingIds.has(j.id))

  const dayJobs     = bookedAhead.filter(j => j.booked_date === selectedDay)

  const countByDay: Record<string, number> = {}
  for (const j of bookedAhead) {
    if (j.booked_date) countByDay[j.booked_date] = (countByDay[j.booked_date] || 0) + 1
  }

  const pendingQuotes   = quoteJobs.filter(j => !j.quote_submitted_at)
  const submittedQuotes = quoteJobs.filter(j => !!j.quote_submitted_at)
  const needsAttention  = (toSchedule.length + overdue.length)
  const firstName       = contractorName.split(' ')[0] || 'there'
  const asId            = viewingAs?.id

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'today',   label: 'Today' },
    { key: 'quotes',  label: 'Quotes',   badge: pendingQuotes.length },
    { key: 'ongoing', label: 'Ongoing',  badge: ongoing.length },
    { key: 'waiting', label: 'Overdue / to book',  badge: needsAttention },
    { key: 'booked',  label: 'Booked' },
    { key: 'done',    label: 'Done' },
  ]

  // ── Upcoming jobs for the desktop right panel (next 5 with dates) ─────────
  const upcomingWithDates = bookedAhead.slice(0, 5)

  // ── Today's week (Mon–Sun) for desktop mini calendar ─────────────────────
  const today = getTodayGMT()
  const todayDate = new Date(today + 'T00:00:00')
  const weekStart = new Date(todayDate)
  weekStart.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7)) // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>

      {viewingAs && <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />}

      {/* ════════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT (lg+) — 3-column vision spec: sidebar | main | rail
      ════════════════════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:grid lg:min-h-screen"
        style={{ gridTemplateColumns: '220px 1fr 300px', background: '#F6F3EC', fontFamily: 'Inter,system-ui,sans-serif' }}
      >

        {/* ═══ SIDEBAR ════════════════════════════════════════════════════ */}
        {(() => {
          const sidebarItems: { key: Tab; label: string; badge?: number }[] = [
            { key: 'today',   label: 'Today' },
            { key: 'quotes',  label: 'Quotes',  badge: pendingQuotes.length  },
            { key: 'ongoing', label: 'Ongoing', badge: ongoing.length        },
            { key: 'waiting', label: 'Overdue / to book', badge: needsAttention },
            { key: 'booked',  label: 'Booked'  },
            { key: 'done',    label: 'Done'    },
          ]
          return (
            <nav style={{ background: '#181614', color: '#F6F3EC', padding: '22px 16px', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
              <div style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontWeight: 800, fontSize: 15, letterSpacing: '0.02em' }}>
                CAPITAL ROOMS
                <span style={{ display: 'block', fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', opacity: 0.5, marginTop: 2, textTransform: 'uppercase' }}>Contractor Portal</span>
              </div>
              <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                {sidebarItems.map(({ key, label, badge }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
                      color: activeTab === key ? '#F6F3EC' : 'rgba(246,243,236,0.6)',
                      background: activeTab === key ? 'rgba(246,243,236,0.1)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {label}
                    {badge && badge > 0 ? (
                      <span style={{ background: '#B4472F', color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 6px' }}>{badge}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div style={{ borderTop: '1px solid rgba(246,243,236,0.15)', paddingTop: 14, fontSize: 12, color: 'rgba(246,243,236,0.55)', display: 'flex', justifyContent: 'space-between' }}>
                <a href="/contractor/profile" style={{ color: 'inherit', textDecoration: 'none' }}>⚙ Profile</a>
                <button onClick={async () => { await signOut(); router.push('/login') }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>Sign out</button>
              </div>
            </nav>
          )
        })()}

        {/* ═══ MAIN ═══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden' }}>

          {/* Dark hero */}
          <div style={{ background: '#181614', color: '#F6F3EC', padding: '26px 32px 22px' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 24, margin: '0 0 3px', fontWeight: 800 }}>Hi {firstName} 👋</h1>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(246,243,236,0.6)' }}>
                {today ? `Here's what's on today, ${new Date(today + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.` : ''}
              </p>
            </div>
            {/* Stat tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 20 }}>
              {[
                { num: dayJobs.length,       label: 'Today',        numColor: undefined,  onClick: () => setActiveTab('today')  },
                { num: quoteJobs.length,     label: 'Quotes',       numColor: pendingQuotes.length > 0 ? '#E8836B' : undefined, onClick: () => setActiveTab('quotes') },
                { num: needsAttention,       label: 'Need booking ▾', numColor: needsAttention > 0 ? '#E8836B' : undefined, onClick: () => setDesktopPanelOpen(o => !o) },
                { num: bookedAhead.length,   label: 'Booked ahead', numColor: undefined,  onClick: () => setActiveTab('booked') },
              ].map(({ num, label, numColor, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  style={{ background: 'rgba(246,243,236,0.07)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', border: 'none' }}
                >
                  <div style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 24, fontWeight: 700, color: numColor ?? '#F6F3EC' }}>{num}</div>
                  <div style={{ fontSize: 11, color: 'rgba(246,243,236,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Expandable "Need booking" panel */}
          {desktopPanelOpen && needsAttention > 0 && (
            <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E7E1D4', maxHeight: 380, overflowY: 'auto' }}>
              <div style={{ padding: '16px 32px' }}>
                {[...overdue, ...toSchedule].map(job => {
                  const isScheduling = schedulingId === job.id
                  return (
                    <div key={job.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px', background: '#F6F3EC', border: '1px solid #E7E1D4', borderRadius: 12, marginBottom: 8, gap: 16 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <b style={{ fontSize: 13, display: 'block' }}>{job.properties?.name}</b>
                        <span style={{ fontSize: 11.5, color: '#59544C', display: 'block', marginTop: 1 }}>{String(job.category || 'General').replace(/-/g, ' ')}</span>
                        {overdue.find(o => o.id === job.id) && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#B4472F', display: 'block', marginTop: 2 }}>⚠️ Overdue</span>
                        )}
                        {/* Inline slot picker */}
                        {isScheduling && (
                          <div style={{ marginTop: 10, padding: '10px', background: '#fff', border: '1px solid #E7E1D4', borderRadius: 10 }}>
                            {schedulePhase === 'submitting' ? (
                              <p style={{ fontSize: 12, color: '#59544C' }}>Saving…</p>
                            ) : schedulePhase === 'done' ? (
                              <p style={{ fontSize: 12, color: '#4B6358', fontWeight: 600 }}>{scheduleMsg}</p>
                            ) : (
                              <>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#181614', marginBottom: 6 }}>
                                  {schedulePhase === 'fallback' ? 'Fallback slot (≥ 24h from now required)' : 'Pick a date & time'}
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <input
                                    type="date"
                                    value={schedulePhase === 'fallback' ? pickFallbackDate : pickDate}
                                    onChange={e => schedulePhase === 'fallback' ? setPickFallbackDate(e.target.value) : setPickDate(e.target.value)}
                                    style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E7E1D4', borderRadius: 7, flex: 1 }}
                                  />
                                  <input
                                    type="time"
                                    value={schedulePhase === 'fallback' ? pickFallbackTime : pickTime}
                                    onChange={e => schedulePhase === 'fallback' ? setPickFallbackTime(e.target.value) : setPickTime(e.target.value)}
                                    style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #E7E1D4', borderRadius: 7, width: 90 }}
                                  />
                                  <button
                                    onClick={async () => {
                                      if (schedulePhase === 'fallback') {
                                        setSchedulePhase('submitting')
                                        const res = await fetch('/api/book-with-24h-check', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ ticketId: job.id, requestedDate: pickDate, requestedTime: pickTime, fallbackDate: pickFallbackDate, fallbackTime: pickFallbackTime }),
                                        }).then(r => r.json())
                                        setScheduleMsg(res.message || res.outcome)
                                        setSchedulePhase('done')
                                      } else {
                                        // First attempt — check 24h
                                        if (!pickDate || !pickTime) return
                                        setSchedulePhase('submitting')
                                        const res = await fetch('/api/book-with-24h-check', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ ticketId: job.id, requestedDate: pickDate, requestedTime: pickTime }),
                                        }).then(r => r.json())
                                        if (res.outcome === 'booked') {
                                          setScheduleMsg(res.message)
                                          setSchedulePhase('done')
                                        } else if (res.requiresFallback) {
                                          setScheduleMsg(res.message)
                                          setSchedulePhase('fallback')
                                        } else {
                                          setScheduleMsg(res.message || 'Error')
                                          setSchedulePhase('done')
                                        }
                                      }
                                    }}
                                    style={{ background: '#4B6358', color: 'white', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                                  >
                                    {schedulePhase === 'fallback' ? 'Confirm' : 'Book'}
                                  </button>
                                  <button onClick={() => setSchedulingId(null)} style={{ background: 'transparent', border: '1.5px solid #E7E1D4', borderRadius: 9, padding: '7px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: '#181614' }}>✕</button>
                                </div>
                                {schedulePhase === 'fallback' && (
                                  <p style={{ fontSize: 10.5, color: '#B4472F', marginTop: 6 }}>{scheduleMsg}</p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {!isScheduling && (
                        <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                          <Link href={`/contractor/job/${job.id}${asId ? `?as=${asId}` : ''}`} style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid #E7E1D4', background: 'transparent', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: '#181614', textDecoration: 'none' }}>
                            View details
                          </Link>
                          <button
                            onClick={() => {
                              setSchedulingId(job.id)
                              setPickDate(today)
                              setPickTime('09:00')
                              setPickFallbackDate('')
                              setPickFallbackTime('09:00')
                              setSchedulePhase('pick')
                              setScheduleMsg('')
                            }}
                            style={{ padding: '7px 12px', borderRadius: 9, border: 'none', background: '#4B6358', color: 'white', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                          >
                            + Add to diary
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Body — diary or list view */}
          <main style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 40px' }}>

            {/* TODAY: diary grid */}
            {activeTab === 'today' && (() => {
              const diaryJobs: DiaryJob[] = [
                ...bookedAhead.filter(j => j.booked_date).map(j => ({
                  id: j.id,
                  date: j.booked_date!,
                  time: j.booked_slot ? String(j.booked_slot).slice(0, 5) : null,
                  label: j.properties?.name || 'Unknown',
                  sublabel: String(j.category || 'General').replace(/-/g, ' '),
                  isOverdue: false,
                  href: `/contractor/job/${j.id}${asId ? `?as=${asId}` : ''}`,
                })),
                ...overdue.filter(j => j.booked_date).map(j => ({
                  id: j.id,
                  date: j.booked_date!,
                  time: j.booked_slot ? String(j.booked_slot).slice(0, 5) : null,
                  label: j.properties?.name || 'Unknown',
                  sublabel: String(j.category || 'General').replace(/-/g, ' '),
                  isOverdue: true,
                  href: `/contractor/job/${j.id}${asId ? `?as=${asId}` : ''}`,
                })),
              ]
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h2 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 18, margin: 0, color: '#181614' }}>Diary</h2>
                    <div style={{ fontSize: 12, color: '#59544C' }}>
                      {diaryJobs.length === 0 ? 'No jobs scheduled this week' : `${diaryJobs.length} job${diaryJobs.length !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <MultiDayDiaryGrid
                    jobs={diaryJobs}
                    startHour={8}
                    endHour={19}
                    todayISO={today}
                  />
                  {diaryJobs.length === 0 && toSchedule.length === 0 && (
                    <p style={{ marginTop: 24, fontSize: 12, color: '#59544C', textAlign: 'center' }}>No jobs in the diary yet. Click "Need booking ▾" above to schedule jobs.</p>
                  )}
                </div>
              )
            })()}

            {/* QUOTES */}
            {activeTab === 'quotes' && (
              <div className="space-y-lg">
                {pendingQuotes.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wide mb-sm">📋 Awaiting your quote</h2>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-md py-sm mb-md">
                      <p className="text-xs text-blue-800 font-semibold">Review each job — you can submit a price or flag that you need to visit first.</p>
                    </div>
                    <div className="space-y-sm">
                      {pendingQuotes.map(job => <QuoteCard key={job.id} job={job} asParam={asId} />)}
                    </div>
                  </div>
                )}
                {submittedQuotes.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-green-700 uppercase tracking-wide mb-sm">✓ Quotes submitted</h2>
                    <div className="space-y-sm">{submittedQuotes.map(job => <QuoteCard key={job.id} job={job} asParam={asId} />)}</div>
                  </div>
                )}
                {quoteJobs.length === 0 && (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                    <p className="text-sm font-medium text-neutral-400">No quote requests</p>
                  </div>
                )}
              </div>
            )}

            {/* ONGOING */}
            {activeTab === 'ongoing' && (
              <div className="space-y-sm">
                {ongoing.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                    <p className="text-sm font-medium text-neutral-400">No ongoing jobs</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm">
                      <p className="text-xs text-amber-700 font-semibold">Jobs started but left on site — tap to pick up or mark complete.</p>
                    </div>
                    {ongoing.map(job => <JobCard key={job.id} job={job} variant="ongoing" asParam={asId} />)}
                  </>
                )}
              </div>
            )}

            {/* WAITING */}
            {activeTab === 'waiting' && (
              <div className="space-y-lg">
                {overdue.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-red-600 uppercase tracking-wide mb-sm">⚠️ Overdue</h2>
                    <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm mb-md"><p className="text-xs text-red-700">These visits have passed — open each to log or reschedule.</p></div>
                    <div className="space-y-sm">{overdue.map(job => <JobCard key={job.id} job={job} variant="overdue" asParam={asId} />)}</div>
                  </div>
                )}
                {toSchedule.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide mb-sm">📅 Need a date</h2>
                    <div className="space-y-sm">{toSchedule.map(job => <JobCard key={job.id} job={job} variant="waiting" asParam={asId} />)}</div>
                  </div>
                )}
                {overdue.length === 0 && toSchedule.length === 0 && (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                    <p className="text-sm font-medium text-neutral-400">Nothing waiting — all jobs have dates</p>
                  </div>
                )}
              </div>
            )}

            {/* BOOKED */}
            {activeTab === 'booked' && (
              <div className="space-y-sm">
                {bookedAhead.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                    <p className="text-sm font-medium text-neutral-400">No jobs booked ahead</p>
                  </div>
                ) : bookedAhead.map(job => <JobCard key={job.id} job={job} asParam={asId} />)}
              </div>
            )}

            {/* DONE */}
            {activeTab === 'done' && (
              <div className="space-y-sm">
                {completedJobs.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                    <p className="text-sm font-medium text-neutral-400">No completed jobs yet</p>
                  </div>
                ) : completedJobs.map(job => (
                  <Link key={job.id} href={`/contractor/job/${job.id}`}>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-md flex items-center justify-between gap-md hover:shadow-md transition-shadow cursor-pointer">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-neutral-900 truncate">{job.properties?.name}</p>
                        <p className="text-sm text-neutral-500 truncate">{String(job.category || 'General').replace(/-/g, ' ')}</p>
                        {job.completed_at && (
                          <p className="text-xs text-neutral-400 mt-xs">Completed {new Date(job.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-green-100 text-green-700 text-xs font-bold px-sm py-xs">Done ✓</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </main>
        </div>

        {/* ═══ RIGHT RAIL ══════════════════════════════════════════════════ */}
        {(() => {
          const railAlerts = [
            ...(needsAttention > 0 ? [{ title: `${needsAttention} job${needsAttention !== 1 ? 's' : ''} need booking`, body: 'Click "Need booking ▾" to add dates', variant: 'red' as const, onClick: () => setDesktopPanelOpen(o => !o) }] : []),
            ...(overdue.length > 0 ? [{ title: `${overdue.length} overdue`, body: overdue.slice(0,2).map(j => j.properties?.name).join(', '), variant: 'red' as const, onClick: () => setActiveTab('today') }] : []),
            ...(pendingQuotes.length > 0 ? [{ title: `${pendingQuotes.length} quote${pendingQuotes.length !== 1 ? 's' : ''} to submit`, body: 'Tap Quotes to review', variant: 'amber' as const, onClick: () => setActiveTab('quotes') }] : []),
            ...(completedJobs.length > 0 ? [{ title: `${completedJobs.filter(j => { const d = j.completed_at ? new Date(j.completed_at) : null; return d && (Date.now() - d.getTime()) < 7*86400000 }).length} done this week`, body: 'Keep it up', variant: 'sage' as const, onClick: () => setActiveTab('done') }] : []),
          ]
          return (
            <DesktopRightRail
              dateCounts={countByDay}
              todayISO={today}
              alerts={railAlerts}
              alertsHeading="Needs Attention"
            >
              {/* Coming up */}
              {upcomingWithDates.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#59544C', margin: '0 0 10px' }}>Coming Up</h3>
                  {upcomingWithDates.slice(0, 4).map(job => (
                    <Link key={job.id} href={`/contractor/job/${job.id}${asId ? `?as=${asId}` : ''}`}>
                      <div style={{ background: '#FFFFFF', border: '1px solid #E7E1D4', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#181614', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.properties?.name}</div>
                        <div style={{ fontSize: 11, color: '#59544C', marginTop: 1 }}>{String(job.category || 'General').replace(/-/g, ' ')}</div>
                        <div style={{ fontSize: 10.5, color: '#59544C', marginTop: 3 }}>📅 {formatDateUK(job.booked_date!)}{job.booked_slot ? ` · ${String(job.booked_slot).slice(0,5)}` : ''}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </DesktopRightRail>
          )
        })()}


      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MOBILE LAYOUT (< lg) — existing layout unchanged
      ════════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden">

        <DarkHeroHeader
          eyebrow="Contractor"
          heading={`Hi ${firstName} 👋`}
          topRight={
            <div className="flex items-center gap-md">
              <a href="/contractor/profile" className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors" title="Profile">
                <span className="text-lg leading-none">⚙️</span>
              </a>
              <button onClick={async () => { await signOut(); router.push('/login') }} className="hover:text-white/70 transition-colors">
                Sign out
              </button>
            </div>
          }
        >
          <div className="max-w-2xl mx-auto w-full">
            <div className="grid grid-cols-2 gap-sm mb-xl">
              <button onClick={() => goToTab('waiting')} className="text-left focus:outline-none">
                <StatTile value={toSchedule.length} label="New jobs" valueColor={toSchedule.length > 0 ? 'text-green-400' : 'text-white'} />
              </button>
              <button onClick={() => goToTab('waiting')} className="text-left focus:outline-none">
                <StatTile value={overdue.length} label="Overdue" valueColor={overdue.length > 0 ? 'text-red-400' : 'text-white'} />
              </button>
              <button onClick={() => goToTab('quotes')} className="text-left focus:outline-none">
                <StatTile value={pendingQuotes.length} label="Quotes" valueColor={pendingQuotes.length > 0 ? 'text-blue-400' : 'text-white'} />
              </button>
              <button onClick={() => goToTab('today')} className="text-left focus:outline-none">
                <StatTile value={dayJobs.length} label="Today" valueColor="text-blue-400" />
              </button>
            </div>

            {/* 7-day week strip with prev/next arrows */}
            <div className="flex items-center gap-xs">
              <button
                onClick={() => setWeekOffset(o => o - 1)}
                className="shrink-0 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg leading-none"
                aria-label="Previous week"
              >‹</button>
              <div className="flex gap-xs flex-1 justify-between">
                {diaryDays.map(iso => {
                  const { day, date, month } = isoToDateParts(iso)
                  const isToday    = iso === today
                  const isSelected = iso === selectedDay
                  const jobCount   = countByDay[iso] ?? 0
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
                      {jobCount > 0 ? (
                        <span className={`text-[10px] font-bold rounded-full px-xs ${isSelected ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'}`}>
                          {jobCount}
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
          </div>
        </DarkHeroHeader>

        {/* Mobile tab strip */}
        <div
          ref={tabStripRef}
          className="bg-white border-b border-neutral-200 sticky z-40 px-lg pt-md pb-0"
          style={{ top: 'calc(env(safe-area-inset-top) + 52px)' }}
        >
          <div className="flex gap-xs overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`relative px-lg py-sm rounded-full text-sm font-bold whitespace-nowrap transition-all mb-sm ${
                  activeTab === key ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
              >
                {label}
                {badge && badge > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-xs bg-red-500 text-white">
                    {badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile tab content */}
        <main className="mx-auto max-w-2xl px-lg pb-3xl">

          {activeTab === 'today' && (
            <div className="pt-sm space-y-sm">
              <div className="pt-sm pb-sm"><EnableNotifications /></div>
              <a href="/planner" className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-lg py-md text-sm font-bold text-neutral-900">🗂️ With Capital Rooms — notes, jobs &amp; photos<span aria-hidden="true">›</span></a>
              <a href={`/contractor/invoices${asId ? `?as=${asId}` : ''}`} className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-lg py-md text-sm font-bold text-neutral-900">🧾 Invoices — make and send a professional invoice<span aria-hidden="true">›</span></a>
              {/* visits that have passed (or still need a date) shouldn't hide behind another tab */}
              {needsAttention > 0 && (
                <button type="button" onClick={() => goToTab('waiting')}
                  className="flex w-full items-center justify-between gap-md rounded-2xl border border-red-200 bg-red-50 px-lg py-md text-left">
                  <span className="text-sm font-bold text-red-800">
                    ⚠️ {[overdue.length ? `${overdue.length} visit${overdue.length === 1 ? '' : 's'} need logging or rebooking` : '', toSchedule.length ? `${toSchedule.length} job${toSchedule.length === 1 ? '' : 's'} to book` : ''].filter(Boolean).join(' · ')}
                  </span>
                  <span className="text-sm font-bold text-red-800">›</span>
                </button>
              )}
              {dayJobs.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                  <p className="text-sm font-medium text-neutral-400">
                    {selectedDay === today ? 'Nothing booked for today' : `Nothing booked for ${formatDateUK(selectedDay)}`}
                  </p>
                </div>
              ) : dayJobs.map(job => <JobCard key={job.id} job={job} asParam={asId} />)}
            </div>
          )}

          {activeTab === 'quotes' && (
            <div className="pt-lg space-y-lg">
              {pendingQuotes.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wide mb-sm">📋 Awaiting your quote</h2>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-md py-sm mb-md">
                    <p className="text-xs text-blue-800 font-semibold">Review each job and submit your price, or flag that you need to visit first.</p>
                  </div>
                  <div className="space-y-sm">{pendingQuotes.map(job => <QuoteCard key={job.id} job={job} asParam={asId} />)}</div>
                </div>
              )}
              {submittedQuotes.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-green-700 uppercase tracking-wide mb-sm">✓ Submitted</h2>
                  <div className="space-y-sm">{submittedQuotes.map(job => <QuoteCard key={job.id} job={job} asParam={asId} />)}</div>
                </div>
              )}
              {quoteJobs.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                  <p className="text-sm font-medium text-neutral-400">No quote requests</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ongoing' && (
            <div className="pt-lg">
              {ongoing.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                  <p className="text-sm font-medium text-neutral-400">No ongoing jobs</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm mb-md">
                    <p className="text-xs text-amber-700 font-semibold">Jobs started but left on site — tap to pick up or mark complete.</p>
                  </div>
                  <div className="space-y-sm">{ongoing.map(job => <JobCard key={job.id} job={job} variant="ongoing" asParam={asId} />)}</div>
                </>
              )}
            </div>
          )}

          {activeTab === 'waiting' && (
            <div className="pt-lg space-y-lg">
              {overdue.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-red-600 uppercase tracking-wide mb-sm">⚠️ Overdue</h2>
                  <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm mb-sm">
                    <p className="text-xs text-red-700">These visits have passed — tap to log or reschedule.</p>
                  </div>
                  <div className="space-y-sm">{overdue.map(job => <JobCard key={job.id} job={job} variant="overdue" asParam={asId} />)}</div>
                </div>
              )}
              {toSchedule.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide mb-sm">📅 Need a date</h2>
                  <div className="space-y-sm">{toSchedule.map(job => <JobCard key={job.id} job={job} variant="waiting" asParam={asId} />)}</div>
                </div>
              )}
              {overdue.length === 0 && toSchedule.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                  <p className="text-sm font-medium text-neutral-400">Nothing waiting — all jobs have dates</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'booked' && (
            <div className="pt-lg">
              {bookedAhead.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                  <p className="text-sm font-medium text-neutral-400">No jobs booked ahead</p>
                </div>
              ) : <div className="space-y-sm">{bookedAhead.map(job => <JobCard key={job.id} job={job} asParam={asId} />)}</div>}
            </div>
          )}

          {activeTab === 'done' && (
            <div className="pt-lg">
              {completedJobs.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center">
                  <p className="text-sm font-medium text-neutral-400">No completed jobs yet</p>
                </div>
              ) : (
                <div className="space-y-sm">
                  {completedJobs.map(job => (
                    <Link key={job.id} href={`/contractor/job/${job.id}`}>
                      <div className="rounded-2xl border border-neutral-200 bg-white p-md flex items-center justify-between gap-md hover:shadow-md transition-shadow cursor-pointer">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-neutral-900 truncate">{job.properties?.name}</p>
                          <p className="text-sm text-neutral-500 truncate">{String(job.category || 'General').replace(/-/g, ' ')}</p>
                          {job.completed_at && (
                            <p className="text-xs text-neutral-400 mt-xs">
                              Completed {new Date(job.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-green-100 text-green-700 text-xs font-bold px-sm py-xs">Done ✓</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

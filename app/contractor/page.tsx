'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import { displayName } from '@/lib/people'
import { ContractorDashboardSkeleton } from '@/app/components/SkeletonLoading'
import EnableNotifications from '@/app/components/EnableNotifications'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import Link from 'next/link'
import { getTodayGMT, isDatePast, isDateToday, formatDateUK } from '@/lib/dateUtils'

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
}

/** Returns an array of ISO date strings starting from today, for N days */
function buildDiaryDays(n = 14): string[] {
  const days: string[] = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isoToDateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return { day: DAY_LABELS[date.getDay()], date: d, month: MONTH_SHORT[m - 1] }
}

export default function ContractorDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [contractorName, setContractorName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedDay, setSelectedDay] = useState<string>(getTodayGMT())
  const [viewingAs, setViewingAs] = useState<{ id: string; name: string; role: string } | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const searchParams = useSearchParams()
  const diaryDays = buildDiaryDays(21) // 3 weeks ahead

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()
      const asParam = searchParams.get('as')
      const isAdmin = ['administrator', 'admin'].includes(data?.assignment?.role || '')

      // ── Impersonation: admin visiting /contractor?as=[personId] ──────────
      let contractorId: string
      if (asParam && isAdmin) {
        const supabase = createClient()
        const { data: target } = await supabase
          .from('people')
          .select('id, first_name, last_name, full_name, email, role')
          .eq('id', asParam)
          .single()
        if (!target || target.role !== 'contractor') { router.push('/admin/people'); return }
        setUser(data!.user)
        setViewingAs({ id: asParam, name: displayName(target), role: target.role })
        contractorId = asParam
        setContractorName(displayName(target))
      } else if (!data || data.assignment?.role !== 'contractor') {
        router.push('/login')
        return
      } else {
        setUser(data.user)
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

      setJobs(jobsData || [])
      setLoading(false)
    }
    checkAuth()
  }, [router, searchParams])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  if (loading) return <ContractorDashboardSkeleton />

  // Categorise jobs
  const overdue = jobs.filter(
    (j) => j.booked_date && isDatePast(j.booked_date) && j.status !== 'completed'
  )
  const toSchedule = jobs.filter((j) => !j.booked_date && j.status === 'assigned')
  const bookedAhead = jobs.filter(
    (j) => j.booked_date && !isDatePast(j.booked_date)
  )

  // Jobs count per diary day
  const countByDay: Record<string, number> = {}
  for (const j of bookedAhead) {
    if (j.booked_date) countByDay[j.booked_date] = (countByDay[j.booked_date] || 0) + 1
  }

  // Jobs on selected day
  const dayJobs = bookedAhead.filter((j) => j.booked_date === selectedDay)

  const firstName = contractorName.split(' ')[0] || 'there'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {viewingAs && (
        <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />
      )}
      <AppBar
        right={
          <div className="flex items-center gap-md">
            <a href="/contractor/profile" className="shrink-0 transition-colors hover:opacity-80 flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10" title="Profile settings">
              <span className="text-lg leading-none">⚙️</span>
            </a>
            <button onClick={handleSignOut} className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm">
              <span>👋</span> Sign out
            </button>
          </div>
        }
      />

      <main className="mx-auto max-w-2xl px-lg py-lg">

        {/* Header */}
        <div className="mb-lg">
          <h1 className="text-2xl font-bold text-neutral-900">Hi {firstName} 👋</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            {overdue.length > 0
              ? `${overdue.length} overdue job${overdue.length !== 1 ? 's' : ''} need attention`
              : toSchedule.length > 0
              ? `${toSchedule.length} job${toSchedule.length !== 1 ? 's' : ''} waiting for a date`
              : bookedAhead.length > 0
              ? `${bookedAhead.length} job${bookedAhead.length !== 1 ? 's' : ''} coming up`
              : 'All clear — no open jobs'}
          </p>
        </div>

        {/* Notifications */}
        <div className="mb-lg">
          <EnableNotifications />
        </div>

        {/* ── Diary strip ── */}
        <div className="mb-lg">
          <div className="flex items-center justify-between mb-sm">
            <h2 className="text-base font-bold text-neutral-900">Diary</h2>
            <span className="text-xs text-neutral-500">Tap a day to see jobs</span>
          </div>
          <div
            ref={stripRef}
            className="flex gap-sm overflow-x-auto pb-sm"
            style={{ scrollbarWidth: 'none' }}
          >
            {diaryDays.map((iso) => {
              const { day, date, month } = isoToDateParts(iso)
              const isToday = iso === getTodayGMT()
              const isSelected = iso === selectedDay
              const jobCount = countByDay[iso] ?? 0
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDay(iso)}
                  className={`shrink-0 flex flex-col items-center rounded-2xl px-md py-sm transition-colors min-w-[52px]
                    ${isSelected
                      ? 'bg-neutral-900 text-white'
                      : isToday
                      ? 'bg-neutral-200 text-neutral-900 border-2 border-neutral-400'
                      : 'bg-white text-neutral-700 border border-neutral-200'
                    }`}
                >
                  <span className="text-xs font-semibold opacity-70">{day}</span>
                  <span className="text-lg font-bold leading-none my-xs">{date}</span>
                  <span className="text-xs opacity-60">{month}</span>
                  {jobCount > 0 && (
                    <span
                      className={`mt-xs text-xs font-bold rounded-full px-xs py-0
                        ${isSelected ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'}`}
                    >
                      {jobCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Selected day jobs ── */}
        <section className="mb-xl">
          <div className="flex items-center justify-between mb-sm">
            <h2 className="text-base font-bold text-neutral-900">
              {selectedDay === getTodayGMT() ? 'Today' : formatDateUK(selectedDay)}
            </h2>
            {dayJobs.length > 0 && (
              <span className="text-xs text-neutral-500">{dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          {dayJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-lg text-center">
              <p className="text-sm text-neutral-400">Nothing booked for this day</p>
            </div>
          ) : (
            <div className="space-y-sm">
              {dayJobs.map((job) => <JobRow key={job.id} job={job} />)}
            </div>
          )}
        </section>

        {/* ── Overdue ── */}
        {overdue.length > 0 && (
          <section className="mb-xl">
            <div className="flex items-center justify-between mb-sm">
              <h2 className="text-base font-bold text-red-600">⚠️ Overdue</h2>
              <span className="text-xs text-red-500">{overdue.length} missed</span>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm mb-sm">
              <p className="text-xs text-red-700">These visits have passed — tap to log or reschedule.</p>
            </div>
            <div className="space-y-sm">
              {overdue.map((job) => <JobRow key={job.id} job={job} variant="overdue" />)}
            </div>
          </section>
        )}

        {/* ── Waiting (needs a date) ── */}
        {toSchedule.length > 0 && (
          <section className="mb-xl">
            <div className="flex items-center justify-between mb-sm">
              <h2 className="text-base font-bold text-amber-700">Waiting</h2>
              <span className="text-xs text-amber-600">{toSchedule.length} to book</span>
            </div>
            <div className="space-y-sm">
              {toSchedule.map((job) => <JobRow key={job.id} job={job} variant="schedule" />)}
            </div>
          </section>
        )}

        {/* ── Booked (upcoming, not today) ── */}
        {bookedAhead.filter((j) => j.booked_date !== selectedDay).length > 0 && (
          <section>
            <h2 className="text-base font-bold text-neutral-900 mb-sm">Booked</h2>
            <div className="space-y-sm">
              {bookedAhead
                .filter((j) => j.booked_date !== selectedDay)
                .map((job) => <JobRow key={job.id} job={job} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function JobRow({ job, variant }: { job: Job; variant?: 'overdue' | 'schedule' }) {
  const borderCls =
    variant === 'overdue'
      ? 'border-red-300 bg-red-50 hover:border-red-500'
      : variant === 'schedule'
      ? 'border-amber-300 bg-amber-50 hover:border-amber-500'
      : 'border-neutral-200 bg-white hover:border-neutral-900 hover:shadow-sm'

  const category = String(job.category || 'General').replace(/-/g, ' ')

  return (
    <Link href={`/contractor/job/${job.id}`}>
      <div className={`rounded-xl border px-md py-sm flex items-center justify-between gap-md transition-all cursor-pointer ${borderCls}`}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-neutral-900 truncate">{job.properties?.name}</p>
          <p className="text-xs text-neutral-500 truncate">
            {category}
            {job.rooms?.name ? ` · ${job.rooms.name}` : ''}
          </p>
          {job.booked_date && (
            <p className={`text-xs mt-xs font-semibold ${variant === 'overdue' ? 'text-red-600' : 'text-neutral-500'}`}>
              {variant === 'overdue' ? '⚠️ ' : '📅 '}
              {formatDateUK(job.booked_date)}
              {job.booked_slot ? ` · ${String(job.booked_slot).slice(0, 5)}` : ' · time TBC'}
            </p>
          )}
          {variant === 'schedule' && (
            <p className="text-xs mt-xs text-amber-700 font-semibold">Tap to pick a date</p>
          )}
        </div>
        <div className="flex items-center gap-sm shrink-0">
          {job.priority === 'high' && (
            <span className="text-xs font-bold text-red-600 bg-red-100 px-sm py-xs rounded-full">High</span>
          )}
          {/* Red clock: date booked but time not yet confirmed */}
          {job.booked_date && !job.booked_slot && variant !== 'schedule' && (
            <span title="Time not yet confirmed — tap to set" className="text-base">🕐</span>
          )}
          <span className="text-neutral-400 text-sm">→</span>
        </div>
      </div>
    </Link>
  )
}

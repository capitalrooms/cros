'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import RoleGreeting from '@/app/components/RoleGreeting'
import EnableNotifications from '@/app/components/EnableNotifications'
import { ContractorDashboardSkeleton } from '@/app/components/SkeletonLoading'
import Link from 'next/link'
import { getTodayGMT, isDatePast, isDateToday, isDateFuture, formatDateUK, getDaysUntil } from '@/lib/dateUtils'

interface Job {
  id: string
  title: string
  description?: string
  category?: string
  priority: string
  status:
    | 'reported'
    | 'assigned'
    | 'pending'
    | 'scheduled'
    | 'in_progress'
    | 'contractor_attended'
    | 'awaiting_return'
    | 'completed'
  booked_date?: string
  booked_slot?: string
  property_id: string
  room_id?: string
  properties: { name: string; address: string }
  rooms?: { name: string }
  contractor_id?: string
  completed_at?: string
}

export default function ContractorDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [contractorName, setContractorName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'scheduled' | 'completed'>('all')

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'contractor') {
        router.push('/login')
        return
      }
      setUser(data.user)

      const supabase = createClient()

      // Only jobs the admin has approved AND sent to THIS contractor. Contractors
      // don't browse a shared pool — the admin picks who does each job.
      const contractorId = (data.assignment as any).id

      // Fetch contractor's full name from people table
      const { data: personData } = await supabase
        .from('people')
        .select('full_name')
        .eq('id', contractorId)
        .single()

      if (personData?.full_name) {
        setContractorName(personData.full_name)
      }

      const { data: jobsData } = await supabase
        .from('maintenance_tickets')
        .select('*, properties(name, address), rooms(name)')
        .eq('contractor_id', contractorId)
        .order('booked_date', { ascending: true })

      setJobs(jobsData || [])
      setLoading(false)
    }

    checkAuth()
  }, [router])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  if (loading) {
    return <ContractorDashboardSkeleton />
  }

  // Jobs the admin sent you. "To schedule" still needs a date you pick; "Booked"
  // already has one. Then categorize by date: overdue, today, upcoming.
  const toSchedule = jobs.filter((j) => j.status === 'assigned' && !j.booked_date)
  const bookedWithDate = jobs.filter((j) => j.status === 'assigned' && j.booked_date)

  // Separate booked jobs by date status
  const overdue = bookedWithDate.filter((j) => j.booked_date && isDatePast(j.booked_date))
  const todayJobs = bookedWithDate.filter((j) => j.booked_date && isDateToday(j.booked_date))
  const upcoming = bookedWithDate.filter((j) => j.booked_date && isDateFuture(j.booked_date))

  // "Next job" is TODAY first, then upcoming, then overdue (urgent)
  const nextJob = todayJobs[0] || upcoming[0] || overdue[0]

  const inProgress = jobs.filter((j) =>
    ['in_progress', 'contractor_attended', 'awaiting_return'].includes(j.status)
  )
  const completed = jobs.filter((j) => j.status === 'completed')

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

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Greeting - shared across every role dashboard */}
        {user && (
          <RoleGreeting
            role="Contractor Dashboard"
            name={contractorName || user.user_metadata?.full_name || user.email?.split('@')[0]}
            subtitle="Ready to get some work done"
          />
        )}

        {/* Notifications */}
        <div className="mb-lg">
          <EnableNotifications />
        </div>

        {/* Next Job Hero */}
        {nextJob && (
          <div className="mb-3xl rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-lg overflow-hidden">
            <div className="flex items-start justify-between gap-lg">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-md">
                  Next job
                </p>
                <h2 className="text-2xl font-bold mb-xs">
                  {String(nextJob.category || 'General').replace(/-/g, ' ')}
                </h2>
                <p className="text-lg text-white/80">
                  {nextJob.properties?.name} — {nextJob.rooms?.name || nextJob.title}
                </p>

                <div className="mt-lg grid grid-cols-2 gap-lg">
                  <div>
                    <p className="text-xs text-white/60">When</p>
                    <p className="text-base font-bold mt-xs">
                      {new Date(nextJob.booked_date || '').toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <p className="text-sm text-white/80">{nextJob.booked_slot}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/60">Address</p>
                    <p className="text-base font-bold mt-xs">{nextJob.properties?.address}</p>
                  </div>
                </div>
              </div>
              <Link href={`/contractor/job/${nextJob.id}`}>
                <button className="shrink-0 rounded-xl bg-white text-neutral-900 px-lg py-md font-bold hover:bg-neutral-100">
                  View details →
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="mb-3xl grid gap-lg md:grid-cols-4">
          {/* OVERDUE (if any) - Red/Urgent */}
          {overdue.length > 0 && (
            <button
              onClick={() => scrollToSection('overdue-section')}
              className="rounded-2xl border-2 bg-red-50 border-red-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-red-600">⚠️ Overdue</p>
              <p className="mt-xs text-3xl font-bold text-red-600">{overdue.length}</p>
              <p className="text-xs text-red-600 mt-xs">action needed</p>
            </button>
          )}

          {/* TODAY (if any) */}
          {todayJobs.length > 0 && (
            <button
              onClick={() => scrollToSection('today-section')}
              className="rounded-2xl border-2 bg-blue-50 border-blue-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600">📍 Today</p>
              <p className="mt-xs text-3xl font-bold text-blue-600">{todayJobs.length}</p>
              <p className="text-xs text-blue-600 mt-xs">scheduled for now</p>
            </button>
          )}

          {/* UPCOMING */}
          <button
            onClick={() => scrollToSection('upcoming-section')}
            className="rounded-2xl border-2 bg-white border-neutral-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">📅 Upcoming</p>
            <p className="mt-xs text-3xl font-bold text-neutral-900">{upcoming.length}</p>
            <p className="text-xs text-neutral-600 mt-xs">scheduled ahead</p>
          </button>

          {/* TO SCHEDULE - Red if any */}
          <button
            onClick={() => scrollToSection('to-schedule-section')}
            className={`rounded-2xl border-2 p-lg text-left hover:shadow-md transition-shadow cursor-pointer ${toSchedule.length > 0 ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-neutral-300'}`}
          >
            <p className={`text-xs font-bold uppercase tracking-wide ${toSchedule.length > 0 ? 'text-yellow-600' : 'text-neutral-600'}`}>To schedule</p>
            <p className={`mt-xs text-3xl font-bold ${toSchedule.length > 0 ? 'text-yellow-600' : 'text-neutral-900'}`}>
              {toSchedule.length}
            </p>
            <p className={`text-xs mt-xs ${toSchedule.length > 0 ? 'text-yellow-600' : 'text-neutral-600'}`}>pick a date</p>
          </button>

          {/* IN PROGRESS */}
          <button
            onClick={() => scrollToSection('in-progress-section')}
            className={`rounded-2xl border-2 p-lg text-left hover:shadow-md transition-shadow cursor-pointer ${inProgress.length > 0 ? 'bg-orange-50 border-orange-300' : 'bg-white border-neutral-300'}`}
          >
            <p className={`text-xs font-bold uppercase tracking-wide ${inProgress.length > 0 ? 'text-orange-600' : 'text-neutral-600'}`}>In Progress</p>
            <p className={`mt-xs text-3xl font-bold ${inProgress.length > 0 ? 'text-orange-600' : 'text-neutral-900'}`}>
              {inProgress.length}
            </p>
            <p className={`text-xs mt-xs ${inProgress.length > 0 ? 'text-orange-600' : 'text-neutral-600'}`}>active or return</p>
          </button>

          {/* COMPLETED */}
          <button
            onClick={() => scrollToSection('completed-section')}
            className="rounded-2xl border-2 bg-white border-neutral-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">Completed</p>
            <p className="mt-xs text-3xl font-bold text-neutral-900">
              {completed.length > 0 && <span className="mr-sm">✓</span>}
              {completed.length}
            </p>
            <p className="text-xs text-neutral-600 mt-xs">this month</p>
          </button>
        </div>

        {/* Jobs Sections - Organized by date status */}

        {/* OVERDUE section - Red warning */}
        {overdue.length > 0 && (
          <section className="mb-3xl" id="overdue-section">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-xl font-bold text-red-600">⚠️ Overdue</h2>
              <span className="text-sm text-red-600 font-semibold">{overdue.length} job{overdue.length !== 1 ? 's' : ''} need attention</span>
            </div>
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-md mb-lg">
              <p className="text-sm text-red-700">
                These jobs were scheduled for past dates. Please contact admin to reschedule or mark complete.
              </p>
            </div>
            <div className="space-y-xl">
              {overdue.map((job) => (
                <JobCardDark key={job.id} job={job} overdue daysOverdue={getDaysUntil(job.booked_date || '')} />
              ))}
            </div>
          </section>
        )}

        {/* TODAY section - Blue, high priority */}
        {todayJobs.length > 0 && (
          <section className="mb-3xl" id="today-section">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-xl font-bold text-blue-600">📍 Today</h2>
              <span className="text-sm text-blue-600 font-semibold">{todayJobs.length} scheduled</span>
            </div>
            <div className="space-y-xl">
              {todayJobs.map((job) => (
                <JobCardDark key={job.id} job={job} isToday />
              ))}
            </div>
          </section>
        )}

        {/* UPCOMING section */}
        {upcoming.length > 0 && (
          <section className="mb-3xl" id="upcoming-section">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-xl font-bold">📅 Upcoming</h2>
              <span className="text-sm text-neutral-600 font-semibold">{upcoming.length} scheduled</span>
            </div>
            <div className="space-y-xl">
              {upcoming.map((job) => (
                <JobCardDark key={job.id} job={job} daysAhead={getDaysUntil(job.booked_date || '')} />
              ))}
            </div>
          </section>
        )}

        {/* To schedule section */}
        {toSchedule.length > 0 && (
          <section className="mb-3xl" id="to-schedule-section">
            <h2 className="text-xl font-bold mb-md">🗓️ To schedule</h2>
            <div className="space-y-xl">
              {toSchedule.map((job) => (
                <JobCardDark key={job.id} job={job} />
              ))}
            </div>
          </section>
        )}

        {/* In Progress section */}
        {inProgress.length > 0 && (
          <section className="mb-3xl" id="in-progress-section">
            <h2 className="text-xl font-bold mb-md">🔨 In Progress</h2>
            <div className="space-y-xl">
              {inProgress.map((job) => (
                <JobCardDark key={job.id} job={job} />
              ))}
            </div>
          </section>
        )}

        {/* Completed section */}
        {completed.length > 0 && (
          <section id="completed-section">
            <h2 className="text-xl font-bold mb-md">✅ Completed</h2>
            <div className="space-y-xl">
              {completed.slice(0, 10).map((job) => (
                <JobCardDark key={job.id} job={job} isDone />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function JobCard({ job }: { job: Job }) {
  const statusColors: Record<string, string> = {
    reported: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    pending: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    assigned: 'bg-blue-50 border-blue-200 text-blue-700',
    scheduled: 'bg-blue-50 border-blue-200 text-blue-700',
    in_progress: 'bg-orange-50 border-orange-200 text-orange-700',
    contractor_attended: 'bg-orange-50 border-orange-200 text-orange-700',
    awaiting_return: 'bg-orange-50 border-orange-200 text-orange-700',
    completed: 'bg-green-50 border-green-200 text-green-700',
  }

  const statusLabel: Record<string, string> = {
    reported: 'Available',
    pending: 'Pending',
    assigned: 'Booked',
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    contractor_attended: 'Attended',
    awaiting_return: 'Return Visit',
    completed: 'Completed',
  }

  return (
    <Link href={`/contractor/job/${job.id}`}>
      <div className="rounded-lg border border-neutral-200 p-md hover:border-neutral-900 hover:shadow-md transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-md">
          <div className="flex-1">
            <div className="flex items-center gap-md mb-xs">
              <h4 className="font-bold text-neutral-900">
                {String(job.category || 'General').replace(/-/g, ' ')}
              </h4>
              <span className={`text-xs font-bold px-md py-xs rounded border ${statusColors[job.status]}`}>
                {job.status === 'assigned' && !job.booked_date ? 'To schedule' : statusLabel[job.status]}
              </span>
            </div>
            <p className="text-sm text-neutral-600">{job.title}</p>
            <div className="mt-md flex flex-wrap gap-md text-xs text-neutral-600">
              <span>📍 {job.properties?.name}</span>
              {job.rooms?.name && <span>🚪 {job.rooms.name}</span>}
              {job.booked_date && (
                <span>
                  📅{' '}
                  {new Date(job.booked_date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              )}
              <span
                className={`font-bold ${
                  job.priority === 'high' ? 'text-red-600' : job.priority === 'medium' ? 'text-yellow-600' : 'text-neutral-600'
                }`}
              >
                {job.priority}
              </span>
            </div>
          </div>
          <span className="text-xl">→</span>
        </div>
      </div>
    </Link>
  )
}

function JobCardDark({
  job,
  isDone,
  overdue,
  isToday,
  daysOverdue,
  daysAhead,
}: {
  job: Job
  isDone?: boolean
  overdue?: boolean
  isToday?: boolean
  daysOverdue?: number
  daysAhead?: number
}) {
  const statusLabel: Record<string, string> = {
    reported: 'Available',
    pending: 'Pending',
    assigned: 'Booked',
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    contractor_attended: 'Attended',
    awaiting_return: 'Return Visit',
    completed: 'Completed',
  }

  // Determine card styling based on status
  let cardBg = 'border-neutral-800 bg-neutral-900 text-white hover:border-white'
  if (isDone) {
    cardBg = 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-600'
  } else if (overdue) {
    cardBg = 'border-red-600 bg-red-950 text-red-100 hover:border-red-400'
  } else if (isToday) {
    cardBg = 'border-blue-600 bg-blue-950 text-blue-100 hover:border-blue-400'
  }

  return (
    <Link href={`/contractor/job/${job.id}`}>
      <button className={`flex w-full items-center justify-between gap-md rounded-2xl border p-md text-left transition-colors mb-1 ${cardBg}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">
            {job.properties?.name} — {job.title}
          </p>
          {job.rooms?.name && (
            <p className={`text-xs mt-xs ${overdue ? 'text-red-200' : isToday ? 'text-blue-200' : 'text-neutral-400'}`}>🚪 {job.rooms.name}</p>
          )}
          <p className={`text-xs mt-xs ${overdue ? 'text-red-200' : isToday ? 'text-blue-200' : 'text-neutral-400'}`}>
            {String(job.category || 'General').replace(/-/g, ' ')}
          </p>
          <div className="mt-xs flex flex-wrap gap-sm text-xs">
            {job.booked_date && (
              <span className={overdue ? 'text-red-300' : isToday ? 'text-blue-300' : 'text-neutral-300'}>
                📅 {formatDateUK(job.booked_date)}
              </span>
            )}
            {overdue && daysOverdue && (
              <span className="font-bold text-red-400">
                {Math.abs(daysOverdue)} day{Math.abs(daysOverdue) !== 1 ? 's' : ''} overdue
              </span>
            )}
            {isToday && (
              <span className="font-bold text-blue-400">Today</span>
            )}
            {daysAhead && daysAhead > 0 && (
              <span className={`font-bold ${isToday ? 'text-blue-400' : 'text-neutral-400'}`}>
                in {daysAhead} day{daysAhead !== 1 ? 's' : ''}
              </span>
            )}
            <span
              className={`font-bold ${
                job.priority === 'high' ? (overdue ? 'text-red-300' : isToday ? 'text-blue-300' : 'text-red-400') : job.priority === 'medium' ? (overdue ? 'text-red-200' : isToday ? 'text-blue-200' : 'text-yellow-400') : ''
              }`}
            >
              {job.priority}
            </span>
          </div>
        </div>
        <span className={`shrink-0 text-lg ${isDone ? 'opacity-50' : ''}`}>→</span>
      </button>
    </Link>
  )
}

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string
  value: number
  subtext: string
  color: string
}) {
  return (
    <div className={`rounded-2xl border-2 ${color} p-lg`}>
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">{label}</p>
      <p className="mt-xs text-3xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-600 mt-xs">{subtext}</p>
    </div>
  )
}

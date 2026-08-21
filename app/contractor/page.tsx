'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import EnableNotifications from '@/app/components/EnableNotifications'
import { ContractorDashboardSkeleton } from '@/app/components/SkeletonLoading'
import Link from 'next/link'

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
  // already has one. Then in-progress and completed.
  const toSchedule = jobs.filter((j) => j.status === 'assigned' && !j.booked_date)
  const booked = jobs.filter((j) => j.status === 'assigned' && j.booked_date)
  const inProgress = jobs.filter((j) =>
    ['in_progress', 'contractor_attended', 'awaiting_return'].includes(j.status)
  )
  const completed = jobs.filter((j) => j.status === 'completed')

  const nextJob = booked[0]

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
        {/* Greeting */}
        {user && (
          <div className="mb-3xl">
            <h1 className="text-3xl font-bold text-neutral-900">
              Hello {user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'there'} 👋
            </h1>
            <p className="mt-xs text-neutral-600">Ready to get some work done</p>
          </div>
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
          <button
            onClick={() => scrollToSection('booked-section')}
            className="rounded-2xl border-2 bg-white border-neutral-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">Booked</p>
            <p className="mt-xs text-3xl font-bold text-neutral-900">{booked.length}</p>
            <p className="text-xs text-neutral-600 mt-xs">date set</p>
          </button>

          <button
            onClick={() => scrollToSection('to-schedule-section')}
            className="rounded-2xl border-2 bg-white border-neutral-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">To schedule</p>
            <p className={`mt-xs text-3xl font-bold ${toSchedule.length > 0 ? 'text-red-600' : 'text-neutral-900'}`}>
              {toSchedule.length}
            </p>
            <p className="text-xs text-neutral-600 mt-xs">pick a date</p>
          </button>

          <button
            onClick={() => scrollToSection('in-progress-section')}
            className="rounded-2xl border-2 bg-white border-neutral-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">In Progress</p>
            <p className={`mt-xs text-3xl font-bold ${inProgress.length > 0 ? 'text-red-600' : 'text-neutral-900'}`}>
              {inProgress.length}
            </p>
            <p className="text-xs text-neutral-600 mt-xs">active or return</p>
          </button>

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

        {/* Jobs Sections - Reordered: Booked, To Schedule, In Progress, Completed */}

        {/* Booked section */}
        {booked.length > 0 && (
          <section className="mb-3xl" id="booked-section">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-xl font-bold">📅 Booked</h2>
              {booked.length > 0 && (
                <button
                  className="rounded-lg bg-blue-600 px-md py-sm text-xs font-bold text-white hover:bg-blue-700"
                >
                  📢 Quick Notify
                </button>
              )}
            </div>
            <div className="space-y-lg">
              {booked.map((job) => (
                <JobCardDark key={job.id} job={job} />
              ))}
            </div>
          </section>
        )}

        {/* To schedule section */}
        {toSchedule.length > 0 && (
          <section className="mb-3xl" id="to-schedule-section">
            <h2 className="text-xl font-bold mb-md">🗓️ To schedule</h2>
            <div className="space-y-lg">
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
            <div className="space-y-lg">
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
            <div className="space-y-lg">
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

function JobCardDark({ job, isDone }: { job: Job; isDone?: boolean }) {
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
      <button className={`flex w-full items-center justify-between gap-md rounded-2xl border p-md text-left transition-colors ${
        isDone
          ? 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-600'
          : 'border-neutral-900 bg-neutral-950 text-white hover:border-white'
      }`}>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">
            {String(job.category || 'General').replace(/-/g, ' ')} — {job.properties?.name}
          </p>
          {job.rooms?.name && (
            <p className="text-xs text-neutral-400 mt-xs">🚪 {job.rooms.name}</p>
          )}
          <p className="text-sm mt-xs truncate">{job.title}</p>
          <div className="mt-xs flex flex-wrap gap-sm text-xs">
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
                job.priority === 'high' ? 'text-red-400' : job.priority === 'medium' ? 'text-yellow-400' : ''
              }`}
            >
              {job.priority}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-lg">→</span>
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

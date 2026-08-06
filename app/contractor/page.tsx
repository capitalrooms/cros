'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import { ContractorDashboardSkeleton } from '@/app/components/SkeletonLoading'
import Link from 'next/link'

interface Job {
  id: string
  title: string
  description?: string
  category?: string
  priority: string
  status: 'pending' | 'scheduled' | 'in_progress' | 'contractor_attended' | 'awaiting_return' | 'completed'
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

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'contractor') {
        router.push('/login')
        return
      }
      setUser(data.user)

      const supabase = createClient()

      // Fetch contractor's jobs (assigned to them) + available jobs (released to contractors but not yet assigned)
      const contractorId = (data.assignment as any).id

      const { data: jobsData } = await supabase
        .from('maintenance_tickets')
        .select('*, properties(name, address), rooms(name)')
        .or(`contractor_id.eq.${contractorId},and(approved_at.not.is.null,contractor_id.is.null)`)
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

  const pending = jobs.filter((j) => j.status === 'pending')
  const scheduled = jobs.filter((j) => j.status === 'scheduled')
  const inProgress = jobs.filter((j) => j.status === 'in_progress' || j.status === 'contractor_attended')
  const completed = jobs.filter((j) => j.status === 'completed')
  const awaiting = jobs.filter((j) => j.status === 'awaiting_return')

  const filtered =
    filter === 'all'
      ? jobs
      : filter === 'pending'
      ? [...pending, ...scheduled]
      : filter === 'scheduled'
      ? [...scheduled, ...inProgress]
      : completed

  const nextJob = scheduled.find((j) => j.booked_date)

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
        {/* Header */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Your Work</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Assigned jobs, upcoming visits, and completed work
          </p>
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

        {/* Stats */}
        <div className="mb-3xl grid gap-lg md:grid-cols-4">
          <StatCard
            label="Pending"
            value={pending.length}
            subtext="awaiting approval"
            color="bg-yellow-50 border-yellow-200"
          />
          <StatCard
            label="Scheduled"
            value={scheduled.length}
            subtext="upcoming work"
            color="bg-blue-50 border-blue-200"
          />
          <StatCard
            label="In Progress"
            value={inProgress.length + awaiting.length}
            subtext="active or return"
            color="bg-orange-50 border-orange-200"
          />
          <StatCard
            label="Completed"
            value={completed.length}
            subtext="this month"
            color="bg-green-50 border-green-200"
          />
        </div>

        {/* Jobs by Status */}
        <div className="space-y-lg">
          {/* Pending */}
          {pending.length > 0 && (
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">⏳ Pending Approval</h3>
              <div className="space-y-sm">
                {pending.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          )}

          {/* Scheduled */}
          {scheduled.length > 0 && (
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">📅 Scheduled</h3>
              <div className="space-y-sm">
                {scheduled.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          )}

          {/* In Progress */}
          {(inProgress.length > 0 || awaiting.length > 0) && (
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">🔨 In Progress & Awaiting Return</h3>
              <div className="space-y-sm">
                {[...inProgress, ...awaiting].map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg opacity-75">
              <h3 className="font-bold text-neutral-900 mb-md">✅ Completed</h3>
              <div className="space-y-sm">
                {completed.slice(0, 5).map((job) => (
                  <div key={job.id} className="rounded-lg bg-neutral-50 p-md text-sm">
                    <p className="font-bold text-neutral-900">{job.title}</p>
                    <p className="text-xs text-neutral-600 mt-xs">
                      {job.properties?.name}
                      {job.rooms?.name ? ` · ${job.rooms.name}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function JobCard({ job }: { job: Job }) {
  const statusColors = {
    pending: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    scheduled: 'bg-blue-50 border-blue-200 text-blue-700',
    in_progress: 'bg-orange-50 border-orange-200 text-orange-700',
    contractor_attended: 'bg-orange-50 border-orange-200 text-orange-700',
    awaiting_return: 'bg-orange-50 border-orange-200 text-orange-700',
    completed: 'bg-green-50 border-green-200 text-green-700',
  }

  const statusLabel = {
    pending: 'Pending',
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
                {statusLabel[job.status]}
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

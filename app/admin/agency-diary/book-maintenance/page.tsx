'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface MaintenanceJob {
  id: string
  title: string
  description?: string
  property_id: string
  room_id?: string
  contractor_id?: string
  priority: string
  property: { name: string; address: string }
  room?: { name: string }
  contractor?: { full_name: string }
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  medium: { bg: 'bg-blue-100', text: 'text-blue-700' },
  low: { bg: 'bg-green-100', text: 'text-green-700' },
}

export default function BookMaintenancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<MaintenanceJob[]>([])
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
  const [bookDate, setBookDate] = useState('')
  const [bookTime, setBookTime] = useState('09:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Pre-select job from URL param if provided
  useEffect(() => {
    const jobId = searchParams.get('job')
    if (jobId) {
      setSelectedJobIds(new Set([jobId]))
    }
  }, [searchParams])

  useEffect(() => {
    async function loadJobs() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      try {
        const { data: jobsData } = await supabase
          .from('maintenance_tickets')
          .select('*, properties(name, address), rooms(name), contractor:contractor_id(full_name)')
          .eq('status', 'assigned')
          .is('booked_date', null)
          .order('priority DESC, created_at ASC')

        setJobs((jobsData as any) || [])
        setLoading(false)
      } catch (err) {
        console.error('Error loading jobs:', err)
        setError('Failed to load jobs')
        setLoading(false)
      }
    }

    loadJobs()
  }, [router, supabase])

  const toggleJob = (jobId: string) => {
    const newSelected = new Set(selectedJobIds)
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId)
    } else {
      newSelected.add(jobId)
    }
    setSelectedJobIds(newSelected)
  }

  const handleBook = async () => {
    if (selectedJobIds.size === 0) {
      setError('Please select at least one job')
      return
    }

    if (!bookDate || !bookTime) {
      setError('Please select a date and time')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Update all selected jobs
      const updates = Array.from(selectedJobIds).map((jobId) => {
        const job = jobs.find((j) => j.id === jobId)
        return {
          id: jobId,
          booked_date: bookDate,
          booked_slot: bookTime,
          status: 'scheduled',
        }
      })

      // Batch update
      for (const update of updates) {
        await supabase
          .from('maintenance_tickets')
          .update({
            booked_date: update.booked_date,
            booked_slot: update.booked_slot,
            status: update.status,
          })
          .eq('id', update.id)
      }

      // TODO: Send tenant notifications

      setSaving(false)
      router.push('/admin/agency-diary')
    } catch (err) {
      console.error('Error booking jobs:', err)
      setError('Failed to book jobs. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-100 animate-pulse" />
  }

  const selectedJobs = jobs.filter((j) => selectedJobIds.has(j.id))
  const groupedByContractor = selectedJobs.reduce(
    (acc, job) => {
      const key = job.contractor?.full_name || 'Unassigned'
      if (!acc[key]) acc[key] = []
      acc[key].push(job)
      return acc
    },
    {} as Record<string, MaintenanceJob[]>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50">
      <AppBar />

      <main className="mx-auto max-w-5xl px-lg py-2xl">
        {/* Back Link */}
        <Link
          href="/admin/agency-diary"
          className="inline-flex items-center gap-sm text-blue-600 hover:text-blue-700 font-semibold mb-2xl"
        >
          ← Back to Diary
        </Link>

        {/* Header */}
        <div className="mb-3xl">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent mb-sm">
            🔧 Book Maintenance Job
          </h1>
          <p className="text-base text-slate-600">
            Select approved jobs to schedule. You can book multiple jobs for the same date/time.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-lg p-lg rounded-xl bg-red-100 border border-red-300 text-red-900">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
          {/* Left: Job List */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-white shadow-lg border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-lg py-md text-white font-bold">
                Available Jobs ({jobs.length})
              </div>

              {jobs.length === 0 ? (
                <div className="p-3xl text-center text-slate-500">
                  <div className="text-lg">✓ All approved jobs are booked!</div>
                  <Link href="/admin/agency-diary" className="text-blue-600 hover:underline mt-md inline-block">
                    Back to diary
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {jobs.map((job) => (
                    <label
                      key={job.id}
                      className="flex items-start gap-md p-lg hover:bg-blue-50 cursor-pointer transition-colors border-l-4 border-transparent hover:border-blue-400"
                    >
                      <input
                        type="checkbox"
                        checked={selectedJobIds.has(job.id)}
                        onChange={() => toggleJob(job.id)}
                        className="mt-sm w-5 h-5 rounded cursor-pointer"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900">{job.title}</div>

                        <div className="text-sm text-slate-600 mt-xs space-y-xs">
                          <div>📍 {job.property.name}</div>
                          {job.room && <div>🚪 Room: {job.room.name}</div>}
                          {job.contractor && <div>👤 Assigned to: {job.contractor.full_name}</div>}
                        </div>

                        {job.description && <div className="text-sm text-slate-600 mt-sm">{job.description}</div>}

                        <div className="mt-sm">
                          <span
                            className={`inline-block px-sm py-xs rounded text-xs font-semibold ${
                              PRIORITY_COLORS[job.priority]?.bg
                            } ${PRIORITY_COLORS[job.priority]?.text}`}
                          >
                            {job.priority.charAt(0).toUpperCase() + job.priority.slice(1)} Priority
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Booking Panel */}
          <div>
            <div className="rounded-2xl bg-white shadow-lg border border-slate-200 sticky top-lg">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-lg py-md text-white font-bold rounded-t-2xl">
                Schedule Details
              </div>

              <div className="p-lg space-y-lg">
                {/* Date Input */}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-sm">Date</label>
                  <input
                    type="date"
                    value={bookDate}
                    onChange={(e) => setBookDate(e.target.value)}
                    className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Time Input */}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-sm">Time</label>
                  <input
                    type="time"
                    value={bookTime}
                    onChange={(e) => setBookTime(e.target.value)}
                    className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Selected Jobs Summary */}
                {selectedJobs.length > 0 && (
                  <div className="bg-blue-50 rounded-lg border border-blue-200 p-md">
                    <div className="text-sm font-semibold text-blue-900 mb-md">
                      {selectedJobs.length} Job{selectedJobs.length !== 1 ? 's' : ''} Selected
                    </div>

                    <div className="space-y-sm max-h-32 overflow-y-auto">
                      {Object.entries(groupedByContractor).map(([contractor, contractorJobs]) => (
                        <div key={contractor} className="text-xs">
                          <div className="font-semibold text-blue-900">{contractor}</div>
                          <div className="text-blue-800 ml-md space-y-xs mt-xs">
                            {contractorJobs.map((job) => (
                              <div key={job.id} className="text-xs">
                                • {job.title} ({job.property.name})
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Booking Note */}
                <div className="bg-amber-50 rounded-lg border border-amber-200 p-md text-xs text-amber-900">
                  <strong>Note:</strong> Tenants will be notified about this appointment automatically.
                </div>

                {/* Book Button */}
                <button
                  onClick={handleBook}
                  disabled={selectedJobIds.size === 0 || !bookDate || !bookTime || saving}
                  className="w-full py-md px-lg rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? 'Booking...' : `Book ${selectedJobIds.size} Job${selectedJobIds.size !== 1 ? 's' : ''}`}
                </button>

                {/* Cancel */}
                <Link
                  href="/admin/agency-diary"
                  className="block w-full py-md px-lg rounded-lg bg-slate-200 text-slate-900 font-bold text-center hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

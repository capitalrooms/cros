'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface CleanJob {
  id: string
  property_id: string
  cleaner_id?: string
  status: string
  property: { name: string; address: string }
  cleaner?: { full_name: string }
}

export default function BookCleanPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<CleanJob[]>([])
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
  const [bookDate, setBookDate] = useState('')
  const [bookTime, setBookTime] = useState('09:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadJobs() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      try {
        const { data: jobsData } = await supabase
          .from('cleans')
          .select('*, properties(name, address), cleaner:cleaner_id(full_name)')
          .is('clean_date', null)
          .order('created_at ASC')

        setJobs((jobsData as any) || [])
        setLoading(false)
      } catch (err) {
        console.error('Error loading clean jobs:', err)
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
      setError('Please select at least one clean job')
      return
    }

    if (!bookDate || !bookTime) {
      setError('Please select a date and time')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Update all selected cleans
      for (const jobId of selectedJobIds) {
        await supabase
          .from('cleans')
          .update({
            clean_date: bookDate,
            clean_time: bookTime,
            status: 'scheduled',
          })
          .eq('id', jobId)
      }

      setSaving(false)
      router.push('/admin/agency-diary')
    } catch (err) {
      console.error('Error booking cleans:', err)
      setError('Failed to book cleans. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-100 animate-pulse" />
  }

  const selectedJobs = jobs.filter((j) => selectedJobIds.has(j.id))

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar />

      <main className="mx-auto max-w-5xl px-lg py-2xl">
        <Link
          href="/admin/agency-diary"
          className="inline-flex items-center gap-sm text-neutral-600 hover:text-neutral-900 font-medium mb-3xl transition-colors"
        >
          ← Back to Diary
        </Link>

        {/* Header — Balanced Spacing */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900 mb-md">
            🧹 Book Cleaner
          </h1>
          <p className="text-base text-neutral-600">Select cleaning jobs to schedule.</p>
        </div>

        {error && (
          <div className="mb-lg p-lg rounded-xl bg-red-100 border border-red-300 text-red-900">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
          <div className="lg:col-span-2">
            <div className="rounded-lg bg-white shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-900 px-lg py-md text-white font-semibold text-sm">
                Available Cleaning Jobs ({jobs.length})
              </div>

              {jobs.length === 0 ? (
                <div className="p-3xl text-center text-neutral-600">
                  <div className="text-lg">✓ No pending cleaning jobs!</div>
                </div>
              ) : (
                <div className="divide-y divide-neutral-200">
                  {jobs.map((job) => (
                    <label
                      key={job.id}
                      className="flex items-start gap-md p-lg hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedJobIds.has(job.id)}
                        onChange={() => toggleJob(job.id)}
                        className="mt-sm w-5 h-5 rounded cursor-pointer"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-neutral-900">Cleaning Service</div>
                        <div className="text-sm text-slate-600 mt-xs">📍 {job.property.name}</div>
                        {job.cleaner && <div className="text-sm text-slate-600">👤 Assigned to: {job.cleaner.full_name}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="rounded-lg bg-white shadow-sm border border-neutral-200 sticky top-lg">
              <div className="bg-neutral-900 px-lg py-md text-white font-semibold text-sm rounded-t-lg">
                Schedule Details
              </div>

              <div className="p-lg space-y-lg">
                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-sm">Date</label>
                  <input
                    type="date"
                    value={bookDate}
                    onChange={(e) => setBookDate(e.target.value)}
                    className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-sm">Time</label>
                  <input
                    type="time"
                    value={bookTime}
                    onChange={(e) => setBookTime(e.target.value)}
                    className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {selectedJobs.length > 0 && (
                  <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-md text-xs text-neutral-900">
                    <strong>{selectedJobs.length}</strong> job{selectedJobs.length !== 1 ? 's' : ''} selected
                  </div>
                )}

                <button
                  onClick={handleBook}
                  disabled={selectedJobIds.size === 0 || !bookDate || !bookTime || saving}
                  className="w-full py-md px-lg rounded-lg bg-gradient-to-r neutral-900 text-white font-bold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? 'Booking...' : `Book Clean`}
                </button>

                <Link
                  href="/admin/agency-diary"
                  className="block w-full py-md px-lg rounded-lg bg-neutral-200 text-neutral-900 font-bold text-center hover:bg-neutral-300 transition-colors"
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

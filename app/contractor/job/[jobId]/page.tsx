'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter, useParams } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

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
  location?: string
}

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [jobStatus, setJobStatus] = useState('')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'contractor') {
        router.push('/login')
        return
      }

      const supabase = createClient()
      const { data: jobData } = await supabase
        .from('maintenance_tickets')
        .select('*, properties(name, address), rooms(name)')
        .eq('id', jobId)
        .single()

      if (jobData) {
        setJob(jobData)
        setJobStatus(jobData.status)
        setNotes(jobData.notes || '')
      }
      setLoading(false)
    }
    init()
  }, [jobId, router])

  async function handleUpdateJob() {
    if (!job) return
    setSaving(true)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('maintenance_tickets')
        .update({ status: jobStatus, notes })
        .eq('id', jobId)

      if (error) throw error

      alert('✅ Job updated')

      // Trigger completion notification if marked complete
      if (jobStatus === 'completed') {
        await fetch('/api/notify-job-completed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: jobId }),
        })
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) { return <GenericPageSkeleton /> }
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <p className="p-xl text-sm text-neutral-400">Job not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        {/* Header */}
        <Link href="/contractor">
          <button className="text-sm font-bold text-neutral-600 hover:text-neutral-900 mb-lg">
            ← Back to jobs
          </button>
        </Link>

        <div className="rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-lg overflow-hidden mb-lg">
          <div className="flex items-start justify-between gap-lg">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-md">
                {String(job.category || 'General').replace(/-/g, ' ')}
              </p>
              <h1 className="text-3xl font-bold mb-lg">{job.title}</h1>

              <div className="grid grid-cols-2 gap-lg">
                <div>
                  <p className="text-xs text-white/60">Property</p>
                  <p className="text-base font-bold mt-xs">{job.properties?.name}</p>
                  <p className="text-sm text-white/80">{job.properties?.address}</p>
                </div>
                {job.rooms?.name && (
                  <div>
                    <p className="text-xs text-white/60">Room</p>
                    <p className="text-base font-bold mt-xs">{job.rooms.name}</p>
                  </div>
                )}
                {job.booked_date && (
                  <div>
                    <p className="text-xs text-white/60">Scheduled</p>
                    <p className="text-base font-bold mt-xs">
                      {new Date(job.booked_date).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <p className="text-sm text-white/80">{job.booked_slot}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-lg md:grid-cols-3">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-lg">
            {/* Description */}
            {job.description && (
              <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
                <h3 className="font-bold text-neutral-900 mb-md">Details</h3>
                <p className="text-sm text-neutral-700 whitespace-pre-wrap">{job.description}</p>
              </div>
            )}

            {/* Notes */}
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Your Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about the work done, any issues, recommendations..."
                rows={6}
                className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <p className="text-xs text-neutral-500 mt-md">
                These notes will be visible to the property manager and tenant
              </p>
            </div>

            {/* Status */}
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Job Status</h3>
              <select
                value={jobStatus}
                onChange={(e) => setJobStatus(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="in_progress">🔨 In Progress</option>
                <option value="contractor_attended">✓ Attended (awaiting tenant approval)</option>
                <option value="awaiting_return">↩️ Awaiting Return Visit</option>
                <option value="completed">✅ Completed</option>
              </select>
              <p className="text-xs text-neutral-500 mt-md">
                Update the status as you progress through the work
              </p>
            </div>

            {/* Save Button */}
            <button
              onClick={handleUpdateJob}
              disabled={saving}
              className="w-full rounded-lg bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : '💾 Save Updates'}
            </button>
          </div>

          {/* Sidebar */}
          <div>
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg sticky top-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Quick Info</h3>

              <div className="space-y-md pb-md border-b border-neutral-200">
                <div>
                  <p className="text-xs text-neutral-600 uppercase">Priority</p>
                  <p className={`text-base font-bold mt-xs ${
                    job.priority === 'high' ? 'text-red-600' :
                    job.priority === 'medium' ? 'text-yellow-600' :
                    'text-neutral-600'
                  }`}>
                    {String(job.priority).charAt(0).toUpperCase() + String(job.priority).slice(1)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-neutral-600 uppercase">Current Status</p>
                  <p className="text-base font-bold mt-xs capitalize">
                    {String(job.status).replace(/_/g, ' ')}
                  </p>
                </div>
              </div>

              <div className="pt-md text-xs text-neutral-500">
                <p>Job ID: {jobId.slice(0, 8)}...</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

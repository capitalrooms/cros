'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { displayName } from '@/lib/people'

interface CleanerJob {
  id: string
  cleaner_id: string
  property_id: string
  room_id: string | null
  task_type: 'normal' | 'urgent' | 'asap'
  status: 'pending' | 'accepted' | 'completed' | 'declined'
  notes: string | null
  due_date: string | null
  created_at: string
  properties?: { id: string; name: string; address: string } | null
  rooms?: { id: string; name: string } | null
}

interface Cleaner {
  id: string
  name: string
  email?: string
}

type StatusFilter = 'all' | 'pending' | 'accepted' | 'completed' | 'declined'

const TASK_TYPE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  asap:    { label: '🚨 ASAP',   bg: 'bg-red-100',   text: 'text-red-800' },
  urgent:  { label: '⚠️ Urgent', bg: 'bg-amber-100', text: 'text-amber-800' },
  normal:  { label: '📌 Normal', bg: 'bg-neutral-100', text: 'text-neutral-700' },
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  pending:  { label: 'Pending',  bg: 'bg-amber-100',  text: 'text-amber-800' },
  accepted: { label: 'Accepted', bg: 'bg-green-100',  text: 'text-green-800' },
  declined: { label: 'Declined', bg: 'bg-red-100',    text: 'text-red-800' },
  completed:{ label: 'Done ✓',  bg: 'bg-neutral-100', text: 'text-neutral-600' },
}

export default function CleanerJobsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<CleanerJob[]>([])
  const [cleaners, setCleaners] = useState<Cleaner[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Reassign modal state
  const [reassigning, setReassigning] = useState<string | null>(null)
  const [reassignCleanerId, setReassignCleanerId] = useState('')
  const [savingReassign, setSavingReassign] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin'].includes(data.assignment?.role || '')) {
        router.push('/login')
        return
      }
      await loadData()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadData() {
    // Load all jobs via service-route API
    const res = await fetch('/api/admin/jobs/cleaner?status=all')
    if (res.ok) {
      const json = await res.json()
      setJobs(json.jobs || [])
    }

    // Load cleaners for reassign dropdown
    const { data: cleanersData } = await supabase
      .from('people')
      .select('id, full_name, first_name, last_name, email')
      .eq('role', 'cleaner')
      .order('full_name')
    setCleaners((cleanersData || []).map((c: any) => ({ id: c.id, name: displayName(c), email: c.email })))
  }

  async function handleReassign(jobId: string) {
    if (!reassignCleanerId) return
    setSavingReassign(true)
    try {
      const res = await fetch(`/api/admin/jobs/cleaner/${jobId}/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleanerId: reassignCleanerId }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error || 'Failed to reassign')
      }
      setMessage({ type: 'success', text: 'Job reassigned successfully. The cleaner will see it as a new pending assignment.' })
      setReassigning(null)
      setReassignCleanerId('')
      await loadData()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error reassigning' })
    } finally {
      setSavingReassign(false)
    }
  }

  const filtered       = jobs.filter(j => statusFilter === 'all' || j.status === statusFilter)
  const declinedCount  = jobs.filter(j => j.status === 'declined').length
  const unassignedCount = jobs.filter(j => j.status === 'pending' && !j.cleaner_id).length
  const pendingCount   = jobs.filter(j => j.status === 'pending').length

  const formatDate = (d: string | null) => {
    if (!d) return null
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-2xl">
          <h1 className="text-2xl font-bold text-neutral-900">🧹 Cleaner Jobs</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Move-out cleans raised from Set on Notice — assign, track and reassign
          </p>
        </div>

        {/* Alert banner for unassigned jobs */}
        {unassignedCount > 0 && (
          <div className="mb-lg rounded-xl border border-amber-300 bg-amber-50 p-md flex items-start gap-md">
            <span className="text-xl">👤</span>
            <div className="flex-1">
              <p className="font-bold text-amber-900">
                {unassignedCount} job{unassignedCount !== 1 ? 's' : ''} need a cleaner assigned
              </p>
              <p className="text-sm text-amber-700 mt-xs">
                Click "Assign" on each job to pick a cleaner.
              </p>
            </div>
          </div>
        )}

        {/* Alert banner for declined jobs */}
        {declinedCount > 0 && (
          <div className="mb-lg rounded-xl border border-red-300 bg-red-50 p-md flex items-start gap-md">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="font-bold text-red-900">
                {declinedCount} job{declinedCount !== 1 ? 's' : ''} declined — need reassigning
              </p>
              <p className="text-sm text-red-700 mt-xs">
                A cleaner declined. Click "Reassign" on the job to assign a different cleaner.
              </p>
            </div>
            <button
              onClick={() => setStatusFilter('declined')}
              className="shrink-0 rounded-lg bg-red-700 px-md py-sm text-xs font-bold text-white hover:bg-red-800"
            >
              View declined
            </button>
          </div>
        )}

        {message && (
          <div className={`mb-lg p-md rounded-lg border ${message.type === 'success' ? 'bg-green-50 border-green-300 text-green-900' : 'bg-red-50 border-red-300 text-red-900'}`}>
            {message.text}
          </div>
        )}

        {/* Status filter tabs */}
        <div className="mb-lg flex gap-xs flex-wrap">
          {([
            { key: 'all',       label: `All (${jobs.length})` },
            { key: 'pending',   label: `Pending (${pendingCount})` },
            { key: 'accepted',  label: `Accepted (${jobs.filter(j => j.status === 'accepted').length})` },
            { key: 'completed', label: `Completed (${jobs.filter(j => j.status === 'completed').length})` },
            { key: 'declined',  label: `Declined (${declinedCount})` },
          ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded-full px-lg py-sm text-sm font-bold transition-all ${
                statusFilter === key
                  ? 'bg-neutral-950 text-white'
                  : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Jobs list */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No {statusFilter !== 'all' ? statusFilter : ''} jobs</p>
          </div>
        ) : (
          <div className="space-y-md">
            {filtered.map(job => {
              const taskStyle    = TASK_TYPE_LABELS[job.task_type] || TASK_TYPE_LABELS.normal
              const statusStyle = STATUS_LABELS[job.status]     || STATUS_LABELS.pending
              const cleanerObj  = cleaners.find(c => c.id === job.cleaner_id)
              const cleanerLabel = cleanerObj?.name || null  // null = unassigned
              const isUnassigned = !job.cleaner_id

              return (
                <div
                  key={job.id}
                  className={`rounded-xl border p-md bg-white ${
                    job.status === 'declined' ? 'border-red-200' : 'border-neutral-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0 flex-1">
                      {/* Property + room */}
                      <div className="flex flex-wrap items-center gap-xs mb-xs">
                        <p className="font-bold text-neutral-900">
                          {job.properties?.name || 'Unknown property'}
                        </p>
                        {job.rooms?.name && (
                          <span className="text-sm text-neutral-500">· {job.rooms.name}</span>
                        )}
                      </div>

                      {/* Cleaner + date */}
                      <p className={`text-sm ${isUnassigned ? 'text-amber-700 font-semibold' : 'text-neutral-600'}`}>
                        👤 {isUnassigned ? '⚠️ No cleaner assigned' : cleanerLabel}
                        {job.due_date && ` · Due ${formatDate(job.due_date)}`}
                      </p>

                      {/* Notes */}
                      {job.notes && (
                        <p className="text-sm text-neutral-500 mt-xs italic">{job.notes}</p>
                      )}

                      {/* Created */}
                      <p className="text-xs text-neutral-400 mt-xs">
                        Raised {formatDate(job.created_at.slice(0, 10))}
                      </p>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-xs">
                      <span className={`rounded-full px-sm py-xs text-xs font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                      </span>
                      <span className={`rounded-full px-sm py-xs text-xs font-bold ${taskStyle.bg} ${taskStyle.text}`}>
                        {taskStyle.label}
                      </span>
                      {(job.status === 'declined' || job.status === 'pending') && (
                        <button
                          onClick={() => { setReassigning(job.id); setReassignCleanerId('') }}
                          className={`mt-xs rounded-lg border px-md py-xs text-xs font-bold hover:opacity-90 transition-opacity ${
                            isUnassigned
                              ? 'border-amber-400 bg-amber-100 text-amber-900'
                              : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {isUnassigned ? '+ Assign cleaner' : 'Reassign'}
                        </button>
                      )}
                      {job.properties?.id && (
                        <Link
                          href={`/admin/properties/${job.properties.id}`}
                          className="text-xs text-neutral-400 underline hover:text-neutral-700"
                        >
                          View property
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Reassign modal */}
      {reassigning && (() => {
        const targetJob = jobs.find(j => j.id === reassigning)
        const isAssigning = !targetJob?.cleaner_id
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
          <div className="w-full max-w-sm rounded-3xl bg-white p-lg">
            <h2 className="text-xl font-bold text-neutral-900 mb-xs">
              {isAssigning ? 'Assign a cleaner' : 'Reassign to cleaner'}
            </h2>
            <p className="text-sm text-neutral-500 mb-md">
              {isAssigning
                ? 'Pick a cleaner — they will see this job as a new pending assignment.'
                : 'The job will be reset to Pending so the new cleaner can accept or decline.'}
            </p>
            <div className="space-y-md">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Select cleaner</label>
                <select
                  value={reassignCleanerId}
                  onChange={e => setReassignCleanerId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                >
                  <option value="">— choose —</option>
                  {cleaners.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-sm">
                <button
                  onClick={() => handleReassign(reassigning)}
                  disabled={!reassignCleanerId || savingReassign}
                  className="flex-1 rounded-xl bg-neutral-950 py-sm font-bold text-white disabled:opacity-40 hover:bg-neutral-800 transition-colors"
                >
                  {savingReassign
                    ? (isAssigning ? 'Assigning…' : 'Reassigning…')
                    : (isAssigning ? 'Assign' : 'Reassign')}
                </button>
                <button
                  onClick={() => { setReassigning(null); setReassignCleanerId('') }}
                  className="flex-1 rounded-xl border border-neutral-300 py-sm font-semibold text-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

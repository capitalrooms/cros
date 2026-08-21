'use client'

import { useEffect, useRef, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter, useParams } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { TIME_SLOTS, earliestBookableDate, slotLabel } from '@/lib/booking'
import AppBar from '@/components/AppBar'
import JobCompletion from '@/app/components/JobCompletion'
import CleanerQuickNotifyModal from '@/app/components/CleanerQuickNotifyModal'
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
  arrived_at?: string | null
  before_photo?: string | null
  after_photo?: string | null
  admin_note?: string | null
  notes?: string | null
  property_id: string
  room_id?: string
  properties: { name: string; address: string; lat: number | null; lng: number | null }
  rooms?: { name: string }
  location?: string
}

/** Metres between two lat/lng points. */
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [bookDate, setBookDate] = useState('')
  const [bookSlot, setBookSlot] = useState('')
  const [busy, setBusy] = useState('')
  const [showCompletion, setShowCompletion] = useState(false)
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)
  const [accessLog, setAccessLog] = useState<string[]>([])
  const [showQuickNotify, setShowQuickNotify] = useState(false)

  const beforeInput = useRef<HTMLInputElement>(null)
  const afterInput = useRef<HTMLInputElement>(null)

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
        .select('*, properties(name, address, lat, lng), rooms(name)')
        .eq('id', jobId)
        .single()
      if (jobData) {
        setJob(jobData as any)
        setNotes((jobData as any).notes || '')
        setBookDate((jobData as any).booked_date || '')
        setBookSlot((jobData as any).booked_slot || '')
      }
      setLoading(false)
    }
    init()
  }, [jobId, router])

  async function patch(fields: Record<string, any>) {
    const supabase = createClient()
    const { error } = await supabase.from('maintenance_tickets').update(fields).eq('id', jobId)
    if (error) throw error
    setJob((j) => (j ? { ...j, ...fields } : j))
  }

  function notify(endpoint: string) {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: jobId }),
    }).catch(() => {})
  }

  // Push every current tenant at this property.
  function pushTenants(body: string) {
    if (!job) return
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: job.property_id, title: 'Capital Rooms', body, url: '/tenant' }),
    }).catch(() => {})
  }

  async function handleBook() {
    if (!job || !bookDate || !bookSlot) return
    setBusy('book')
    try {
      await patch({ booked_date: bookDate, booked_slot: bookSlot, status: 'assigned' })
      notify('/api/notify-booking')
      pushTenants(
        `A repair is booked at your property for ${new Date(bookDate).toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })}, ${slotLabel(bookSlot)}.`
      )
      alert('✅ Visit booked — the tenants have been notified.')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setBusy('')
    }
  }

  async function handleArrive() {
    if (!job) return
    setBusy('arrive')
    const finish = async () => {
      try {
        await patch({ arrived_at: new Date().toISOString() })
        notify('/api/notify-booking')
        pushTenants('Your contractor has arrived at the property.')
        alert('✅ Marked as arrived — the tenants have been told you’re here.')
      } catch (err) {
        alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
      } finally {
        setBusy('')
      }
    }
    const { lat, lng } = job.properties || ({} as any)
    if (lat == null || lng == null || !navigator.geolocation) {
      await finish()
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const dist = metresBetween(pos.coords.latitude, pos.coords.longitude, lat, lng)
        if (dist > 150) {
          if (
            !window.confirm(
              `You appear to be about ${Math.round(dist)}m from ${job.properties.name}. ` +
                `Only mark arrived if you're actually on site. Continue anyway?`
            )
          ) {
            setBusy('')
            return
          }
        }
        await finish()
      },
      () => {
        if (window.confirm('Could not read your location. Mark arrived without the check?')) finish()
        else setBusy('')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function uploadPhoto(file: File, kind: 'before' | 'after') {
    const supabase = createClient()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${jobId}/${kind}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('job-photos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) throw upErr
    return supabase.storage.from('job-photos').getPublicUrl(path).data.publicUrl
  }

  async function handleBeforePhoto(file: File) {
    setBusy('before')
    try {
      const url = await uploadPhoto(file, 'before')
      await patch({ before_photo: url, status: 'in_progress' })
      notify('/api/notify-booking')
      pushTenants('Work has started on a repair at your property.')
      alert('✅ Work started — before photo saved and the tenants have been updated.')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setBusy('')
    }
  }

  async function handleAfterPhoto(file: File) {
    setBusy('after')
    try {
      const url = await uploadPhoto(file, 'after')
      await patch({ after_photo: url })
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setBusy('')
    }
  }

  async function handleComplete() {
    if (!job) return
    // Allow completion with notes if no after-photo (for retroactive completion)
    if (!job.after_photo && !notes.trim()) {
      alert('Add either an after photo OR notes to complete this job.')
      return
    }
    if (job.admin_note) {
      if (!window.confirm(`Before you finish — did you sort this?\n\n”${job.admin_note}”`)) return
    }
    setBusy('complete')
    try {
      await patch({ status: 'completed', completed_at: new Date().toISOString() })

      // Get notification details
      const res = await fetch('/api/notify-job-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: jobId }),
      })

      if (res.ok) {
        const data = await res.json()
        const summary = data.notificationSummary

        // Build notification message
        let msg = '✅ Job completed\n\n'
        if (summary.adminNotified) msg += `📧 Property manager notified\n`
        if (summary.tenantInRoomNotified) msg += `📧 Tenant notified of repair completion\n`
        if (summary.otherTenantsNotified > 0) msg += `📧 ${summary.otherTenantsNotified} other tenant(s) notified\n`
        if (summary.total === 0) msg += `⚠️ No notifications sent (check notification preferences)\n`

        setCompletionMessage(msg.trim())
        alert(msg.trim())
      } else {
        alert('✅ Job completed — notification status unknown')
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setBusy('')
    }
  }

  async function saveNotes() {
    setSavingNotes(true)
    try {
      await patch({ notes })
      alert('✅ Notes saved')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingNotes(false)
    }
  }

  if (loading) return <GenericPageSkeleton />
  if (!job) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar right={<Link href="/contractor" className="min-w-0 truncate font-semibold text-white hover:text-white/80">← Jobs</Link>} />
        <p className="p-xl text-sm text-neutral-400">Job not found</p>
      </div>
    )
  }

  const isBooked = !!job.booked_date
  const hasArrived = !!job.arrived_at
  const isDone = job.status === 'completed'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/contractor" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Jobs</Link>} />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-lg overflow-hidden mb-lg">
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
                <p className="text-xs text-white/60">Booked</p>
                <p className="text-base font-bold mt-xs">
                  {new Date(job.booked_date).toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })}
                </p>
                <p className="text-sm text-white/80">{slotLabel(job.booked_slot)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Notify Button */}
        {isBooked && (
          <div className="mb-lg">
            <button
              onClick={() => setShowQuickNotify(true)}
              className="w-full px-lg py-md font-semibold text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition border border-blue-500"
            >
              📢 Quick Notify Tenants
            </button>
          </div>
        )}

        {/* Admin "before you go" note */}
        {job.admin_note && (
          <div className="mb-lg rounded-2xl border-2 border-yellow-400 bg-yellow-50 p-lg">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-800">
              Note from the office — before you go
            </p>
            <p className="mt-xs text-sm font-semibold text-yellow-900">{job.admin_note}</p>
          </div>
        )}

        <div className="grid gap-lg md:grid-cols-3">
          <div className="md:col-span-2 space-y-lg">
            {/* Description */}
            {job.description && (
              <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
                <h3 className="font-bold text-neutral-900 mb-md">Details</h3>
                <p className="text-sm text-neutral-700 whitespace-pre-wrap">{job.description}</p>
              </div>
            )}

            {/* ---- Guided lifecycle ---- */}
            {isDone ? (
              <>
                <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-lg">
                  <h3 className="font-bold text-green-800">✅ Completed</h3>
                  <p className="mt-xs text-sm text-green-700">This job is done and everyone’s been notified.</p>
                </div>
                {completionMessage && (
                  <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-lg">
                    <h3 className="font-bold text-blue-900 mb-md">Notifications Sent</h3>
                    <p className="text-sm text-blue-800 whitespace-pre-wrap">{completionMessage}</p>
                  </div>
                )}
              </>
            ) : !isBooked ? (
              /* Step 1: pick a date */
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-lg">
                <h3 className="font-bold text-neutral-900 mb-xs">Book your visit</h3>
                <p className="text-xs text-neutral-500 mb-md">
                  {job.rooms?.name
                    ? 'Bedroom access needs 24 hours notice so the tenant can arrange access.'
                    : 'Communal area — reachable via the key safe, can be booked for today.'}
                </p>
                <div className="grid gap-md sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-xs">Date</label>
                    <input type="date" value={bookDate}
                      min={earliestBookableDate(job.location ?? job.rooms?.name, job.priority)}
                      onChange={(e) => setBookDate(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-xs">Time slot</label>
                    <select value={bookSlot} onChange={(e) => setBookSlot(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900">
                      <option value="">Select slot…</option>
                      {TIME_SLOTS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                    </select>
                  </div>
                </div>
                <button onClick={handleBook} disabled={busy === 'book' || !bookDate || !bookSlot}
                  className="mt-md w-full rounded-lg bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 disabled:opacity-40">
                  {busy === 'book' ? 'Booking…' : '📅 Book this visit'}
                </button>
              </div>
            ) : !hasArrived ? (
              /* Step 2: arrive */
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-lg text-center">
                <h3 className="font-bold text-neutral-900">On your way?</h3>
                <p className="mt-xs text-sm text-neutral-500">
                  Tap this when you get there — we’ll check your location and let the tenants know you’ve arrived.
                </p>
                <button onClick={handleArrive} disabled={busy === 'arrive'}
                  className="mt-md w-full rounded-lg bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 disabled:opacity-40">
                  {busy === 'arrive' ? 'Checking location…' : '📍 I’ve arrived'}
                </button>
              </div>
            ) : (
              /* Step 3+: on site — before / after photos */
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-lg space-y-lg">
                <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                  ✓ Arrived {new Date(job.arrived_at!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>

                {/* Access Log - Courtesy check-in */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-md">
                  <h3 className="font-bold text-neutral-900 text-sm mb-md">Before entering, please log:</h3>
                  <div className="space-y-sm">
                    <button
                      onClick={() => {
                        if (!accessLog.includes('doorbell')) {
                          setAccessLog([...accessLog, 'doorbell'])
                          fetch('/api/maintenance/log-access', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ticketId: jobId, action: 'doorbell' }),
                          }).catch(() => {})
                        }
                      }}
                      disabled={accessLog.includes('doorbell')}
                      className={`w-full text-left px-md py-sm rounded-lg font-semibold text-sm transition-colors ${
                        accessLog.includes('doorbell')
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      {accessLog.includes('doorbell') ? '✓ Rang doorbell' : '🔔 Rang doorbell'}
                    </button>
                    <button
                      onClick={() => {
                        if (!accessLog.includes('knock')) {
                          setAccessLog([...accessLog, 'knock'])
                          fetch('/api/maintenance/log-access', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ticketId: jobId, action: 'knock' }),
                          }).catch(() => {})
                        }
                      }}
                      disabled={accessLog.includes('knock')}
                      className={`w-full text-left px-md py-sm rounded-lg font-semibold text-sm transition-colors ${
                        accessLog.includes('knock')
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      {accessLog.includes('knock') ? '✓ Knocked on door' : '🚪 Knocked on door'}
                    </button>
                    <button
                      onClick={() => {
                        if (!accessLog.includes('announced')) {
                          setAccessLog([...accessLog, 'announced'])
                          fetch('/api/maintenance/log-access', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ticketId: jobId, action: 'announced' }),
                          }).catch(() => {})
                        }
                      }}
                      disabled={accessLog.includes('announced')}
                      className={`w-full text-left px-md py-sm rounded-lg font-semibold text-sm transition-colors ${
                        accessLog.includes('announced')
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      {accessLog.includes('announced') ? '✓ Announced arrival' : '📢 Announced arrival'}
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-sm">Tenants appreciate the courtesy — this log is shown to them</p>
                </div>

                {/* Before */}
                <div>
                  <h3 className="font-bold text-neutral-900">1 · Before photo</h3>
                  <p className="text-xs text-neutral-500 mb-md">Snap the problem — this marks the job as in progress.</p>
                  {job.before_photo ? (
                    <img src={job.before_photo} alt="before" className="w-full max-w-xs rounded-lg border border-neutral-200" />
                  ) : (
                    <button onClick={() => beforeInput.current?.click()} disabled={busy === 'before'}
                      className="w-full rounded-lg border-2 border-dashed border-neutral-400 py-lg text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                      {busy === 'before' ? 'Uploading…' : '📷 Take before photo'}
                    </button>
                  )}
                  <input ref={beforeInput} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleBeforePhoto(e.target.files[0])} />
                </div>

                {/* After */}
                <div className={job.before_photo ? '' : 'opacity-40 pointer-events-none'}>
                  <h3 className="font-bold text-neutral-900">2 · After photo</h3>
                  <p className="text-xs text-neutral-500 mb-md">Show the finished work — required before you can complete.</p>
                  {job.after_photo ? (
                    <img src={job.after_photo} alt="after" className="w-full max-w-xs rounded-lg border border-neutral-200" />
                  ) : (
                    <button onClick={() => afterInput.current?.click()} disabled={busy === 'after'}
                      className="w-full rounded-lg border-2 border-dashed border-neutral-400 py-lg text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                      {busy === 'after' ? 'Uploading…' : '📷 Take after photo'}
                    </button>
                  )}
                  <input ref={afterInput} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleAfterPhoto(e.target.files[0])} />
                </div>

                {/* Complete */}
                <button onClick={handleComplete} disabled={busy === 'complete' || (!job.after_photo && !notes.trim())}
                  className="w-full rounded-lg bg-green-700 text-white font-bold py-md hover:bg-green-800 disabled:opacity-40">
                  {busy === 'complete' ? 'Completing…' : '✅ Mark job complete'}
                </button>
                {!job.after_photo && !notes.trim() && (
                  <p className="text-center text-xs text-neutral-400">Add a photo or notes to complete this job.</p>
                )}
                {!job.after_photo && notes.trim() && (
                  <p className="text-center text-xs text-green-600">✅ Ready to complete (notes provided)</p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Your notes</h3>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
                placeholder="Work done, parts used, anything to flag…"
                className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              <button onClick={saveNotes} disabled={savingNotes}
                className="mt-md w-full rounded-lg border border-neutral-400 py-md text-sm font-bold text-neutral-900 disabled:opacity-40">
                {savingNotes ? 'Saving…' : 'Save notes'}
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg sticky top-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Quick info</h3>
              <div className="space-y-md pb-md border-b border-neutral-200">
                <div>
                  <p className="text-xs text-neutral-600 uppercase">Priority</p>
                  <p className={`text-base font-bold mt-xs ${
                    job.priority === 'high' ? 'text-red-600' : job.priority === 'medium' ? 'text-yellow-600' : 'text-neutral-600'
                  }`}>
                    {String(job.priority).charAt(0).toUpperCase() + String(job.priority).slice(1)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-600 uppercase">Status</p>
                  <p className="text-base font-bold mt-xs capitalize">{String(job.status).replace(/_/g, ' ')}</p>
                </div>
              </div>
              <p className="pt-md text-xs text-neutral-500">Job ID: {jobId.slice(0, 8)}…</p>
            </div>
          </div>
        </div>

        {/* Quick Notify Modal */}
        {showQuickNotify && job && (
          <CleanerQuickNotifyModal
            propertyId={job.property_id}
            propertyName={job.properties?.name || 'Property'}
            onClose={() => setShowQuickNotify(false)}
          />
        )}
      </main>
    </div>
  )
}

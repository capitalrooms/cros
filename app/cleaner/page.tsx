'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import RoleGreeting from '@/app/components/RoleGreeting'
import BackButton from '@/app/components/BackButton'
import EnableNotifications from '@/app/components/EnableNotifications'
import StaffQuickNotifyModal from '@/app/components/StaffQuickNotifyModal'
import ThreeDayCalendar from '@/app/components/ThreeDayCalendar'
import { isDatePast, isDateToday, isDateFuture, formatDateUK, getDaysUntil } from '@/lib/dateUtils'

interface ComplianceLog {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  checked_date: string
  notes: string | null
  checked_by_role: string
  people?: { full_name: string } | null
}

const checkTypeLabels: Record<string, string> = {
  fire_door: '🚪 Fire Door',
  smoke_alarm: '🔔 Smoke Alarm',
}

const sixMonthsAgo = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().split('T')[0]
}

export default function CleanerDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<any>(null)
  const [personId, setPersonId] = useState<string>('')
  const [cleanerName, setCleanerName] = useState<string>('')
  const [properties, setProperties] = useState<any[]>([])
  const [cleans, setCleans] = useState<any[]>([])
  const [complianceLogs, setComplianceLogs] = useState<ComplianceLog[]>([])
  const [error, setError] = useState('')

  const [propertyId, setPropertyId] = useState('')
  const [cleanDate, setCleanDate] = useState(new Date().toISOString().split('T')[0])
  const [cleanTime, setCleanTime] = useState('10:00')
  const [booking, setBooking] = useState(false)
  const [bookedNotice, setBookedNotice] = useState('')
  const [showAddComplianceModal, setShowAddComplianceModal] = useState(false)
  const [savingCompliance, setSavingCompliance] = useState(false)
  const [complianceForm, setComplianceForm] = useState({ check_type: 'fire_door' as const, date: new Date().toISOString().split('T')[0], notes: '' })
  const [roomsNeedingCleaning, setRoomsNeedingCleaning] = useState<any[]>([])
  const [cleansDisplayLimit, setCleansDisplayLimit] = useState(20)
  const [totalCleansCount, setTotalCleansCount] = useState(0)
  const [showLogPastCleanModal, setShowLogPastCleanModal] = useState(false)
  const [pastCleanForm, setPastCleanForm] = useState({ propertyId: '', cleanDate: new Date().toISOString().split('T')[0], notes: '' })
  const [savingPastClean, setSavingPastClean] = useState(false)
  const [assignedJobs, setAssignedJobs] = useState<any[]>([])
  const [showAcceptJobModal, setShowAcceptJobModal] = useState<string | null>(null)
  const [acceptJobForm, setAcceptJobForm] = useState({ cleanDate: new Date().toISOString().split('T')[0], cleanTime: '10:00' })
  const [acceptingJob, setAcceptingJob] = useState(false)
  const [compliancePropertyId, setCompliancePropertyId] = useState('')
  const [showQuickNotifyModal, setShowQuickNotifyModal] = useState(false)
  const [quickNotifyProperty, setQuickNotifyProperty] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'cleaner') {
        router.push('/login')
        return
      }
      setMe(data.assignment)
      const supabase = createClient()

      // Fetch cleaner's person record by email (the correct way to get person_id)
      const userEmail = data.user?.email
      const { data: personData } = await supabase
        .from('people')
        .select('id, full_name')
        .eq('email', userEmail)
        .single()

      if (personData?.id) {
        setPersonId(personData.id)
        // Load cleans for this cleaner
        await loadCleans(personData.id, cleansDisplayLimit)
      }
      if (personData?.full_name) {
        setCleanerName(personData.full_name)
      }

      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address, clean_frequency_weeks')
        .order('name')
      setProperties(props || [])
      if (props?.[0]) {
        setPropertyId(props[0].id)
        await loadComplianceLogs(props[0].id)
      }
      await loadAssignedJobs()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadCleans(cleanerId: string, limit: number = 20) {
    const supabase = createClient()

    // Get total count of cleans
    const { count } = await supabase
      .from('cleans')
      .select('*', { count: 'exact', head: true })
      .eq('cleaner_id', cleanerId)

    const { data } = await supabase
      .from('cleans')
      .select('*, properties(id, name, address, clean_frequency_weeks)')
      .eq('cleaner_id', cleanerId)
      .order('clean_date', { ascending: false })
      .limit(limit)

    setCleans(data || [])
    setTotalCleansCount(count || 0)
  }

  async function loadMoreCleans() {
    const newLimit = cleansDisplayLimit + 20
    setCleansDisplayLimit(newLimit)
    await loadCleans((me as any)?.id, newLimit)
  }

  async function logPastClean() {
    if (!pastCleanForm.propertyId || !pastCleanForm.cleanDate) {
      setError('Please fill in property and date')
      return
    }

    setSavingPastClean(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.from('cleans').insert({
        property_id: pastCleanForm.propertyId,
        cleaner_id: (me as any)?.id,
        clean_date: pastCleanForm.cleanDate,
        status: 'completed',
        completed_at: new Date().toISOString(),
        notes: pastCleanForm.notes || null,
      })

      if (err) throw err

      setPastCleanForm({ propertyId: '', cleanDate: new Date().toISOString().split('T')[0], notes: '' })
      setShowLogPastCleanModal(false)
      await loadCleans((me as any)?.id, cleansDisplayLimit)
      setError('')
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingPastClean(false)
    }
  }

  async function loadAssignedJobs() {
    try {
      const response = await fetch('/api/jobs/assigned')
      if (!response.ok) return

      const data = await response.json()
      setAssignedJobs(data.jobs || [])
    } catch (err) {
      console.error('Failed to load assigned jobs:', err)
    }
  }

  async function acceptJob(jobId: string) {
    if (!acceptJobForm.cleanDate) {
      setError('Please select a date')
      return
    }

    setAcceptingJob(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/accept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clean_date: acceptJobForm.cleanDate,
          clean_time: acceptJobForm.cleanTime,
        }),
      })

      if (!response.ok) throw new Error('Failed to accept job')

      setShowAcceptJobModal(null)
      await loadAssignedJobs()
      await loadCleans((me as any)?.id, cleansDisplayLimit)
      setError('')
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setAcceptingJob(false)
    }
  }

  async function loadComplianceLogs(propId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('compliance_logs')
      .select('id, check_type, checked_date, notes, checked_by_role, people(full_name)')
      .eq('property_id', propId)
      .gte('checked_date', sixMonthsAgo())
      .order('checked_date', { ascending: false })
      .limit(50)
    setComplianceLogs((data || []) as any)
  }

  function handlePropertyChange(newPropertyId: string) {
    setPropertyId(newPropertyId)
    loadComplianceLogs(newPropertyId)
  }

  async function handleAddComplianceLog() {
    if (!compliancePropertyId || !complianceForm.date || !personId) {
      alert('Please fill in all required fields')
      return
    }

    setSavingCompliance(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('compliance_logs')
        .insert({
          property_id: compliancePropertyId,
          check_type: complianceForm.check_type,
          checked_by: personId,
          checked_by_role: 'cleaner',
          checked_date: complianceForm.date,
          notes: complianceForm.notes || null,
        })

      if (error) throw error

      setComplianceForm({ check_type: 'fire_door', date: new Date().toISOString().split('T')[0], notes: '' })
      setShowAddComplianceModal(false)
      await loadComplianceLogs(compliancePropertyId)
      alert('✅ Check logged')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingCompliance(false)
    }
  }

  /** Book a clean. Short notice is normal here — no lead-time rules. */
  async function bookClean() {
    if (!propertyId || !cleanDate || booking) return
    setError('')
    setBookedNotice('')
    setBooking(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('cleans').insert({
      property_id: propertyId,
      cleaner_id: (me as any)?.id,
      clean_date: cleanDate,
      clean_time: cleanTime || null,
    })
    if (err) {
      setBooking(false)
      return setError(err.message)
    }
    await loadCleans((me as any).id)
    setBooking(false)
    const propName = properties.find((p) => p.id === propertyId)?.name || 'the property'
    const when = new Date(cleanDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    setBookedNotice(`✅ Clean booked for ${propName} on ${when}${cleanTime ? ` at ${cleanTime}` : ''}. It's in Upcoming cleans below.`)
  }

  /** last completed clean date + frequency weeks → next-due date */
  function nextDue(c: any): string | null {
    const weeks = c.properties?.clean_frequency_weeks
    const base = c.completed_at || c.clean_date
    if (!weeks || !base) return null
    const d = new Date(base)
    d.setDate(d.getDate() + weeks * 7)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function freqLabel(weeks: number | null | undefined): string | null {
    if (weeks == null) return null
    return weeks === 1 ? 'Weekly' : weeks === 2 ? 'Every 2 weeks' : `Every ${weeks} weeks`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar right={<BackButton />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  // Filter scheduled cleans by status AND date
  const scheduledCleans = cleans.filter((c) => c.status !== 'completed')
  const overdueCleans = scheduledCleans.filter((c) => c.clean_date && isDatePast(c.clean_date))
  const todayCleans = scheduledCleans.filter((c) => c.clean_date && isDateToday(c.clean_date))
  const upcomingCleans = scheduledCleans.filter((c) => c.clean_date && isDateFuture(c.clean_date))

  const scheduled = scheduledCleans // Keep for backward compatibility
  const done = cleans.filter((c) => c.status === 'completed')

  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overdue: overdueCleans.length > 0, // Expanded by default if has items
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <button
            onClick={async () => {
              await signOut()
              router.push('/login')
            }}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Greeting */}
        {me && (
          <RoleGreeting
            role="Cleaner Dashboard"
            name={cleanerName || me.user_metadata?.full_name || me.email?.split('@')[0]}
            subtitle="Ready to get some work done"
          />
        )}

        {/* Notifications */}
        <div className="mb-lg">
          <EnableNotifications />
        </div>
        {error && (
          <div className="mb-md rounded-xl border border-neutral-900 bg-white p-md text-sm">
            {error}
          </div>
        )}

        {/* 3-Day Calendar - TEMPORARILY DISABLED FOR DEBUGGING */}
        {/* <ThreeDayCalendar
          appointments={cleans.map((c: any) => ({
            id: c.id,
            clean_date: c.clean_date,
          }))}
          role="cleaner"
          onAppointmentClick={(clean: any) => {
            router.push(`/cleaner/clean/${clean.id}`)
          }}
        /> */}

        <section className="rounded-2xl border-2 border-neutral-950 bg-neutral-900 p-lg">
          <h2 className="text-xl font-bold text-white">Book a clean</h2>
          <div className="mt-md grid gap-md sm:grid-cols-3">
            {/* min-w-0 on each grid cell lets the column shrink to the tile
                width. Without it, the native date/time controls keep their
                intrinsic min-content width and push out past the tile edges. */}
            <div className="min-w-0">
              <label className="block text-xs font-medium text-neutral-200">Property</label>
              <select
                value={propertyId}
                onChange={(e) => handlePropertyChange(e.target.value)}
                className="mt-xs w-full min-w-0 rounded-xl border border-neutral-600 bg-neutral-900 px-md py-md text-sm text-white"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-medium text-neutral-200">Date</label>
              <input
                type="date"
                value={cleanDate}
                onChange={(e) => setCleanDate(e.target.value)}
                className="mt-xs w-full min-w-0 rounded-xl border border-neutral-600 bg-neutral-900 px-md py-md text-sm text-white"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-medium text-neutral-200">Time</label>
              <input
                type="time"
                value={cleanTime}
                onChange={(e) => setCleanTime(e.target.value)}
                className="mt-xs w-full min-w-0 rounded-xl border border-neutral-600 bg-neutral-900 px-md py-md text-sm text-white"
              />
            </div>
          </div>
          <div className="mt-md flex gap-md">
            <button
              onClick={bookClean}
              disabled={booking}
              className="flex-1 rounded-xl bg-slate-600 py-md text-sm font-bold text-white disabled:opacity-40 hover:bg-slate-700"
            >
              {booking ? 'Booking…' : 'Book this clean'}
            </button>
            <button
              onClick={() => {
                setPastCleanForm({ propertyId: propertyId || '', cleanDate: new Date().toISOString().split('T')[0], notes: '' })
                setShowLogPastCleanModal(true)
              }}
              className="flex-1 rounded-xl bg-slate-600 py-md text-sm font-bold text-white hover:bg-slate-700"
            >
              📝 Log Past Clean
            </button>
          </div>
          {bookedNotice && (
            <div className="mt-md rounded-xl border border-green-300 bg-green-50 p-md text-sm font-semibold text-green-800">
              {bookedNotice}
            </div>
          )}
        </section>

        {/* Assigned Jobs Section */}
        {assignedJobs.length > 0 && (
          <section className="mt-3xl">
            <h2 className="text-xl font-bold">📌 Assigned Jobs</h2>
            <div className="mt-md space-y-sm">
              {assignedJobs.map((job) => (
                <div
                  key={job.id}
                  className={`rounded-2xl border-2 p-md ${
                    job.task_type === 'asap'
                      ? 'border-red-500 bg-red-900'
                      : job.task_type === 'urgent'
                      ? 'border-orange-500 bg-orange-900'
                      : 'border-blue-500 bg-blue-900'
                  } text-white`}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {job.properties?.name} - {job.rooms?.name}
                      </p>
                      {job.notes && (
                        <p className="text-sm text-neutral-200 mt-xs">{job.notes}</p>
                      )}
                      <p className="text-xs text-neutral-300 mt-xs">
                        {job.task_type === 'asap' ? '🚨 ASAP' : job.task_type === 'urgent' ? '⚠️ Urgent' : '📌 Normal'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setAcceptJobForm({
                          cleanDate: new Date().toISOString().split('T')[0],
                          cleanTime: '10:00',
                        })
                        setShowAcceptJobModal(job.id)
                      }}
                      className="shrink-0 ml-md rounded-lg bg-white px-md py-sm text-xs font-bold text-neutral-900 hover:bg-neutral-100"
                    >
                      Accept & Book
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Stats Grid */}
        <div className="mt-3xl grid gap-md sm:grid-cols-4">
          {/* OVERDUE */}
          {overdueCleans.length > 0 && (
            <button
              onClick={() => document.getElementById('overdue-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-2xl border-2 bg-red-50 border-red-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-red-600">⚠️ Overdue</p>
              <p className="mt-xs text-3xl font-bold text-red-600">{overdueCleans.length}</p>
              <p className="text-xs text-red-600 mt-xs">action needed</p>
            </button>
          )}

          {/* TODAY */}
          {todayCleans.length > 0 && (
            <button
              onClick={() => document.getElementById('today-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-2xl border-2 bg-blue-50 border-blue-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600">📍 Today</p>
              <p className="mt-xs text-3xl font-bold text-blue-600">{todayCleans.length}</p>
              <p className="text-xs text-blue-600 mt-xs">scheduled for now</p>
            </button>
          )}

          {/* UPCOMING */}
          <button
            onClick={() => document.getElementById('upcoming-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="rounded-2xl border-2 bg-white border-neutral-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">📅 Upcoming</p>
            <p className="mt-xs text-3xl font-bold text-neutral-900">{upcomingCleans.length}</p>
            <p className="text-xs text-neutral-600 mt-xs">scheduled ahead</p>
          </button>

          {/* COMPLETED */}
          <button
            onClick={() => document.getElementById('completed-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="rounded-2xl border-2 bg-white border-neutral-300 p-lg text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">✅ Completed</p>
            <p className="mt-xs text-3xl font-bold text-neutral-900">
              {done.length > 0 && <span className="mr-sm">✓</span>}
              {done.length}
            </p>
            <p className="text-xs text-neutral-600 mt-xs">this month</p>
          </button>
        </div>

        {/* OVERDUE section - Red warning with collapse */}
        {overdueCleans.length > 0 && (
          <section className="mb-3xl mt-3xl" id="overdue-section">
            <button
              onClick={() => toggleSection('overdue')}
              className="w-full flex items-center justify-between mb-md p-md rounded-lg border-2 border-red-300 bg-red-50 text-left hover:bg-red-100 transition-colors"
            >
              <div className="flex items-center gap-md">
                <span className="text-lg">{expandedSections.overdue ? '▼' : '▶'}</span>
                <div>
                  <h2 className="font-bold text-red-600">⚠️ Overdue</h2>
                  <p className="text-xs text-red-600">{overdueCleans.length} clean{overdueCleans.length !== 1 ? 's' : ''} need attention</p>
                </div>
              </div>
            </button>

            {expandedSections.overdue && (
              <>
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-md mb-lg mt-md">
                  <p className="text-sm text-red-700">
                    These cleans were scheduled for past dates. Please contact admin to reschedule or mark complete.
                  </p>
                </div>
                <div className="space-y-md">
                  {overdueCleans.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/cleaner/clean/${c.id}`)}
                      className="w-full flex items-center justify-between gap-md rounded-2xl border-2 border-red-300 bg-red-50 p-md text-left hover:shadow-md text-red-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-red-900">{c.properties?.name}</p>
                        <p className="text-sm text-red-700">
                          {new Date(c.clean_date).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                          {c.clean_time ? ` · ${String(c.clean_time).slice(0, 5)}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-center">
                        <span className="inline-block rounded-lg bg-red-600 px-md py-sm text-xs font-bold text-white">
                          {Math.abs(getDaysUntil(c.clean_date || ''))} days overdue
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* TODAY section - Blue, high priority */}
        {todayCleans.length > 0 && (
          <section className="mb-3xl" id="today-section">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-xl font-bold text-blue-600">📍 Today</h2>
              <span className="text-sm text-blue-600 font-semibold">{todayCleans.length} scheduled</span>
            </div>
            <div className="space-y-md">
              {todayCleans.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/cleaner/clean/${c.id}`)}
                  className="w-full flex items-center justify-between gap-md rounded-2xl border-2 border-blue-300 bg-blue-50 p-md text-left hover:shadow-md text-blue-900"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-blue-900">{c.properties?.name}</p>
                    <p className="text-sm text-blue-700">
                      {c.clean_time ? `Today at ${String(c.clean_time).slice(0, 5)}` : 'Today'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-blue-600 px-md py-sm text-xs font-bold text-white">
                    {c.arrived_at ? 'On site' : 'Ready'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* UPCOMING section */}
        {upcomingCleans.length > 0 && (
          <section className="mb-3xl" id="upcoming-section">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-xl font-bold">📅 Upcoming</h2>
              <span className="text-sm text-neutral-600 font-semibold">{upcomingCleans.length} scheduled</span>
            </div>
            <div className="space-y-md">
              {upcomingCleans.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/cleaner/clean/${c.id}`)}
                  className="w-full flex items-center justify-between gap-md rounded-2xl border border-neutral-800 bg-neutral-900 p-md text-left hover:border-white text-white"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{c.properties?.name}</p>
                    <p className="text-sm text-neutral-400">
                      {new Date(c.clean_date).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                      {c.clean_time ? ` · ${String(c.clean_time).slice(0, 5)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-neutral-400">
                    in {getDaysUntil(c.clean_date || '')} day{getDaysUntil(c.clean_date || '') !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* COMPLETED section */}
        {done.length > 0 && (
          <section id="completed-section">
            <h2 className="text-xl font-bold mb-md">✅ Completed</h2>
            <div className="space-y-md">
              {done.slice(0, 10).map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/cleaner/clean/${c.id}`)}
                  className="w-full flex items-center justify-between gap-md rounded-2xl border border-neutral-800 bg-neutral-900 p-md text-left hover:border-white text-white"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{c.properties?.name}</p>
                    <p className="text-sm text-neutral-400">
                      {new Date(c.clean_date).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-green-600 px-md py-sm text-xs font-bold text-white">
                    Completed
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {scheduled.length === 0 && done.length === 0 && (
          <p className="mt-3xl rounded-2xl border border-dashed border-neutral-700 bg-neutral-900 p-xl text-center text-sm text-neutral-400">
            Nothing booked yet
          </p>
        )}

        {done.length > 0 && (
          <section className="mt-3xl">
            <h2 className="text-xl font-bold">Completed</h2>
            <div className="mt-md space-y-sm">
              {done.map((c) => {
                const due = nextDue(c)
                const freq = freqLabel(c.properties?.clean_frequency_weeks)
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/cleaner/clean/${c.id}`)}
                    className="flex w-full items-center justify-between gap-md rounded-2xl border border-neutral-800 bg-neutral-900 p-md text-left hover:border-white text-white"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-white">{c.properties?.name}</p>
                      <p className="text-sm text-neutral-400">
                        {new Date(c.clean_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                        {c.special_jobs?.length ? ` · ${c.special_jobs.length} extra jobs` : ''}
                      </p>
                      {(freq || due) && (
                        <p className="mt-xs text-xs font-semibold text-neutral-300">
                          {freq ? freq : ''}
                          {freq && due ? ' · ' : ''}
                          {due ? `next due ${due}` : ''}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-lg bg-green-100 px-md py-sm text-xs font-bold text-green-800">
                      Completed
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Compliance Logs Section */}
        <section className="mt-3xl">
          <div className="flex items-center justify-between mb-md">
            <div>
              <h2 className="text-xl font-bold">Compliance Checks</h2>
              <p className="text-sm text-neutral-600 mt-xs">
                {properties.find((p) => p.id === propertyId)?.name || 'All properties'} · Last 6 months
              </p>
            </div>
            <button
              onClick={() => {
                setCompliancePropertyId(propertyId)
                setShowAddComplianceModal(true)
              }}
              className="rounded-lg bg-slate-600 px-md py-sm text-xs font-bold text-white hover:bg-blue-600"
            >
              + Add Check
            </button>
          </div>

          {complianceLogs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-400">
              No compliance checks logged for this property yet
            </p>
          ) : (
            <div className="space-y-sm">
              {complianceLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-md">
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">
                        {checkTypeLabels[log.check_type]}
                      </p>
                      <p className="text-sm text-neutral-400 mt-xs">
                        {new Date(log.checked_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {' · '}
                        {log.people?.full_name || 'Unknown'} ({log.checked_by_role})
                      </p>
                      {log.notes && (
                        <p className="text-sm text-neutral-300 mt-md whitespace-pre-wrap">
                          {log.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add Compliance Check Modal */}
        {showAddComplianceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-md">Log Compliance Check</h2>

              <div className="space-y-md">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Property *</label>
                  <select
                    value={compliancePropertyId}
                    onChange={(e) => setCompliancePropertyId(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  >
                    <option value="">Select a property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Check Type</label>
                  <div className="flex gap-sm">
                    {(['fire_door', 'smoke_alarm'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setComplianceForm({ ...complianceForm, check_type: type })}
                        className={`flex-1 rounded-lg border px-md py-sm text-xs font-semibold transition-colors ${
                          complianceForm.check_type === type
                            ? 'border-slate-600 bg-slate-600 text-white'
                            : 'border-neutral-300 text-neutral-700'
                        }`}
                      >
                        {checkTypeLabels[type]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Date Checked</label>
                  <input
                    type="date"
                    value={complianceForm.date}
                    onChange={(e) => setComplianceForm({ ...complianceForm, date: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Notes (Optional)</label>
                  <textarea
                    placeholder="e.g., All tests passed, battery good"
                    value={complianceForm.notes}
                    onChange={(e) => setComplianceForm({ ...complianceForm, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                <div className="flex gap-sm pt-md">
                  <button
                    onClick={handleAddComplianceLog}
                    disabled={savingCompliance}
                    className="flex-1 rounded-lg bg-slate-600 py-sm font-bold text-white disabled:opacity-50 hover:bg-slate-700"
                  >
                    {savingCompliance ? 'Saving…' : 'Log Check'}
                  </button>
                  <button
                    onClick={() => setShowAddComplianceModal(false)}
                    className="flex-1 rounded-lg border border-neutral-300 py-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Log Past Clean Modal */}
        {showLogPastCleanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-md">📝 Log Past Clean</h2>

              <div className="space-y-md">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Property *</label>
                  <select
                    value={pastCleanForm.propertyId}
                    onChange={(e) => setPastCleanForm({ ...pastCleanForm, propertyId: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  >
                    <option value="">Select property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Date Cleaned *</label>
                  <input
                    type="date"
                    value={pastCleanForm.cleanDate}
                    onChange={(e) => setPastCleanForm({ ...pastCleanForm, cleanDate: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Notes (Optional)</label>
                  <textarea
                    placeholder="e.g., Emergency clean, extra rooms, etc."
                    value={pastCleanForm.notes}
                    onChange={(e) => setPastCleanForm({ ...pastCleanForm, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                <div className="flex gap-sm pt-md">
                  <button
                    onClick={logPastClean}
                    disabled={savingPastClean}
                    className="flex-1 rounded-lg bg-slate-600 py-sm font-bold text-white disabled:opacity-50 hover:bg-slate-700"
                  >
                    {savingPastClean ? 'Saving…' : 'Log Clean'}
                  </button>
                  <button
                    onClick={() => setShowLogPastCleanModal(false)}
                    className="flex-1 rounded-lg border border-neutral-300 py-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accept Job Modal */}
        {showAcceptJobModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-md">Accept & Book Clean</h2>

              <div className="space-y-md">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Date *</label>
                  <input
                    type="date"
                    value={acceptJobForm.cleanDate}
                    onChange={(e) => setAcceptJobForm({ ...acceptJobForm, cleanDate: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Time (Optional)</label>
                  <input
                    type="time"
                    value={acceptJobForm.cleanTime}
                    onChange={(e) => setAcceptJobForm({ ...acceptJobForm, cleanTime: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 p-md text-sm font-semibold text-red-800">
                    {error}
                  </div>
                )}

                <div className="flex gap-sm pt-md">
                  <button
                    onClick={() => acceptJob(showAcceptJobModal)}
                    disabled={acceptingJob}
                    className="flex-1 rounded-lg bg-slate-600 py-sm font-bold text-white disabled:opacity-50 hover:bg-slate-700"
                  >
                    {acceptingJob ? 'Accepting...' : 'Accept & Book'}
                  </button>
                  <button
                    onClick={() => setShowAcceptJobModal(null)}
                    className="flex-1 rounded-lg border border-neutral-300 py-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showQuickNotifyModal && quickNotifyProperty && (
          <StaffQuickNotifyModal
            role="cleaner"
            propertyId={quickNotifyProperty.id}
            propertyName={quickNotifyProperty.name}
            onClose={() => {
              setShowQuickNotifyModal(false)
              setQuickNotifyProperty(null)
            }}
            onSuccess={() => {
              setShowQuickNotifyModal(false)
              setQuickNotifyProperty(null)
            }}
          />
        )}
      </main>
    </div>
  )
}

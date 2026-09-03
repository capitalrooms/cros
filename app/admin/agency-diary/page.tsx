'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import AgencyDiaryMap from '@/app/components/AgencyDiaryMap'

interface MaintenanceJob {
  id: string
  title: string
  description?: string
  property_id: string
  room_id?: string
  contractor_id?: string
  status: string
  priority: string
  booked_date?: string
  booked_slot?: string
  property: { name: string; address: string }
  room?: { name: string }
  contractor?: { name: string }
}

interface CleanJob {
  id: string
  property_id: string
  clean_date?: string
  clean_time?: string
  cleaner_id?: string
  status: string
  property: { name: string; address: string }
  cleaner?: { name: string }
}

interface Appointment {
  id: string
  property_id: string
  appointment_type: string
  appointment_date: string
  appointment_time: string
  duration_minutes?: number
  visitor_name: string
  property: { name: string; address: string }
}

type DiaryEvent = (MaintenanceJob | CleanJob | Appointment) & {
  type: 'maintenance' | 'clean' | 'appointment'
  date: string
  time: string
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 border-red-300 text-red-900',
  high: 'bg-orange-100 border-orange-300 text-orange-900',
  medium: 'bg-blue-100 border-blue-300 text-blue-900',
  low: 'bg-green-100 border-green-300 text-green-900',
}

const APPOINTMENT_TYPE_ICONS: Record<string, string> = {
  landlord: '👤',
  lettings: '🏘️',
  contractor: '👷',
  cleaner: '🧹',
  delivery: '📦',
  inspection: '🔍',
  gas_safety: '🔥',
  electrical: '⚡',
  fire_door: '🚪',
  smoke_alarm: '💨',
  viewing: '👀',
  other: '📍',
}

export default function AgencyDiaryPage() {
  const router = useRouter()
  const supabase = createClient()

  // Auth & loading
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day
    return new Date(d.setDate(diff))
  })

  // Data
  const [maintenanceJobs, setMaintenanceJobs] = useState<MaintenanceJob[]>([])
  const [cleanJobs, setCleanJobs] = useState<CleanJob[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [outstandingJobs, setOutstandingJobs] = useState<MaintenanceJob[]>([])
  const [showOutstanding, setShowOutstanding] = useState(false)

  // UI state
  const [showBookMenu, setShowBookMenu] = useState(false)
  const [upcomingPage, setUpcomingPage] = useState(0)
  const itemsPerPage = 10
  // Lettings staff can VIEW the diary (to time viewings around cleans/contractors)
  // but only admins can book into it. #8 cross-visibility, 25 Aug.
  const [canBook, setCanBook] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      const role = data?.assignment?.role
      const canView = role === 'administrator' || role === 'admin' || role === 'lettings'
      if (!data || !canView) {
        router.push('/login')
        return
      }
      setCanBook(role === 'administrator' || role === 'admin')

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      try {
        // Load maintenance jobs (booked in this week)
        const { data: maint } = await supabase
          .from('maintenance_tickets')
          .select('*, properties(name, address), rooms(name), contractor:contractor_id(full_name)')
          .gte('booked_date', weekStart.toISOString().split('T')[0])
          .lt('booked_date', weekEnd.toISOString().split('T')[0])
          .order('booked_date', { ascending: true })

        setMaintenanceJobs((maint as any) || [])

        // Load clean jobs
        const { data: cleans } = await supabase
          .from('cleans')
          .select('*, properties(name, address), cleaner:cleaner_id(full_name)')
          .gte('clean_date', weekStart.toISOString().split('T')[0])
          .lt('clean_date', weekEnd.toISOString().split('T')[0])
          .order('clean_date', { ascending: true })

        setCleanJobs((cleans as any) || [])

        // Load appointments
        const { data: appts } = await supabase
          .from('property_appointments')
          .select('*, properties(name, address)')
          .gte('appointment_date', weekStart.toISOString().split('T')[0])
          .lt('appointment_date', weekEnd.toISOString().split('T')[0])
          .order('appointment_date', { ascending: true })

        // Lettings books viewings into their own `viewings` table, so they don't
        // show here by default. Pull them in and map them onto the appointment
        // shape (there's already a 👀 "viewing" type) so admin sees the lettings
        // diary alongside everything else — the cross-visibility from 25 Aug #8.
        // NB: viewings.property_id has no FK, so a PostgREST `properties(...)`
        // embed 400s here — fetch plainly and resolve names via a separate query.
        const { data: views } = await supabase
          .from('viewings')
          .select('id, property_id, viewing_date, viewing_slot, visitor_name, viewing_status')
          .gte('viewing_date', weekStart.toISOString().split('T')[0])
          .lt('viewing_date', weekEnd.toISOString().split('T')[0])
          .neq('viewing_status', 'closed')

        const viewRows = (views as any[]) || []
        const viewPropIds = [...new Set(viewRows.map((v) => v.property_id).filter(Boolean))]
        const propMap = new Map<string, { name: string; address: string }>()
        if (viewPropIds.length) {
          const { data: props } = await supabase.from('properties').select('id, name, address').in('id', viewPropIds)
          for (const p of props || []) propMap.set(p.id, { name: p.name, address: p.address })
        }

        const viewingAppts: Appointment[] = viewRows.map((v) => ({
          id: `viewing-${v.id}`,
          property_id: v.property_id,
          appointment_type: 'viewing',
          appointment_date: v.viewing_date,
          appointment_time: v.viewing_slot || '09:00',
          visitor_name: v.visitor_name || 'Viewing',
          property: propMap.get(v.property_id) || { name: 'Unknown', address: '' },
        }))

        setAppointments([...((appts as any[]) || []), ...viewingAppts])

        // Load outstanding jobs (approved but not booked)
        const { data: outstanding } = await supabase
          .from('maintenance_tickets')
          .select('*, properties(name, address), rooms(name), contractor:contractor_id(full_name)')
          .eq('status', 'assigned')
          .is('booked_date', null)
          .order('created_at', { ascending: true })

        setOutstandingJobs((outstanding as any) || [])

        setLoading(false)
      } catch (error) {
        console.error('Error loading diary data:', error)
        setLoading(false)
      }
    }

    init()
  }, [router, weekStart, supabase])

  if (loading) {
    return <GenericPageSkeleton />
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const formatDate = (d: Date) => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `${dayNames[d.getDay()]} ${d.getDate()}`
  }

  const getEventsForDay = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    const events: DiaryEvent[] = []

    maintenanceJobs.forEach((job) => {
      if (job.booked_date === dateStr) {
        events.push({
          ...job,
          type: 'maintenance',
          date: job.booked_date || '',
          time: job.booked_slot || '09:00',
        })
      }
    })

    cleanJobs.forEach((job) => {
      if (job.clean_date === dateStr) {
        events.push({
          ...job,
          type: 'clean',
          date: job.clean_date || '',
          time: job.clean_time || '09:00',
        })
      }
    })

    appointments.forEach((appt) => {
      if (appt.appointment_date === dateStr) {
        events.push({
          ...appt,
          type: 'appointment',
          date: appt.appointment_date,
          time: appt.appointment_time,
        })
      }
    })

    return events.sort((a, b) => a.time.localeCompare(b.time))
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton />} />

      <main className="mx-auto max-w-7xl px-lg py-3xl">
        {/* Back Button */}
        <Link
          href={canBook ? '/admin' : '/lettings'}
          className="inline-flex items-center gap-sm text-neutral-600 hover:text-neutral-900 font-medium mb-3xl transition-colors"
        >
          ← Back to Dashboard
        </Link>

        {/* Header — Subtitle Perfectly Centered */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-slate-900 mb-md">
            📅 Agency Diary
          </h1>
          <p className="text-base text-slate-600">
            All property visits, maintenance jobs, and appointments in one place
          </p>
        </div>

        {/* Top Controls */}
        <div className="mb-3xl flex flex-wrap items-center gap-lg">
          {/* Book Button — admins only; lettings sees the diary read-only */}
          {canBook && (
          <div className="relative">
            <button
              onClick={() => setShowBookMenu(!showBookMenu)}
              className="inline-flex items-center gap-md px-lg py-sm rounded-lg bg-neutral-900 text-white font-semibold shadow-md hover:shadow-lg hover:bg-neutral-800 transition-all"
            >
              <span className="text-lg">+ Book</span>
            </button>

            {showBookMenu && (
              <div className="absolute top-full left-0 mt-sm bg-white rounded-lg shadow-lg border border-neutral-200 z-10 min-w-56">
                <Link
                  href="/admin/agency-diary/book-maintenance"
                  className="block px-lg py-md hover:bg-neutral-50 border-b border-neutral-200 rounded-t-lg transition-colors"
                >
                  <div className="font-semibold text-neutral-900">🔧 Book Maintenance Job</div>
                  <div className="text-xs text-neutral-600 mt-xs">Select from approved jobs</div>
                </Link>
                <Link
                  href="/admin/agency-diary/book-clean"
                  className="block px-lg py-md hover:bg-neutral-50 border-b border-neutral-200 transition-colors"
                >
                  <div className="font-semibold text-neutral-900">🧹 Book Cleaner</div>
                  <div className="text-xs text-neutral-600 mt-xs">Assign cleaning jobs</div>
                </Link>
                <Link
                  href="/admin/agency-diary/book-appointment"
                  className="block px-lg py-md hover:bg-neutral-50 rounded-b-lg transition-colors"
                >
                  <div className="font-semibold text-neutral-900">📋 Other Appointment</div>
                  <div className="text-xs text-neutral-600 mt-xs">Viewings, inspections, etc.</div>
                </Link>
              </div>
            )}
          </div>
          )}

          {/* Read-only badge for lettings staff */}
          {!canBook && (
            <span className="inline-flex items-center gap-sm px-lg py-sm rounded-lg bg-neutral-100 border border-neutral-300 text-neutral-600 font-semibold text-sm">
              👀 Read-only — timing view
            </span>
          )}

          {/* Outstanding Jobs Summary — admins only */}
          {canBook && (
          <button
            onClick={() => setShowOutstanding(!showOutstanding)}
            className="inline-flex items-center gap-sm px-lg py-sm rounded-lg bg-white border border-neutral-300 text-neutral-900 font-semibold hover:bg-neutral-50 transition-colors"
          >
            <span className="text-lg">⚠️</span>
            <span>{outstandingJobs.length} Outstanding</span>
          </button>
          )}

          {/* Week Navigation */}
          <div className="ml-auto flex items-center gap-md">
            <button
              onClick={() => setWeekStart(new Date(weekStart.setDate(weekStart.getDate() - 7)))}
              className="px-md py-sm rounded-lg bg-white border border-slate-300 hover:bg-slate-50 transition-colors text-sm font-medium"
            >
              ← Prev
            </button>
            <div className="text-center">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                {weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <div className="text-sm font-semibold text-slate-900">
                Week of {formatDate(weekStart)}
              </div>
            </div>
            <button
              onClick={() => setWeekStart(new Date(weekStart.setDate(weekStart.getDate() + 7)))}
              className="px-md py-sm rounded-lg bg-white border border-slate-300 hover:bg-slate-50 transition-colors text-sm font-medium"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Outstanding Jobs Drawer */}
        {showOutstanding && outstandingJobs.length > 0 && (
          <div className="mb-3xl p-lg rounded-lg bg-white border border-neutral-200 shadow-md">
            <h3 className="font-bold text-neutral-900 mb-md">⚠️ {outstandingJobs.length} Jobs Waiting to Be Booked</h3>
            <div className="space-y-sm max-h-48 overflow-y-auto">
              {outstandingJobs.map((job) => (
                <div key={job.id} className="p-sm rounded-lg bg-neutral-50 border border-neutral-300 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-neutral-900 truncate">{job.title}</div>
                    <div className="text-xs text-neutral-600">
                      {job.property?.name || 'Unknown property'} {job.room ? `- ${job.room.name}` : ''}
                    </div>
                    {job.contractor && (
                      <div className="text-xs text-neutral-600">
                        Assigned to: {job.contractor.name}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/admin/agency-diary/book-maintenance?job=${job.id}`}
                    className="ml-md px-sm py-xs rounded bg-neutral-700 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors whitespace-nowrap"
                  >
                    Book Now
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Map View */}
        <div className="mb-3xl">
          <h2 className="text-lg font-bold text-slate-900 mb-md">📍 Map View</h2>
          <div className="bg-white rounded-lg border border-slate-300 shadow-md p-lg">
            <AgencyDiaryMap
              events={[
                ...maintenanceJobs.map(j => ({
                  id: j.id,
                  type: 'maintenance' as const,
                  property: j.property,
                  person_name: j.contractor.name || 'Unassigned',
                  time: j.booked_slot || '09:00',
                  title: j.title,
                })),
                ...cleanJobs.map(c => ({
                  id: c.id,
                  type: 'clean' as const,
                  property: c.property,
                  person_name: c.cleaner.name || 'Unassigned',
                  time: c.clean_time || '09:00',
                  title: 'Cleaning',
                })),
                ...appointments.map(a => ({
                  id: a.id,
                  type: 'appointment' as const,
                  property: a.property,
                  person_name: a.visitor_name,
                  time: a.appointment_time,
                  title: a.appointment_type,
                })),
              ]}
            />
          </div>
        </div>

        {/* Week Calendar */}
        <div className="rounded-lg bg-white shadow-md overflow-hidden border border-neutral-200">
          {/* Days Header */}
          <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className="px-md py-lg text-center border-r border-slate-200 last:border-r-0"
              >
                <div className="text-sm font-bold text-slate-900">{formatDate(day)}</div>
                <div className="text-xs text-slate-500">{day.getDate()}</div>
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const events = getEventsForDay(day)
              const dateStr = day.toISOString().split('T')[0]
              const isToday = dateStr === new Date().toISOString().split('T')[0]

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-64 p-md border-r border-b border-slate-200 last:border-r-0 ${
                    isToday ? 'bg-blue-50' : 'bg-white'
                  }`}
                >
                  {/* Events */}
                  <div className="space-y-xs">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className={`text-xs rounded-lg p-xs border-l-4 cursor-pointer hover:shadow-md transition-shadow ${
                          event.type === 'maintenance'
                            ? 'bg-blue-100 border-blue-500 text-blue-900'
                            : event.type === 'clean'
                            ? 'bg-green-100 border-green-500 text-green-900'
                            : 'bg-purple-100 border-purple-500 text-purple-900'
                        }`}
                      >
                        <div className="font-semibold truncate">
                          {event.type === 'maintenance' && `🔧 ${(event as MaintenanceJob).contractor.name || 'Unassigned'}`}
                          {event.type === 'clean' && `🧹 ${(event as CleanJob).cleaner.name || 'Unassigned'}`}
                          {event.type === 'appointment' && `${APPOINTMENT_TYPE_ICONS[(event as Appointment).appointment_type] || '📋'} ${(event as Appointment).visitor_name}`}
                        </div>
                        <div className="text-xs opacity-80 truncate mt-xs">
                          {event.type === 'maintenance' ? (event as MaintenanceJob).title : event.type === 'clean' ? 'Cleaning' : (event as Appointment).appointment_type}
                        </div>
                        <div className="text-xs opacity-70 mt-xs">
                          {event.time}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* No events placeholder */}
                  {events.length === 0 && (
                    <div className="text-xs text-slate-400 text-center py-lg">
                      No bookings
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Stats Footer */}
        <div className="mt-3xl grid grid-cols-1 md:grid-cols-3 gap-lg">
          <div className="rounded-lg bg-white border border-neutral-200 p-lg shadow-sm">
            <div className="text-3xl font-bold text-neutral-900">{maintenanceJobs.length}</div>
            <div className="text-sm text-neutral-600 font-medium">Contractor Jobs Booked</div>
          </div>
          <div className="rounded-lg bg-white border border-neutral-200 p-lg shadow-sm">
            <div className="text-3xl font-bold text-neutral-900">{cleanJobs.length}</div>
            <div className="text-sm text-neutral-600 font-medium">Cleaner Jobs Booked</div>
          </div>
          <div className="rounded-lg bg-white border border-neutral-200 p-lg shadow-sm">
            <div className="text-3xl font-bold text-neutral-900">{appointments.length}</div>
            <div className="text-sm text-neutral-600 font-medium">Other Appointments</div>
          </div>
        </div>

        {/* Upcoming Appointments List */}
        <div className="mt-3xl">
          <h2 className="text-lg font-bold text-slate-900 mb-md">📅 All Upcoming Appointments</h2>
          <div className="bg-white rounded-lg border border-slate-300 shadow-md overflow-hidden">
            <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
              {(() => {
                // Combine all events and sort by date/time
                const allEvents = [
                  ...maintenanceJobs.map((j) => ({
                    id: j.id,
                    type: 'maintenance' as const,
                    date: j.booked_date || '',
                    time: j.booked_slot || '09:00',
                    property: j.property,
                    person: j.contractor.name || 'Unassigned',
                    title: j.title,
                  })),
                  ...cleanJobs.map((c) => ({
                    id: c.id,
                    type: 'clean' as const,
                    date: c.clean_date || '',
                    time: c.clean_time || '09:00',
                    property: c.property,
                    person: c.cleaner.name || 'Unassigned',
                    title: 'Cleaning',
                  })),
                  ...appointments.map((a) => ({
                    id: a.id,
                    type: 'appointment' as const,
                    date: a.appointment_date,
                    time: a.appointment_time,
                    property: a.property,
                    person: a.visitor_name,
                    title: a.appointment_type,
                  })),
                ]
                  .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

                const start = upcomingPage * itemsPerPage
                const end = start + itemsPerPage
                const pageItems = allEvents.slice(start, end)

                if (allEvents.length === 0) {
                  return (
                    <div className="p-lg text-center text-slate-600">
                      No upcoming appointments scheduled
                    </div>
                  )
                }

                return (
                  <>
                    {pageItems.map((event) => (
                      <div key={event.id} className="p-md hover:bg-slate-50 cursor-pointer transition-colors">
                        <div className="flex items-start justify-between gap-md">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-sm mb-xs">
                              <span className="text-lg">
                                {event.type === 'maintenance'
                                  ? '🔧'
                                  : event.type === 'clean'
                                  ? '🧹'
                                  : '📋'}
                              </span>
                              <div className="font-semibold text-slate-900">{event.person}</div>
                              <div className="text-xs text-slate-500">
                                {new Date(event.date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            </div>
                            <div className="text-sm text-slate-600 ml-7">{event.property?.name || 'Unknown property'}</div>
                            <div className="text-xs text-slate-500 ml-7">
                              ⏰ {event.time} • {event.title}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Pagination */}
                    {allEvents.length > itemsPerPage && (
                      <div className="flex items-center justify-between gap-md p-md bg-slate-50 border-t border-slate-200">
                        <button
                          onClick={() => setUpcomingPage(Math.max(0, upcomingPage - 1))}
                          disabled={upcomingPage === 0}
                          className="px-md py-sm rounded-lg bg-white border border-slate-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                        >
                          ← Previous
                        </button>
                        <span className="text-sm text-slate-600">
                          {start + 1}–{Math.min(end, allEvents.length)} of {allEvents.length}
                        </span>
                        <button
                          onClick={() =>
                            setUpcomingPage(
                              Math.min(
                                Math.ceil(allEvents.length / itemsPerPage) - 1,
                                upcomingPage + 1
                              )
                            )
                          }
                          disabled={end >= allEvents.length}
                          className="px-md py-sm rounded-lg bg-white border border-slate-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

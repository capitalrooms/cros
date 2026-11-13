'use client'

import { useState, useEffect } from 'react'
import { isOfficeRole } from '@/lib/access/areas'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { diaryTabs } from '@/lib/diaryTabs'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { localISO } from '@/lib/dateUtils'
import LineIcon from '@/components/LineIcon'
import SidePanel from '@/app/components/SidePanel'
import { TimeGrid, DayList, WeekNav, type CalEntry, type Tone } from '@/components/calendar/Calendar'
import { parseTime, ymd } from '@/components/calendar/look'
type AppointmentType = 'landlord' | 'lettings' | 'management_visit' | 'contractor' | 'cleaner' | 'delivery' | 'inspection' | 'gas_safety' | 'electrical' | 'fire_door' | 'smoke_alarm' | 'other'

interface Appointment {
  id: string
  property_id: string
  appointment_type: AppointmentType
  appointment_date: string
  appointment_time: string
  duration_minutes?: number // e.g., 15, 30, 60, 120
  visitor_name: string
  visitor_company?: string
  visitor_phone?: string
  notes?: string
  notify_tenants: boolean
  created_at: string
  created_by: string
  property?: { name: string; address: string }
}

interface Property {
  id: string
  name: string
  address: string
}

// alphabetical, Other last (Harry: lists are always alphabetical). Property management visit added 3 Nov 2026.
const APPOINTMENT_TYPES: Record<AppointmentType, { label: string; icon: string; bgColor: string; borderColor: string }> = {
  cleaner: { label: 'Cleaner', icon: '🧹', bgColor: 'bg-green-100', borderColor: 'border-green-300' },
  contractor: { label: 'Contractor / repair', icon: '👷', bgColor: 'bg-orange-100', borderColor: 'border-orange-300' },
  delivery: { label: 'Delivery', icon: '📦', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-300' },
  electrical: { label: 'Electrical', icon: '⚡', bgColor: 'bg-amber-100', borderColor: 'border-amber-300' },
  fire_door: { label: 'Fire door', icon: '🚪', bgColor: 'bg-rose-100', borderColor: 'border-rose-300' },
  gas_safety: { label: 'Gas safety', icon: '🔥', bgColor: 'bg-red-100', borderColor: 'border-red-300' },
  inspection: { label: 'Inspection', icon: '🔍', bgColor: 'bg-cyan-100', borderColor: 'border-cyan-300' },
  landlord: { label: 'Landlord visit', icon: '👤', bgColor: 'bg-blue-100', borderColor: 'border-blue-300' },
  lettings: { label: 'Lettings visit', icon: '🏘️', bgColor: 'bg-purple-100', borderColor: 'border-purple-300' },
  management_visit: { label: 'Property management visit', icon: '📋', bgColor: 'bg-lime-100', borderColor: 'border-lime-300' },
  smoke_alarm: { label: 'Smoke alarm', icon: '💨', bgColor: 'bg-sky-100', borderColor: 'border-sky-300' },
  other: { label: 'Other', icon: '📍', bgColor: 'bg-gray-100', borderColor: 'border-gray-300' },
}

export default function AppointmentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Calendar state
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    // weeks start on Monday (12 Nov 2026 — they started on Sunday), midnight local
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d
  })

  // Form state for creating appointment
  const [showCreateForm, setShowCreateForm] = useState(false)
  // an appointment clicked in the grid — its details (12 Nov 2026: clicking one did nothing)
  const [viewAppt, setViewAppt] = useState<Appointment | null>(null)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('landlord')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('10:00')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [visitorName, setVisitorName] = useState('')
  const [visitorCompany, setVisitorCompany] = useState('')
  const [visitorPhone, setVisitorPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [notifyTenants, setNotifyTenants] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Postcode filter for property picker
  const [postcodeFilter, setPostcodeFilter] = useState('')

  // Dragging state
  const [draggedAppt, setDraggedAppt] = useState<Appointment | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !isOfficeRole(data.assignment?.role)) {
        router.push('/login')
        return
      }

      const { data: propsData } = await supabase.from('properties').select('id, name, address').order('name')
      setProperties(sortPropertiesNumerically(propsData || []))

      // Pre-fill property if passed from URL (e.g., from Properties card quick-book button)
      const propertyId = searchParams.get('property')
      if (propertyId) {
        setSelectedProperty(propertyId)
        setShowCreateForm(true)
      }

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      const { data: appts } = await supabase
        .from('property_appointments')
        .select('*, property:properties(name, address)')
        .gte('appointment_date', localISO(weekStart))
        .lt('appointment_date', localISO(weekEnd))
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })

      setAppointments((appts as any) || [])
      setLoading(false)
    }

    init()
  }, [router, weekStart, searchParams])

  // Calculate visible time range based on appointments
  const getVisibleHours = () => {
    if (appointments.length === 0) return { start: 8, end: 19 }

    let minHour = 24
    let maxHour = 0

    appointments.forEach((appt) => {
      const [hours, minutes] = appt.appointment_time.split(':').map(Number)
      const duration = appt.duration_minutes || 30
      minHour = Math.min(minHour, hours)
      maxHour = Math.max(maxHour, hours + Math.ceil(duration / 60))
    })

    // 8am–7pm, stretched to fit anything earlier or later
    minHour = Math.min(minHour, 8)
    maxHour = Math.max(maxHour, 19)

    return { start: minHour, end: Math.min(maxHour, 24) }
  }

  const visibleHours = getVisibleHours()
  const hours = Array.from({ length: visibleHours.end - visibleHours.start }, (_, i) => visibleHours.start + i)

  const getDays = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }

  const days = getDays()
  // Use local date (not UTC) to avoid timezone drift when comparing against appointment_date strings
  const dateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const timeSlotPosition = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    const totalMinutes = h * 60 + m
    const startMinutes = visibleHours.start * 60
    return ((totalMinutes - startMinutes) / 60) * 4 // 4rem per hour
  }

  const handleCreateAppointment = async () => {
    setError('')
    if (!selectedProperty || !appointmentDate || !visitorName) {
      setError('Property, Date, and Visitor Name are required')
      return
    }

    setSaving(true)
    try {
      const { data: newAppt, error: err } = await supabase
        .from('property_appointments')
        .insert([
          {
            property_id: selectedProperty,
            appointment_type: appointmentType,
            appointment_date: appointmentDate,
            appointment_time: appointmentTime,
            duration_minutes: durationMinutes,
            visitor_name: visitorName,
            visitor_company: visitorCompany || null,
            visitor_phone: visitorPhone || null,
            notes: notes || null,
            notify_tenants: notifyTenants,
          },
        ])
        .select('*, property:properties(name, address)')
        .single()

      if (err) throw err

      setAppointments([...appointments, newAppt])
      setShowCreateForm(false)
      // Reset form
      setSelectedProperty('')
      setAppointmentType('landlord')
      setAppointmentDate('')
      setAppointmentTime('10:00')
      setDurationMinutes(30)
      setVisitorName('')
      setVisitorCompany('')
      setVisitorPhone('')
      setNotes('')
      setNotifyTenants(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create appointment')
    } finally {
      setSaving(false)
    }
  }

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, appt: Appointment) => {
    setDraggedAppt(appt)
    setDragOffset(0)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (date: Date, time: string, e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedAppt) return

    const newDate = dateStr(date)
    const [hours, minutes] = time.split(':').map(Number)

    try {
      await supabase
        .from('property_appointments')
        .update({
          appointment_date: newDate,
          appointment_time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        })
        .eq('id', draggedAppt.id)

      setAppointments(
        appointments.map((a) =>
          a.id === draggedAppt.id
            ? { ...a, appointment_date: newDate, appointment_time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` }
            : a
        )
      )
    } catch (err) {
      console.error('Failed to reschedule:', err)
    }

    setDraggedAppt(null)
  }

  // one calendar across CROS (components/calendar): an appointment's colour says what kind of visit it is
  const toneOf = (t: string): Tone => t === 'cleaner' ? 'clean' : ['contractor', 'electrical', 'gas_safety', 'fire_door', 'smoke_alarm'].includes(t) ? 'repair' : t === 'lettings' ? 'viewing' : 'appointment'
  const calEntries: CalEntry[] = appointments.map(a => {
    const t = parseTime(a.appointment_time, a.duration_minutes || 30)
    return { key: a.id, date: a.appointment_date, ...t, title: `${(APPOINTMENT_TYPES[a.appointment_type] ?? APPOINTMENT_TYPES.other).label} — ${a.visitor_name}`, line2: String(a.property?.name ?? '').split('\n')[0], line3: a.visitor_company || '', tone: toneOf(a.appointment_type), onClick: () => setViewAppt(a), draggable: true }
  })
  async function moveAppt(id: string, date: string, minutes: number) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const { error } = await supabase.from('property_appointments').update({ appointment_date: date, appointment_time: time } as never).eq('id', id)
    if (error) { setError(error.message); return }
    setAppointments(list => list.map(a => a.id === id ? { ...a, appointment_date: date, appointment_time: time } : a))
  }
  const bookAt = (date: string, minutes: number) => { setAppointmentDate(date); setAppointmentTime(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`); setShowCreateForm(true) }

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} />
      <PageHero title="Diary" subtitle={<>Week: drag appointments to reschedule. Click a time slot to book a new visit.</>} tabs={diaryTabs('week')} />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        {/* one toolbar, like Everything: book on the left, the week on the right */}
        <div className="mb-lg flex flex-wrap items-center gap-sm">
          <button onClick={() => setShowCreateForm(true)} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800">+ Book</button>
          <div className="ml-auto"><WeekNav monday={weekStart} onChange={(d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); setWeekStart(x) }} /></div>
        </div>

        {/* Modal overlay */}
        {showCreateForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-lg" onClick={() => setShowCreateForm(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-xl max-h-[90dvh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-lg">
                <h2 className="text-xl font-bold">Book Appointment</h2>
                <button onClick={() => setShowCreateForm(false)} className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none">×</button>
              </div>

              {error && <div className="mb-md p-md bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">{error}</div>}

              <div className="grid grid-cols-2 gap-md mb-md">
                {/* Postcode / name filter */}
                <input
                  type="text"
                  placeholder="Filter by postcode or name…"
                  value={postcodeFilter}
                  onChange={(e) => setPostcodeFilter(e.target.value)}
                  className="col-span-2 border border-neutral-300 rounded-lg px-md py-sm text-sm"
                />
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  className="col-span-2 border border-neutral-300 rounded-lg px-md py-sm text-sm"
                  size={postcodeFilter ? Math.min(5, properties.filter(p =>
                    p.name.toLowerCase().includes(postcodeFilter.toLowerCase()) ||
                    p.address.toLowerCase().includes(postcodeFilter.toLowerCase())
                  ).length + 1) : undefined}
                >
                  <option value="">Select property…</option>
                  {properties
                    .filter(p =>
                      !postcodeFilter ||
                      p.name.toLowerCase().includes(postcodeFilter.toLowerCase()) ||
                      p.address.toLowerCase().includes(postcodeFilter.toLowerCase())
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
                    ))}
                </select>

                <select
                  value={appointmentType}
                  onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
                  className="col-span-2 border border-neutral-300 rounded-lg px-md py-sm text-sm"
                >
                  {Object.entries(APPOINTMENT_TYPES).map(([key, val]) => (
                    <option key={key} value={key}>{<LineIcon glyph={val.icon} />} {val.label}</option>
                  ))}
                </select>

                <input
                  type="date"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="border border-neutral-300 rounded-lg px-md py-sm text-sm"
                />
                <input
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className="border border-neutral-300 rounded-lg px-md py-sm text-sm"
                />

                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="col-span-2 border border-neutral-300 rounded-lg px-md py-sm text-sm"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                </select>

                <input
                  type="text"
                  placeholder="Visitor name"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  className="col-span-2 border border-neutral-300 rounded-lg px-md py-sm text-sm"
                />

                <input
                  type="text"
                  placeholder="Company (optional)"
                  value={visitorCompany}
                  onChange={(e) => setVisitorCompany(e.target.value)}
                  className="border border-neutral-300 rounded-lg px-md py-sm text-sm"
                />

                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={visitorPhone}
                  onChange={(e) => setVisitorPhone(e.target.value)}
                  className="border border-neutral-300 rounded-lg px-md py-sm text-sm"
                />

                <textarea
                  placeholder="Notes for tenants (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="col-span-2 border border-neutral-300 rounded-lg px-md py-sm text-sm"
                />

                <label className="col-span-2 flex items-center gap-sm text-sm">
                  <input
                    type="checkbox"
                    checked={notifyTenants}
                    onChange={(e) => setNotifyTenants(e.target.checked)}
                  />
                  Notify tenants
                </label>
              </div>

              <div className="flex gap-md">
                <button
                  onClick={handleCreateAppointment}
                  disabled={saving}
                  className="flex-1 px-lg py-md bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Booking…' : 'Book'}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-lg py-md border border-neutral-300 rounded-lg hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phone: the week as a list, day by day */}
        <div className="md:hidden">
          <DayList days={days} entries={calEntries} action={(d) => <button type="button" onClick={() => bookAt(d, 600)} className="rounded-lg border border-neutral-300 bg-white px-md py-xs text-xs font-semibold text-neutral-700">+ Book</button>} />
        </div>

        {/* the week — drag an appointment to move it, click an empty slot to book */}
        <div className="hidden md:block">
          <TimeGrid days={days} entries={calEntries} onSlot={bookAt} onMove={moveAppt} />
        </div>
      </main>
      <SidePanel open={!!viewAppt} onClose={() => setViewAppt(null)} title={viewAppt ? `${(APPOINTMENT_TYPES[viewAppt.appointment_type] ?? APPOINTMENT_TYPES.other).label} — ${viewAppt.visitor_name}` : ''}
        eyebrow={viewAppt ? new Date(`${viewAppt.appointment_date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''}
        footer={viewAppt?.property_id ? <Link href={`/admin/properties/${viewAppt.property_id}`} className="rounded-full border border-[#F3F0E6]/40 px-md py-sm text-sm font-semibold">Open the house</Link> : undefined}>
        {viewAppt && (
          <div className="space-y-md text-sm">
            <div className="rounded-xl bg-[#F3F0E6]/10 p-md">
              <p className="text-lg font-semibold">{viewAppt.appointment_time.slice(0, 5)} · {viewAppt.duration_minutes || 30} minutes</p>
              {viewAppt.property && <p className="opacity-80">{String(viewAppt.property.name ?? '').split('\n')[0]}</p>}
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-md gap-y-xs">
              <dt className="opacity-60">Who</dt><dd>{[viewAppt.visitor_name, (viewAppt as any).visitor_company].filter(Boolean).join(', ')}</dd>
              {viewAppt.visitor_phone && <><dt className="opacity-60">Phone</dt><dd><a href={`tel:${viewAppt.visitor_phone.replace(/\s/g, '')}`} className="underline">{viewAppt.visitor_phone}</a></dd></>}
              <dt className="opacity-60">Tenants told</dt><dd>{(viewAppt as any).notify_tenants ? 'Yes' : 'No'}</dd>
            </dl>
            <div>
              <p className="mb-xs text-[11px] font-bold uppercase tracking-wider opacity-60">Notes</p>
              <p className="whitespace-pre-wrap leading-relaxed">{viewAppt.notes || <span className="opacity-60">No notes.</span>}</p>
            </div>
            <p className="text-xs opacity-60">To move it, drag it to another time on the week.</p>
          </div>
        )}
      </SidePanel>

    </div>
  )
}

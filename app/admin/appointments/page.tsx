'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

type AppointmentType = 'landlord' | 'lettings' | 'contractor' | 'cleaner' | 'delivery' | 'inspection' | 'gas_safety' | 'electrical' | 'fire_door' | 'smoke_alarm' | 'other'

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

const APPOINTMENT_TYPES: Record<AppointmentType, { label: string; icon: string; bgColor: string; borderColor: string }> = {
  landlord: { label: 'Landlord visit', icon: '👤', bgColor: 'bg-blue-100', borderColor: 'border-blue-300' },
  lettings: { label: 'Lettings visit', icon: '🏘️', bgColor: 'bg-purple-100', borderColor: 'border-purple-300' },
  contractor: { label: 'Contractor / repair', icon: '👷', bgColor: 'bg-orange-100', borderColor: 'border-orange-300' },
  cleaner: { label: 'Cleaner', icon: '🧹', bgColor: 'bg-green-100', borderColor: 'border-green-300' },
  delivery: { label: 'Delivery', icon: '📦', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-300' },
  inspection: { label: 'Inspection', icon: '🔍', bgColor: 'bg-cyan-100', borderColor: 'border-cyan-300' },
  gas_safety: { label: 'Gas safety', icon: '🔥', bgColor: 'bg-red-100', borderColor: 'border-red-300' },
  electrical: { label: 'Electrical', icon: '⚡', bgColor: 'bg-amber-100', borderColor: 'border-amber-300' },
  fire_door: { label: 'Fire door', icon: '🚪', bgColor: 'bg-rose-100', borderColor: 'border-rose-300' },
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
    const day = d.getDay()
    const diff = d.getDate() - day
    return new Date(d.setDate(diff))
  })

  // Form state for creating appointment
  const [showCreateForm, setShowCreateForm] = useState(false)
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

  // Dragging state
  const [draggedAppt, setDraggedAppt] = useState<Appointment | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const { data: propsData } = await supabase.from('properties').select('id, name, address').order('name')
      setProperties(propsData || [])

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
        .select('*, properties(name, address)')
        .gte('appointment_date', weekStart.toISOString().split('T')[0])
        .lt('appointment_date', weekEnd.toISOString().split('T')[0])
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })

      setAppointments((appts as any) || [])
      setLoading(false)
    }

    init()
  }, [router, weekStart, searchParams])

  // Calculate visible time range based on appointments
  const getVisibleHours = () => {
    if (appointments.length === 0) return { start: 5, end: 22 }

    let minHour = 24
    let maxHour = 0

    appointments.forEach((appt) => {
      const [hours, minutes] = appt.appointment_time.split(':').map(Number)
      const duration = appt.duration_minutes || 30
      minHour = Math.min(minHour, hours)
      maxHour = Math.max(maxHour, hours + Math.ceil(duration / 60))
    })

    // Default to 5am-10pm if no appointments, but expand if appointments outside that
    minHour = Math.min(minHour, 5)
    maxHour = Math.max(maxHour, 22)

    return { start: minHour, end: Math.min(maxHour + 1, 24) }
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
  const dateStr = (d: Date) => d.toISOString().split('T')[0]
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
        .select('*, properties(name, address)')
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

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-full px-lg py-2xl">
        {/* Header — Balanced Spacing */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">📅 Property Calendar</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Drag appointments to reschedule. Click a time slot to book a new visit.
          </p>
        </div>

        {/* Week navigation */}
        <div className="mb-3xl flex items-center justify-between">
          <button
            onClick={() => {
              const d = new Date(weekStart)
              d.setDate(d.getDate() - 7)
              setWeekStart(d)
            }}
            className="px-md py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-200 rounded"
          >
            ← Previous week
          </button>
          <div className="text-sm font-semibold text-neutral-900">
            Week of {weekStart.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
          </div>
          <button
            onClick={() => {
              const d = new Date(weekStart)
              d.setDate(d.getDate() + 7)
              setWeekStart(d)
            }}
            className="px-md py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-200 rounded"
          >
            Next week →
          </button>
        </div>

        {/* Create appointment form */}
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="mb-3xl px-lg py-md bg-neutral-900 text-white font-bold rounded-lg hover:bg-neutral-800"
          >
            + Book Appointment
          </button>
        ) : (
          <div className="mb-3xl p-lg bg-white rounded-2xl border-2 border-neutral-200">
            <h2 className="text-xl font-bold mb-lg">Book Appointment</h2>
            {error && <div className="mb-md p-md bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">{error}</div>}

            <div className="grid grid-cols-2 gap-md mb-md">
              <select
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                className="col-span-2 border border-neutral-300 rounded-lg px-md py-sm text-sm"
              >
                <option value="">Select property…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <select
                value={appointmentType}
                onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
                className="col-span-2 border border-neutral-300 rounded-lg px-md py-sm text-sm"
              >
                {Object.entries(APPOINTMENT_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.label}</option>
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
        )}

        {/* Calendar grid */}
        <div className="mt-3xl overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <div className="inline-block min-w-full">
            {/* Header: Day names */}
            <div className="flex">
              <div className="w-20 border-r border-neutral-200 bg-neutral-50 sticky left-0 z-10"></div>
              {days.map((d, i) => (
                <div key={i} className="flex-1 border-r border-neutral-200 bg-neutral-50 p-md text-center text-sm font-bold">
                  <div>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}</div>
                  <div className="text-xs text-neutral-600">{d.getDate()}</div>
                </div>
              ))}
            </div>

            {/* Time grid */}
            {hours.map((hour) => (
              <div key={hour} className="flex border-b border-neutral-200">
                {/* Time label */}
                <div className="w-20 border-r border-neutral-200 bg-neutral-50 p-sm text-right text-xs font-semibold text-neutral-600 sticky left-0 z-10">
                  {String(hour).padStart(2, '0')}:00
                </div>

                {/* Day columns */}
                {days.map((d, dayIdx) => (
                  <div key={dayIdx} className="flex-1 border-r border-neutral-200 relative" style={{ minHeight: '4rem' }}>
                    {/* Appointment for this slot */}
                    {appointments
                      .filter((a) => a.appointment_date === dateStr(d) && Math.floor(parseInt(a.appointment_time.split(':')[0])) === hour)
                      .map((appt) => {
                        const typeInfo = APPOINTMENT_TYPES[appt.appointment_type]
                        const duration = appt.duration_minutes || 30
                        const heightRem = (duration / 60) * 4

                        return (
                          <div
                            key={appt.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, appt)}
                            className={`absolute left-0.5 right-0.5 top-0.5 p-1 text-xs rounded cursor-move hover:shadow-md transition ${typeInfo.bgColor} border ${typeInfo.borderColor}`}
                            style={{ height: `${heightRem}rem`, lineHeight: '1' }}
                          >
                            <div className="font-bold truncate">{typeInfo.icon} {appt.visitor_name}</div>
                            <div className="truncate text-neutral-600">{appt.appointment_time}</div>
                            {appt.property && <div className="truncate text-neutral-600 text-xs">{appt.property.name}</div>}
                          </div>
                        )
                      })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

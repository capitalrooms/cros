'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface Property {
  id: string
  name: string
  address: string
}

interface Room {
  id: string
  name: string
  property_id: string
}

type AppointmentType = 'landlord' | 'viewing' | 'inspection' | 'gas_safety' | 'electrical' | 'fire_door' | 'smoke_alarm' | 'other'

const APPOINTMENT_TYPES: Record<AppointmentType, { label: string; icon: string }> = {
  landlord: { label: 'Landlord Visit', icon: '👤' },
  viewing: { label: 'Viewing', icon: '👀' },
  inspection: { label: 'Inspection', icon: '🔍' },
  gas_safety: { label: 'Gas Safety Check', icon: '🔥' },
  electrical: { label: 'Electrical Check', icon: '⚡' },
  fire_door: { label: 'Fire Door Check', icon: '🚪' },
  smoke_alarm: { label: 'Smoke Alarm Check', icon: '💨' },
  other: { label: 'Other', icon: '📋' },
}

export default function BookAppointmentPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [selectedProperty, setSelectedProperty] = useState('')
  const [selectedRoom, setSelectedRoom] = useState('')
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('landlord')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('10:00')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [visitorName, setVisitorName] = useState('')
  const [visitorCompany, setVisitorCompany] = useState('')
  const [visitorPhone, setVisitorPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [notifyTenants, setNotifyTenants] = useState(true)

  useEffect(() => {
    async function loadData() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      try {
        const { data: propsData } = await supabase.from('properties').select('id, name, address').order('name')
        setProperties((propsData as any) || [])
        setLoading(false)
      } catch (err) {
        console.error('Error loading properties:', err)
        setError('Failed to load properties')
        setLoading(false)
      }
    }

    loadData()
  }, [router, supabase])

  const handleBook = async () => {
    if (!selectedProperty || !appointmentDate || !appointmentTime || !visitorName) {
      setError('Please fill in all required fields')
      return
    }

    setSaving(true)
    setError('')

    try {
      const appointmentData: any = {
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
      }

      // Add room_id for viewing appointments
      if (appointmentType === 'viewing' && selectedRoom) {
        appointmentData.room_id = selectedRoom
      }

      const { data: inserted, error: insertError } = await supabase
        .from('property_appointments')
        .insert(appointmentData)
        .select()

      if (insertError) throw insertError

      const appointmentId = (inserted as any)?.[0]?.id
      if (appointmentId && notifyTenants && appointmentType === 'viewing') {
        // Send notifications to tenants
        await fetch('/api/notify-appointment-scheduled', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId }),
        })
      }

      setSaving(false)
      router.push('/admin/agency-diary')
    } catch (err) {
      console.error('Error creating appointment:', err)
      setError('Failed to create appointment. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-neutral-100 animate-pulse" />
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar />

      <main className="mx-auto max-w-2xl px-lg py-2xl">
        <Link
          href="/admin/agency-diary"
          className="inline-flex items-center gap-sm text-neutral-600 hover:text-neutral-900 font-medium mb-3xl transition-colors"
        >
          ← Back to Diary
        </Link>

        {/* Header — Balanced Spacing */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900 mb-md">
            📋 Book Appointment
          </h1>
          <p className="text-base text-neutral-600">Create a new appointment for viewings, meetings, and inspections.</p>
        </div>

        {error && (
          <div className="mb-lg p-lg rounded-xl bg-red-100 border border-red-300 text-red-900">
            {error}
          </div>
        )}

        <div className="rounded-2xl bg-white shadow-lg border border-slate-200 p-lg space-y-lg">
          {/* Property */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-sm">
              Property <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedProperty}
              onChange={async (e) => {
                setSelectedProperty(e.target.value)
                setSelectedRoom('')
                if (e.target.value) {
                  try {
                    const { data: roomsData } = await supabase
                      .from('rooms')
                      .select('id, name, property_id')
                      .eq('property_id', e.target.value)
                      .order('name')
                    setRooms((roomsData as any) || [])
                  } catch (err) {
                    console.error('Error loading rooms:', err)
                  }
                } else {
                  setRooms([])
                }
              }}
              className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">Select a property...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} - {p.address}
                </option>
              ))}
            </select>
          </div>

          {/* Room (only for viewings) */}
          {appointmentType === 'viewing' && selectedProperty && (
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-sm">
                Room <span className="text-amber-600">(optional)</span>
              </label>
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="">Any room / Whole property viewing</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-xs">
                If you select a specific room, that tenant will be notified the viewing is for their room. Other tenants will be notified of a property-wide viewing.
              </p>
            </div>
          )}

          {/* Appointment Type */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-sm">Type</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-sm">
              {(Object.entries(APPOINTMENT_TYPES) as [AppointmentType, { label: string; icon: string }][]).map(
                ([type, { label, icon }]) => (
                  <button
                    key={type}
                    onClick={() => setAppointmentType(type)}
                    className={`px-md py-md rounded-lg border-2 transition-all ${
                      appointmentType === type
                        ? 'border-neutral-900 bg-neutral-50 text-neutral-900 font-semibold'
                        : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    <div className="text-lg">{icon}</div>
                    <div className="text-xs">{label}</div>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-sm">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-sm">
                Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-sm">Duration</label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
              className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          {/* Visitor Info */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-sm">
              Visitor Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              placeholder="e.g., John Smith"
              className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-sm">Company (optional)</label>
            <input
              type="text"
              value={visitorCompany}
              onChange={(e) => setVisitorCompany(e.target.value)}
              placeholder="e.g., ABC Inspections"
              className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-sm">Phone (optional)</label>
            <input
              type="tel"
              value={visitorPhone}
              onChange={(e) => setVisitorPhone(e.target.value)}
              placeholder="e.g., 07700 900000"
              className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-sm">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions or notes..."
              rows={3}
              className="w-full px-md py-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Notify Tenants */}
          <label className="flex items-center gap-md cursor-pointer">
            <input
              type="checkbox"
              checked={notifyTenants}
              onChange={(e) => setNotifyTenants(e.target.checked)}
              className="w-5 h-5 rounded"
            />
            <span className="text-sm font-semibold text-slate-900">Notify tenants about this appointment</span>
          </label>

          {/* Buttons */}
          <div className="flex gap-md pt-lg border-t border-slate-200">
            <button
              onClick={handleBook}
              disabled={!selectedProperty || !appointmentDate || !appointmentTime || !visitorName || saving}
              className="flex-1 py-md px-lg rounded-lg bg-neutral-900 text-white font-semibold hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Booking...' : 'Create Appointment'}
            </button>

            <Link
              href="/admin/agency-diary"
              className="flex-1 py-md px-lg rounded-lg bg-neutral-200 text-neutral-900 font-semibold text-center hover:bg-neutral-300 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface AdminAddAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const APPOINTMENT_TYPES = [
  { id: 'inspection', label: '🔍 Inspection', icon: '🔍' },
  { id: 'communal_visit', label: '🏢 Visit to communal areas', icon: '🏢' },
  { id: 'maintenance', label: '🔧 Maintenance visit', icon: '🔧' },
  { id: 'lettings', label: '🔑 Lettings viewing', icon: '🔑' },
  { id: 'landlord', label: '👤 Landlord visit', icon: '👤' },
  { id: 'cleaner', label: '🧹 Cleaner visit', icon: '🧹' },
  { id: 'contractor', label: '⚡ Contractor visit', icon: '⚡' },
  { id: 'utility', label: '🚰 Utility/Gas engineer', icon: '🚰' },
  { id: 'pest_control', label: '🐛 Pest control', icon: '🐛' },
  { id: 'fire_safety', label: '🔥 Fire safety inspection', icon: '🔥' },
  { id: 'manager_visit', label: '📋 Property manager visit', icon: '📋' },
  { id: 'insurance', label: '🛡️ Insurance inspection', icon: '🛡️' },
]

function formatDateNice(iso: string): string {
  if (!iso) return 'the scheduled date'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTimeNice(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

function generateDefaultMessage(
  type: string,
  date: string,
  time: string,
  propertyName: string
): string {
  const d = formatDateNice(date)
  const t = formatTimeNice(time)
  const at = t ? ` at ${t}` : ''
  const prop = propertyName || 'your property'

  const messages: Record<string, string> = {
    inspection:
      `🔍 Please be aware that an inspection has been scheduled at ${prop} on ${d}${at}. Our team will require access to communal areas and may need to check individual rooms. Please ensure you or a housemate is available or has made access arrangements.`,
    communal_visit:
      `🏢 A visit to the communal areas is planned at ${prop} on ${d}${at}. This will cover shared spaces including the kitchen, bathrooms, and hallways. No access to individual rooms is required.`,
    maintenance:
      `🔧 A maintenance visit has been arranged at ${prop} on ${d}${at}. Our team will carry out repairs in communal areas. If access to your room is needed, you will be contacted separately in advance.`,
    lettings:
      `🔑 A lettings viewing is taking place at ${prop} on ${d}${at}. A prospective new tenant will be shown around the communal areas. We appreciate your understanding and ask that shared spaces are kept tidy.`,
    landlord:
      `👤 Your landlord will be visiting ${prop} on ${d}${at}. This is a routine visit. Please ensure communal areas are accessible.`,
    cleaner:
      `🧹 A cleaner is scheduled to visit ${prop} on ${d}${at}. Please ensure communal areas are accessible and any personal items in shared spaces are moved out of the way.`,
    contractor:
      `⚡ A contractor is scheduled to visit ${prop} on ${d}${at} to carry out works. They will require access to communal areas. Please ensure the property is accessible at this time.`,
    utility:
      `🚰 A utility or gas engineer is visiting ${prop} on ${d}${at}. They may need access to meters, boilers, or appliances in communal areas. Please ensure access is available.`,
    pest_control:
      `🐛 A pest control visit has been arranged at ${prop} on ${d}${at}. The technician will require access to communal areas. Please keep food stored securely beforehand.`,
    fire_safety:
      `🔥 A fire safety inspection is scheduled at ${prop} on ${d}${at}. The engineer will check fire doors, smoke alarms, and emergency lighting throughout the property. Please ensure access to all areas.`,
    manager_visit:
      `📋 Your property manager will be visiting ${prop} on ${d}${at}. This is a routine visit to check on the property and address any concerns. No specific action is needed from you.`,
    insurance:
      `🛡️ An insurance inspection is scheduled at ${prop} on ${d}${at}. The inspector will need access to communal areas. Please ensure these are accessible at the time of the visit.`,
  }

  return messages[type] || `An appointment has been scheduled at ${prop} on ${d}${at}.`
}

export default function AdminAddAppointmentModal({
  isOpen,
  onClose,
  onSuccess,
}: AdminAddAppointmentModalProps) {
  const [step, setStep] = useState<'type' | 'details'>('type')
  const [selectedType, setSelectedType] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [time, setTime] = useState('10:00')
  const [property, setProperty] = useState('')
  const [notes, setNotes] = useState('')
  const [notifyTenants, setNotifyTenants] = useState(true)
  const [properties, setProperties] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [visitorName, setVisitorName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notificationMessage, setNotificationMessage] = useState('')
  const [messageCustomised, setMessageCustomised] = useState(false)

  // Auto-generate notification message whenever key fields change
  useEffect(() => {
    if (!notifyTenants || !selectedType) return
    if (messageCustomised) return // user has edited manually — don't clobber
    const propertyName = properties.find((p) => p.id === property)?.name || ''
    setNotificationMessage(generateDefaultMessage(selectedType, date, time, propertyName))
  }, [notifyTenants, selectedType, date, time, property, properties, messageCustomised])

  if (!isOpen) return null

  const handleTypeSelect = async (typeId: string) => {
    setSelectedType(typeId)
    setMessageCustomised(false)
    const supabase = createClient()
    const { data } = await supabase.from('properties').select('id, name').order('name')
    setProperties(data || [])
    setStep('details')
  }

  const handlePropertyChange = async (propId: string) => {
    setProperty(propId)
    setSelectedRoomId('')
    if (selectedType === 'lettings' && propId) {
      const supabase = createClient()
      const { data } = await supabase
        .from('rooms')
        .select('id, name, status')
        .eq('property_id', propId)
        .in('status', ['available', 'on_notice'])
        .order('name')
      setRooms(data || [])
    } else {
      setRooms([])
    }
  }

  const handleMessageChange = (val: string) => {
    setNotificationMessage(val)
    setMessageCustomised(true)
  }

  const handleResetMessage = () => {
    setMessageCustomised(false)
    const propertyName = properties.find((p) => p.id === property)?.name || ''
    setNotificationMessage(generateDefaultMessage(selectedType, date, time, propertyName))
  }

  const handleSubmit = async () => {
    if (!selectedType || !date || !time || !property) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()

      const { error: err } = await supabase.from('admin_appointments').insert({
        type: selectedType,
        appointment_date: date,
        appointment_time: time,
        property_id: property,
        notes: notes || null,
        notify_tenants: notifyTenants,
        notification_message: notifyTenants ? notificationMessage : null,
        created_at: new Date().toISOString(),
      })

      if (err) throw err

      // For lettings viewings, also create a viewings record so it appears in the lettings diary
      if (selectedType === 'lettings' && property) {
        await supabase.from('viewings').insert({
          property_id: property,
          room_id: selectedRoomId || null,
          viewing_date: date,
          viewing_slot: time,
          visitor_name: visitorName.trim() || 'TBC',
          viewing_status: 'pending',
        })
      }

      setError('')
      onSuccess?.()
      onClose()
      // Reset form
      setStep('type')
      setSelectedType('')
      setDate(new Date().toISOString().split('T')[0])
      setTime('10:00')
      setProperty('')
      setRooms([])
      setSelectedRoomId('')
      setVisitorName('')
      setNotes('')
      setNotifyTenants(true)
      setNotificationMessage('')
      setMessageCustomised(false)
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  if (step === 'type') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-lg">
          <h2 className="text-xl font-bold text-neutral-900 mb-lg">Select Appointment Type</h2>

          <div className="grid grid-cols-2 gap-md">
            {APPOINTMENT_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => handleTypeSelect(type.id)}
                className="rounded-lg border-2 border-neutral-200 bg-white p-lg text-left hover:border-blue-500 hover:bg-blue-50 transition-all"
              >
                <div className="text-2xl mb-md">{type.icon}</div>
                <div className="font-semibold text-neutral-900">{type.label}</div>
              </button>
            ))}
          </div>

          <div className="flex gap-sm mt-lg pt-lg border-t">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 py-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  const selectedTypeLabel = APPOINTMENT_TYPES.find((t) => t.id === selectedType)?.label || ''
  const selectedPropertyName = properties.find((p) => p.id === property)?.name || ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
        <h2 className="text-xl font-bold text-neutral-900 mb-md">{selectedTypeLabel}</h2>
        <p className="text-sm text-neutral-600 mb-lg">Schedule appointment details</p>

        <div className="space-y-md">
          {/* Date */}
          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-sm">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setMessageCustomised(false) }}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
          </div>

          {/* Time */}
          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-sm">Time *</label>
            <input
              type="time"
              value={time}
              onChange={(e) => { setTime(e.target.value); setMessageCustomised(false) }}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
          </div>

          {/* Property */}
          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-sm">Property *</label>
            <select
              value={property}
              onChange={(e) => { handlePropertyChange(e.target.value); setMessageCustomised(false) }}
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

          {/* Lettings-specific: room + visitor name */}
          {selectedType === 'lettings' && (
            <>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Room</label>
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                >
                  <option value="">— Select available room —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-sm">Applicant name</label>
                <input
                  type="text"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                />
              </div>
            </>
          )}

          {/* Internal notes */}
          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-xs">
              Internal notes
            </label>
            <p className="text-xs text-neutral-500 mb-sm">Not sent to tenants — for your records only</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. bring ladder, check boiler pressure, key safe code 1234"
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
          </div>

          {/* Notify tenants toggle */}
          <div className="flex items-center gap-md pt-xs">
            <input
              type="checkbox"
              id="notify"
              checked={notifyTenants}
              onChange={(e) => setNotifyTenants(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="notify" className="text-sm font-semibold text-neutral-900">
              Notify tenants of this appointment
            </label>
          </div>

          {/* Notification preview — only shown when notifyTenants is checked */}
          {notifyTenants && (
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-md space-y-sm">
              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">
                  📨 Tenant notification preview
                </p>
                {messageCustomised && (
                  <button
                    type="button"
                    onClick={handleResetMessage}
                    className="text-xs text-blue-600 underline hover:text-blue-800"
                  >
                    Reset to default
                  </button>
                )}
              </div>

              {/* Editable message */}
              <textarea
                value={notificationMessage}
                onChange={(e) => handleMessageChange(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-blue-300 bg-white px-md py-sm text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Notification message will appear here once you select a property…"
              />

              {/* Delivery info */}
              <div className="rounded-lg bg-white border border-blue-200 px-md py-sm space-y-xs">
                <p className="text-xs font-semibold text-neutral-700">This will be sent to:</p>
                <p className="text-xs text-neutral-600">
                  👥 All current tenants at{' '}
                  <span className="font-semibold">{selectedPropertyName || 'the selected property'}</span>
                </p>
                <p className="text-xs font-semibold text-neutral-700 pt-xs">Via:</p>
                <div className="flex flex-wrap gap-sm">
                  <span className="rounded-full bg-blue-100 px-sm py-xs text-xs font-semibold text-blue-800">
                    📱 Push notification
                  </span>
                  <span className="rounded-full bg-blue-100 px-sm py-xs text-xs font-semibold text-blue-800">
                    💬 In-app message
                  </span>
                </div>
                <p className="text-xs text-neutral-500 pt-xs">
                  Tenants will see this in their Messages section on their dashboard.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-md text-sm font-semibold text-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-sm pt-md">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-sm font-bold text-white disabled:opacity-50 hover:bg-blue-700"
            >
              {loading ? 'Creating…' : 'Create Appointment'}
            </button>
            <button
              onClick={() => { setStep('type'); setError('') }}
              className="flex-1 rounded-lg border border-neutral-300 py-sm font-semibold"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

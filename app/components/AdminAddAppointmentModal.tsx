'use client'

import { useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleTypeSelect = async (typeId: string) => {
    setSelectedType(typeId)
    // Load properties on type select
    const supabase = createClient()
    const { data } = await supabase
      .from('properties')
      .select('id, name')
      .order('name')
    setProperties(data || [])
    setStep('details')
  }

  const handleSubmit = async () => {
    if (!selectedType || !date || !time || !property) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()

      // Create appointment in admin_appointments table
      const { error: err } = await supabase
        .from('admin_appointments')
        .insert({
          type: selectedType,
          appointment_date: date,
          appointment_time: time,
          property_id: property,
          notes: notes || null,
          notify_tenants: notifyTenants,
          created_at: new Date().toISOString(),
        })

      if (err) throw err

      setError('')
      onSuccess?.()
      onClose()
      // Reset form
      setStep('type')
      setSelectedType('')
      setDate(new Date().toISOString().split('T')[0])
      setTime('10:00')
      setProperty('')
      setNotes('')
      setNotifyTenants(true)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
        <h2 className="text-xl font-bold text-neutral-900 mb-md">{selectedTypeLabel}</h2>
        <p className="text-sm text-neutral-600 mb-lg">Schedule appointment details</p>

        <div className="space-y-md">
          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-sm">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-sm">Time *</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-sm">Property *</label>
            <select
              value={property}
              onChange={(e) => setProperty(e.target.value)}
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
            <label className="block text-sm font-bold text-neutral-900 mb-sm">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
          </div>

          <div className="flex items-center gap-md">
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
              {loading ? 'Creating...' : 'Create Appointment'}
            </button>
            <button
              onClick={() => {
                setStep('type')
                setError('')
              }}
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

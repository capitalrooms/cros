'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface AssignJobModalProps {
  propertyId: string
  properties: any[]
  cleaners: any[]
  onClose: () => void
  onSuccess: () => void
}

export default function AssignJobModal({
  propertyId,
  properties,
  cleaners,
  onClose,
  onSuccess,
}: AssignJobModalProps) {
  const [form, setForm] = useState({
    room_id: '',
    cleaner_id: '',
    task_type: 'normal',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const property = properties.find((p) => p.id === propertyId)

  async function handleAssign() {
    if (!form.room_id || !form.cleaner_id) {
      setError('Please select a room and cleaner')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/jobs/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          room_id: form.room_id,
          cleaner_id: form.cleaner_id,
          task_type: form.task_type,
          notes: form.notes || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to assign job')
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
        <h2 className="text-xl font-bold text-neutral-900 mb-md">📌 Assign Cleaning Task</h2>

        <div className="space-y-md">
          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-md">Room *</label>
            <select
              value={form.room_id}
              onChange={(e) => setForm({ ...form, room_id: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            >
              <option value="">Select a room</option>
              {property?.rooms?.map((room: any) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-md">Cleaner *</label>
            <select
              value={form.cleaner_id}
              onChange={(e) => setForm({ ...form, cleaner_id: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            >
              <option value="">Select a cleaner</option>
              {cleaners.map((cleaner: any) => (
                <option key={cleaner.id} value={cleaner.id}>
                  {cleaner.email.split('@')[0]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-md">Priority</label>
            <div className="flex gap-sm">
              {['normal', 'urgent', 'asap'].map((type) => (
                <button
                  key={type}
                  onClick={() => setForm({ ...form, task_type: type })}
                  className={`flex-1 rounded-lg px-md py-sm text-xs font-bold transition-colors ${
                    form.task_type === type
                      ? type === 'asap'
                        ? 'bg-red-600 text-white'
                        : type === 'urgent'
                        ? 'bg-orange-600 text-white'
                        : 'bg-blue-600 text-white'
                      : 'border border-neutral-300 text-neutral-700'
                  }`}
                >
                  {type === 'asap' ? '🚨 ASAP' : type === 'urgent' ? '⚠️ Urgent' : '📌 Normal'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-md">Notes (Optional)</label>
            <textarea
              placeholder="e.g., Tenant moving out, emergency spill, post-viewing clean"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
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
              onClick={handleAssign}
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-500 py-sm font-bold text-white disabled:opacity-50 hover:bg-blue-600"
            >
              {saving ? 'Assigning...' : 'Assign Task'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 py-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

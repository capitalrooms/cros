'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Viewing {
  id: string
  viewing_date: string
  viewing_slot: string | null
  visitor_name: string
  visitor_email: string | null
  visitor_phone: string | null
  room_id: string | null
  feedback: string | null
  status: string
  created_at: string
  room?: {
    name: string
  }
}

interface LettingsTabProps {
  propertyId: string
  rooms: Array<{ id: string; name: string }>
}

export default function LettingsTab({ propertyId, rooms }: LettingsTabProps) {
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddingViewing, setIsAddingViewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    visitor_name: '',
    visitor_email: '',
    visitor_phone: '',
    viewing_date: new Date().toISOString().split('T')[0],
    viewing_slot: '09:00',
    room_id: rooms[0]?.id || '',
    feedback: ''
  })

  const supabase = createClient()

  useEffect(() => {
    loadViewings()
  }, [propertyId])

  async function loadViewings() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('viewings')
      .select('*, room:room_id(name)')
      .eq('property_id', propertyId)
      .gte('viewing_date', new Date().toISOString().split('T')[0])
      .order('viewing_date', { ascending: true })
      .limit(30)

    if (err) {
      setError('Failed to load viewings')
      console.error(err)
    } else {
      setViewings(data || [])
    }
    setLoading(false)
  }

  async function handleAddViewing() {
    if (!formData.visitor_name.trim()) {
      setError('Visitor name is required')
      return
    }

    if (!formData.viewing_date) {
      setError('Date is required')
      return
    }

    const { data, error: err } = await supabase
      .from('viewings')
      .insert({
        property_id: propertyId,
        visitor_name: formData.visitor_name,
        visitor_email: formData.visitor_email || null,
        visitor_phone: formData.visitor_phone || null,
        viewing_date: formData.viewing_date,
        viewing_slot: formData.viewing_slot || null,
        room_id: formData.room_id || null,
        status: 'pending',
        feedback: formData.feedback || null
      })
      .select()

    if (err) {
      setError('Failed to schedule viewing')
      console.error(err)
      return
    }

    if (data) {
      setViewings([...viewings, data[0]])
      setFormData({
        visitor_name: '',
        visitor_email: '',
        visitor_phone: '',
        viewing_date: new Date().toISOString().split('T')[0],
        viewing_slot: '09:00',
        room_id: rooms[0]?.id || '',
        feedback: ''
      })
      setIsAddingViewing(false)
      setSuccess(`Viewing scheduled for ${formData.visitor_name}`)
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  const upcomingViewings = viewings.filter(v => !v.status || v.status !== 'closed')
  const completedViewings = viewings.filter(v => v.status === 'closed')

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'interested': return 'bg-green-100 text-green-700'
      case 'not_interested': return 'bg-red-100 text-red-700'
      case 'pending': return 'bg-blue-100 text-blue-700'
      case 'closed': return 'bg-neutral-900 text-neutral-400'
      default: return 'bg-neutral-900 text-neutral-400'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'interested': return 'Interested'
      case 'not_interested': return 'Not Interested'
      case 'pending': return 'Pending'
      case 'closed': return 'Closed'
      default: return 'Pending'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-xl">
        <div className="text-sm text-neutral-400">Loading viewings...</div>
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Lettings</h2>
          <p className="text-sm text-neutral-400 mt-xs">Manage property viewings and track leads</p>
        </div>
        <button
          onClick={() => setIsAddingViewing(true)}
          className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
        >
          + Schedule Viewing
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-lg rounded-lg bg-red-950 border border-red-800">
          <p className="text-sm font-semibold text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-lg rounded-lg bg-green-950 border border-green-800">
          <p className="text-sm font-semibold text-green-400">✓ {success}</p>
        </div>
      )}

      {/* Add Viewing Modal */}
      {isAddingViewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-950 rounded-xl shadow-lg p-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-lg">Schedule New Viewing</h3>

            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Visitor Name *
                </label>
                <input
                  type="text"
                  value={formData.visitor_name}
                  onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })}
                  placeholder="e.g., Sarah Johnson"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.visitor_email}
                  onChange={(e) => setFormData({ ...formData, visitor_email: e.target.value })}
                  placeholder="sarah@example.com"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.visitor_phone}
                  onChange={(e) => setFormData({ ...formData, visitor_phone: e.target.value })}
                  placeholder="+44 7123 456789"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Room
                </label>
                <select
                  value={formData.room_id}
                  onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a room...</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={formData.viewing_date}
                    onChange={(e) => setFormData({ ...formData, viewing_date: e.target.value })}
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Time
                  </label>
                  <input
                    type="time"
                    value={formData.viewing_slot}
                    onChange={(e) => setFormData({ ...formData, viewing_slot: e.target.value })}
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Notes
                </label>
                <textarea
                  value={formData.feedback}
                  onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
                  placeholder="Any special notes about this viewing..."
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-md mt-lg">
              <button
                onClick={() => {
                  setIsAddingViewing(false)
                  setError(null)
                }}
                className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddViewing}
                className="flex-1 px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Viewings */}
      <div>
        <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
          📅 Upcoming Viewings ({upcomingViewings.length})
        </h3>

        {upcomingViewings.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
            <div className="text-3xl mb-md opacity-50">👀</div>
            <p className="text-sm font-semibold text-white mb-md">No viewings scheduled</p>
            <p className="text-xs text-neutral-400 mb-lg">Schedule your first viewing to start tracking leads</p>
            <button
              onClick={() => setIsAddingViewing(true)}
              className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition mx-auto"
            >
              + Schedule Viewing
            </button>
          </div>
        ) : (
          <div className="space-y-md">
            {upcomingViewings.map((viewing) => (
              <div key={viewing.id} className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg hover:shadow-md transition">
                <div className="flex items-start justify-between gap-lg mb-md">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{viewing.visitor_name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">
                      {formatDate(viewing.viewing_date)}
                      {viewing.viewing_slot && ` at ${viewing.viewing_slot}`}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-md py-sm rounded-full whitespace-nowrap ${getStatusColor(viewing.status)}`}>
                    {getStatusLabel(viewing.status)}
                  </span>
                </div>

                {viewing.room && (
                  <p className="text-xs text-neutral-400 mb-md">📍 {viewing.room.name}</p>
                )}

                <div className="flex flex-wrap gap-md text-xs mb-md">
                  {viewing.visitor_email && (
                    <button
                      onClick={() => navigator.clipboard.writeText(viewing.visitor_email || '')}
                      className="text-blue-400 hover:text-blue-300 font-semibold"
                      title="Click to copy"
                    >
                      📧 {viewing.visitor_email}
                    </button>
                  )}
                  {viewing.visitor_phone && (
                    <button
                      onClick={() => navigator.clipboard.writeText(viewing.visitor_phone || '')}
                      className="text-blue-400 hover:text-blue-300 font-semibold"
                      title="Click to copy"
                    >
                      📱 {viewing.visitor_phone}
                    </button>
                  )}
                </div>

                {viewing.feedback && (
                  <p className="text-xs text-neutral-400 mb-md italic">💬 {viewing.feedback}</p>
                )}

                <div className="flex gap-sm">
                  <button className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                    Update Status
                  </button>
                  <button className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                    Send Follow-up
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Viewings */}
      {completedViewings.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
            ✅ Completed ({completedViewings.length})
          </h3>

          <div className="space-y-md">
            {completedViewings.map((viewing) => (
              <div key={viewing.id} className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg">
                <div className="flex items-start justify-between gap-lg">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{viewing.visitor_name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{formatDate(viewing.viewing_date)}</p>
                  </div>
                  <span className={`text-xs font-semibold px-md py-sm rounded-full ${getStatusColor(viewing.status)}`}>
                    {getStatusLabel(viewing.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface MapEvent {
  id: string
  type: 'maintenance' | 'clean' | 'appointment'
  property: { name: string; address: string; lat?: number; lng?: number }
  person_name: string
  time: string
  title: string
}

export default function TodayAppointmentsMap() {
  const [events, setEvents] = useState<MapEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<MapEvent | null>(null)

  useEffect(() => {
    async function loadTodayEvents() {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      try {
        // Load maintenance jobs for today
        const { data: maint } = await supabase
          .from('maintenance_tickets')
          .select('*, properties(name, address)')
          .eq('booked_date', today)
          .not('booked_date', 'is', null)

        // Load cleans for today
        const { data: cleans } = await supabase
          .from('cleans')
          .select('*, properties(name, address), cleaner:cleaner_id(full_name)')
          .eq('clean_date', today)
          .not('clean_date', 'is', null)

        // Load appointments for today
        const { data: appts } = await supabase
          .from('property_appointments')
          .select('*, properties(name, address)')
          .eq('appointment_date', today)

        const mappedEvents: MapEvent[] = [
          ...(maint || []).map((m: any) => ({
            id: m.id,
            type: 'maintenance',
            property: m.properties,
            person_name: m.contractor?.full_name || 'Unassigned',
            time: m.booked_slot || '09:00',
            title: m.title,
          })),
          ...(cleans || []).map((c: any) => ({
            id: c.id,
            type: 'clean',
            property: c.properties,
            person_name: c.cleaner?.full_name || 'Unassigned',
            time: c.clean_time || '09:00',
            title: 'Cleaning',
          })),
          ...(appts || []).map((a: any) => ({
            id: a.id,
            type: 'appointment',
            property: a.properties,
            person_name: a.visitor_name,
            time: a.appointment_time,
            title: a.appointment_type,
          })),
        ]

        setEvents(mappedEvents)
      } catch (error) {
        console.error('Error loading today events:', error)
      }

      setLoading(false)
    }

    loadTodayEvents()
  }, [])

  if (loading) {
    return <div className="h-64 bg-slate-100 animate-pulse rounded-lg" />
  }

  if (events.length === 0) {
    return (
      <div className="h-64 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-sm">📅</div>
          <div className="text-slate-600">No appointments scheduled for today</div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-lg py-md text-white font-bold">
        📍 Today's Visits ({events.length})
      </div>

      {/* Map Area (Placeholder - Shows address cards instead of actual map) */}
      <div className="h-64 bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
        <div className="p-md space-y-sm">
          {events.map((event, idx) => (
            <button
              key={event.id}
              onClick={() => setSelectedEvent(event)}
              className={`w-full text-left px-md py-md rounded-lg border-l-4 transition-all ${
                selectedEvent?.id === event.id
                  ? 'bg-blue-50 border-blue-500 shadow-md'
                  : 'bg-white border-slate-300 hover:border-blue-400 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-md">
                <div className="text-lg mt-sm">
                  {event.type === 'maintenance' && '🔧'}
                  {event.type === 'clean' && '🧹'}
                  {event.type === 'appointment' && '📋'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm">{event.person_name}</div>
                  <div className="text-xs text-slate-600 mt-xs truncate">📍 {event.property.address}</div>
                  <div className="text-xs text-slate-500 mt-xs">⏰ {event.time}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Details Panel */}
      {selectedEvent && (
        <div className="border-t border-slate-200 bg-blue-50 p-md">
          <div className="space-y-sm">
            <div>
              <div className="text-xs font-bold text-blue-900 uppercase">Location</div>
              <div className="text-sm text-blue-900 font-semibold mt-xs">{selectedEvent.property.name}</div>
              <div className="text-xs text-blue-800">{selectedEvent.property.address}</div>
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div>
                <div className="text-xs font-bold text-blue-900 uppercase">Person</div>
                <div className="text-sm text-blue-900 font-semibold mt-xs">{selectedEvent.person_name}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-blue-900 uppercase">Time</div>
                <div className="text-sm text-blue-900 font-semibold mt-xs">
                  {selectedEvent.time}
                  {selectedEvent.type === 'appointment' && ' (1h)'}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-blue-900 uppercase">Type</div>
              <div className="text-sm text-blue-900 font-semibold mt-xs">
                {selectedEvent.type === 'maintenance' && `🔧 ${selectedEvent.title}`}
                {selectedEvent.type === 'clean' && '🧹 Cleaning Service'}
                {selectedEvent.type === 'appointment' && `📋 ${selectedEvent.title}`}
              </div>
            </div>

            {/* Google Maps Link */}
            <button
              onClick={() => {
                const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(selectedEvent.property.address)}`
                window.open(mapsUrl, '_blank')
              }}
              className="w-full mt-md px-md py-sm rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              📍 Open in Google Maps
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

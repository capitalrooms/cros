'use client'

import { useEffect, useRef } from 'react'

interface MapEvent {
  id: string
  type: 'maintenance' | 'clean' | 'appointment'
  property: { name: string; address: string }
  person_name: string
  time: string
  title: string
}

interface AgencyDiaryMapProps {
  events: MapEvent[]
}

export default function AgencyDiaryMap({ events }: AgencyDiaryMapProps) {
  return (
    <div className="space-y-lg">
      {/* Google Maps Embed */}
      <div className="w-full rounded-lg border border-neutral-200 overflow-hidden shadow-sm">
        <iframe
          width="100%"
          height="500"
          style={{ border: 'none' }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2481.3752348117744!2d-0.08659922346810675!3d51.52466907179877!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x48761ca34b6e2cd9%3A0x4f8c3c7e5e5e5e5e!2s66%20Paul%20Street%2C%20London%20EC2A%204NA!5e0!3m2!1sen!2suk!4v1692374400000"
        />
      </div>

      {/* Events List */}
      {events.length > 0 && (
        <div className="space-y-sm">
          <h3 className="font-bold text-neutral-900 text-sm">
            Scheduled Today ({events.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {events.map((event, index) => (
              <div
                key={event.id}
                className="p-md rounded-lg border border-neutral-200 bg-white hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-md">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{
                      backgroundColor:
                        event.type === 'maintenance'
                          ? '#3b82f6'
                          : event.type === 'clean'
                          ? '#10b981'
                          : '#f59e0b',
                    }}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-neutral-900 text-sm">
                      {event.person_name}
                    </div>
                    <div className="text-xs text-neutral-600 mt-xs">
                      📍 {event.property.address}
                    </div>
                    <div className="text-xs text-neutral-500 mt-xs">
                      ⏰ {event.time} • {event.title}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center py-lg">
          <div className="text-neutral-600 text-sm">
            Book appointments to see them listed here.
          </div>
        </div>
      )}
    </div>
  )
}

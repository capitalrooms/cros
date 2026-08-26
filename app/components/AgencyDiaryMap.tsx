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
  const mapContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapContainer.current) return

    // Create a container for the map
    mapContainer.current.innerHTML = `
      <div id="map" style="width: 100%; height: 500px;"></div>
    `

    // Load Leaflet dynamically
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      // @ts-ignore
      const L = window.L
      const map = L.map('map').setView([51.5247, -0.0866], 15)

      // Use CartoDB Positron (clean, minimal style, no business labels)
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20,
        }
      ).addTo(map)

      // Add Capital Rooms marker
      L.circleMarker([51.5247, -0.0866], {
        radius: 12,
        fillColor: '#1e293b',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup('Capital Rooms HQ')
    }

    return () => {
      document.head.removeChild(link)
    }
  }, [])

  return (
    <div className="space-y-lg">
      {/* Leaflet Map */}
      <div
        ref={mapContainer}
        className="w-full rounded-lg border border-neutral-200 overflow-hidden shadow-sm"
        style={{ minHeight: '500px' }}
      />

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
                      📍 {event.property?.address || '—'}
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

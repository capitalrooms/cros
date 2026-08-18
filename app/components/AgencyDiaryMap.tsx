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

// Capital Rooms: 66 Paul Street, EC2A 4NA (Shoreditch, London)
const CAPITAL_ROOMS = { lat: 51.5247, lng: -0.0866 }
// Map bounds for London (Shoreditch area)
const MAP_BOUNDS = { north: 51.535, south: 51.515, east: -0.070, west: -0.100 }

export default function AgencyDiaryMap({ events }: AgencyDiaryMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapContainer.current) return

    const canvas = document.createElement('canvas')
    canvas.width = mapContainer.current.offsetWidth
    canvas.height = 500

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // === Draw Realistic London Map Background ===
    // Base colors for different areas
    const roadColor = '#e5e7eb'
    const parkColor = '#c7e9c4'
    const waterColor = '#bfe5f0'
    const buildingColor = '#d4d4d8'

    // Fill background
    ctx.fillStyle = roadColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // === Draw Parks/Green Spaces ===
    ctx.fillStyle = parkColor
    // Shoreditch Park area
    ctx.beginPath()
    ctx.arc(canvas.width * 0.3, canvas.height * 0.25, 45, 0, Math.PI * 2)
    ctx.fill()

    // Hackney area park
    ctx.beginPath()
    ctx.arc(canvas.width * 0.15, canvas.height * 0.7, 50, 0, Math.PI * 2)
    ctx.fill()

    // === Draw Water (River) ===
    ctx.fillStyle = waterColor
    ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4)

    // === Draw Streets as Grid ===
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = 1

    // Major streets (thicker)
    ctx.strokeStyle = '#6b7280'
    ctx.lineWidth = 2
    // Old Street (horizontal)
    ctx.beginPath()
    ctx.moveTo(0, canvas.height * 0.35)
    ctx.lineTo(canvas.width, canvas.height * 0.35)
    ctx.stroke()

    // Shoreditch High Street (diagonal)
    ctx.beginPath()
    ctx.moveTo(canvas.width * 0.2, 0)
    ctx.lineTo(canvas.width * 0.6, canvas.height)
    ctx.stroke()

    // City Road (vertical-ish)
    ctx.beginPath()
    ctx.moveTo(canvas.width * 0.35, 0)
    ctx.lineTo(canvas.width * 0.4, canvas.height)
    ctx.stroke()

    // === Draw Minor Streets ===
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 1

    const streetSpacing = 60
    for (let x = 0; x < canvas.width; x += streetSpacing) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += streetSpacing) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // === Draw Buildings/Districts ===
    ctx.fillStyle = '#f3f4f6'
    // Tech district buildings
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(
        canvas.width * 0.4 + i * 80,
        canvas.height * 0.2 + (i % 2) * 40,
        60,
        30
      )
    }

    // === Convert Lat/Lng to Canvas Coordinates ===
    const latToY = (lat: number) => {
      const range = MAP_BOUNDS.north - MAP_BOUNDS.south
      const offset = MAP_BOUNDS.north - lat
      return (offset / range) * canvas.height
    }

    const lngToX = (lng: number) => {
      const range = MAP_BOUNDS.east - MAP_BOUNDS.west
      const offset = lng - MAP_BOUNDS.west
      return (offset / range) * canvas.width
    }

    // === Draw Capital Rooms HQ (Primary Location) ===
    const hqX = lngToX(CAPITAL_ROOMS.lng)
    const hqY = latToY(CAPITAL_ROOMS.lat)

    // Glow effect
    ctx.shadowColor = 'rgba(59, 130, 246, 0.4)'
    ctx.shadowBlur = 20
    ctx.fillStyle = '#3b82f6'
    ctx.beginPath()
    ctx.arc(hqX, hqY, 14, 0, Math.PI * 2)
    ctx.fill()

    // Main marker
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(hqX, hqY, 9, 0, Math.PI * 2)
    ctx.fill()

    // Icon
    ctx.fillStyle = '#3b82f6'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🏢', hqX, hqY)

    // === Draw Appointment Markers ===
    events.forEach((event, index) => {
      // Distribute around HQ
      const angle = (index / Math.max(events.length, 1)) * Math.PI * 2
      const radius = 40 + (index % 3) * 30
      const x = hqX + Math.cos(angle) * radius
      const y = hqY + Math.sin(angle) * radius

      const color =
        event.type === 'maintenance'
          ? '#3b82f6'
          : event.type === 'clean'
          ? '#10b981'
          : '#f59e0b'

      // Glow
      ctx.shadowColor = `${color}40`
      ctx.shadowBlur = 12
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 11, 0, Math.PI * 2)
      ctx.fill()

      // Inner circle
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.fill()

      // Number
      ctx.fillStyle = color
      ctx.font = 'bold 8px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1), x, y)
    })

    // === Draw Map Chrome/Controls ===
    // Top-left: Zoom
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2
    ctx.fillRect(16, 16, 36, 60)
    ctx.shadowColor = 'transparent'

    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('+', 34, 27)
    ctx.font = '12px sans-serif'
    ctx.fillText('−', 34, 50)

    // Top-right: Location badge
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2
    ctx.fillRect(canvas.width - 200, 16, 184, 60)
    ctx.shadowColor = 'transparent'

    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📍 Shoreditch', canvas.width - 188, 32)
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#6b7280'
    ctx.fillText('66 Paul Street, EC2A 4NA', canvas.width - 188, 48)

    // Bottom-left: Legend
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2
    ctx.fillRect(16, canvas.height - 120, 168, 104)
    ctx.shadowColor = 'transparent'

    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Appointments', 26, canvas.height - 103)

    const legend = [
      { color: '#3b82f6', label: 'Headquarters' },
      { color: '#3b82f6', label: 'Maintenance' },
      { color: '#10b981', label: 'Cleaning' },
      { color: '#f59e0b', label: 'Viewings' },
    ]

    legend.forEach((item, i) => {
      ctx.fillStyle = item.color
      ctx.beginPath()
      ctx.arc(26, canvas.height - 78 + i * 18, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#4b5563'
      ctx.font = '9px sans-serif'
      ctx.fillText(item.label, 39, canvas.height - 75 + i * 18)
    })

    // Add canvas to container
    mapContainer.current.innerHTML = ''
    mapContainer.current.appendChild(canvas)
  }, [events])

  return (
    <div className="space-y-lg">
      {/* Map Canvas */}
      <div
        ref={mapContainer}
        className="w-full bg-gray-100 rounded-lg border border-neutral-200 overflow-hidden shadow-sm"
        style={{ minHeight: '500px' }}
      />

      {/* Appointments List (if any booked) */}
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

      {/* Empty State */}
      {events.length === 0 && (
        <div className="text-center py-lg">
          <div className="text-neutral-600 text-sm">
            Map shows Capital Rooms HQ in Shoreditch and the surrounding service area. Book appointments to see them pinned here.
          </div>
        </div>
      )}
    </div>
  )
}

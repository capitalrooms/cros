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

// Capital Rooms office: 66 Paul Street, EC2A 4NA (Shoreditch, London)
const CAPITAL_ROOMS = { lat: 51.5247, lng: -0.0866, name: 'Capital Rooms HQ' }
const MAP_BOUNDS = { north: 51.535, south: 51.515, east: -0.075, west: -0.098 }

export default function AgencyDiaryMap({ events }: AgencyDiaryMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapContainer.current) return

    const canvas = document.createElement('canvas')
    canvas.width = mapContainer.current.offsetWidth
    canvas.height = 500

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // === Map Background & Grid ===
    // Base map color (light gray - streets/background)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, '#f5f5f5')
    gradient.addColorStop(1, '#e8e8e8')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw subtle street grid
    ctx.strokeStyle = '#d0d0d0'
    ctx.lineWidth = 0.5
    const gridSize = 40
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // Draw water/park areas (light blue rectangles)
    ctx.fillStyle = '#e8f4f8'
    ctx.fillRect(canvas.width * 0.15, canvas.height * 0.2, 80, 60)
    ctx.fillRect(canvas.width * 0.7, canvas.height * 0.6, 90, 70)

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

    // === Draw Capital Rooms Headquarters (Central Hub) ===
    const hqX = lngToX(CAPITAL_ROOMS.lng)
    const hqY = latToY(CAPITAL_ROOMS.lat)

    // HQ building (larger, prominent marker)
    ctx.fillStyle = '#1f2937'
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2

    // Draw HQ as a small building/marker
    ctx.beginPath()
    ctx.arc(hqX, hqY, 12, 0, Math.PI * 2)
    ctx.fill()

    // Inner white circle for contrast
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(hqX, hqY, 8, 0, Math.PI * 2)
    ctx.fill()

    // HQ icon (building)
    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🏢', hqX, hqY)

    ctx.shadowColor = 'transparent'

    // === Draw Appointment Markers ===
    events.forEach((event, index) => {
      // Pseudo-random position near HQ (in real app, would use actual property coordinates)
      const offsetX = (Math.sin(index) * 0.003) * canvas.width
      const offsetY = (Math.cos(index) * 0.003) * canvas.height
      const x = hqX + offsetX
      const y = hqY + offsetY

      const color =
        event.type === 'maintenance'
          ? '#3b82f6' // blue
          : event.type === 'clean'
          ? '#10b981' // green
          : '#f59e0b' // amber

      // Marker outer circle
      ctx.fillStyle = color
      ctx.shadowColor = 'rgba(0,0,0,0.2)'
      ctx.shadowBlur = 4
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 1

      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fill()

      // Inner white
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fill()

      // Number
      ctx.fillStyle = color
      ctx.font = 'bold 8px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1), x, y)

      ctx.shadowColor = 'transparent'
    })

    // === Map Controls & Info ===
    // Top-left: Zoom level
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.1)'
    ctx.shadowBlur = 4
    ctx.fillRect(12, 12, 40, 70)
    ctx.shadowColor = 'transparent'

    ctx.fillStyle = '#374151'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('+', 32, 25)
    ctx.font = '10px sans-serif'
    ctx.fillText('−', 32, 45)

    // Top-right: Location info
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.1)'
    ctx.shadowBlur = 4
    ctx.fillRect(canvas.width - 200, 12, 188, 50)
    ctx.shadowColor = 'transparent'

    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📍 Shoreditch, London', canvas.width - 190, 28)
    ctx.font = '9px sans-serif'
    ctx.fillStyle = '#6b7280'
    ctx.fillText('EC2A 4NA', canvas.width - 190, 42)

    // Bottom-left: Legend
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.1)'
    ctx.shadowBlur = 4
    ctx.fillRect(12, canvas.height - 110, 160, 98)
    ctx.shadowColor = 'transparent'

    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Appointments', 22, canvas.height - 93)

    const legendItems = [
      { color: '#1f2937', label: 'Headquarters' },
      { color: '#3b82f6', label: 'Maintenance' },
      { color: '#10b981', label: 'Cleaning' },
      { color: '#f59e0b', label: 'Viewing/Other' },
    ]

    legendItems.forEach((item, i) => {
      ctx.fillStyle = item.color
      ctx.beginPath()
      ctx.arc(22, canvas.height - 70 + i * 18, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#4b5563'
      ctx.font = '9px sans-serif'
      ctx.fillText(item.label, 35, canvas.height - 66 + i * 18)
    })

    // Add canvas to container
    mapContainer.current.innerHTML = ''
    mapContainer.current.appendChild(canvas)

    // Click handler for markers
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      events.forEach((event, index) => {
        const offsetX = (Math.sin(index) * 0.003) * canvas.width
        const offsetY = (Math.cos(index) * 0.003) * canvas.height
        const x = hqX + offsetX
        const y = hqY + offsetY
        const distance = Math.sqrt((clickX - x) ** 2 + (clickY - y) ** 2)

        if (distance < 15) {
          console.log(`Clicked: ${event.person_name} - ${event.property.address} at ${event.time}`)
        }
      })
    })
  }, [events])

  return (
    <div className="space-y-lg">
      {/* Map */}
      <div
        ref={mapContainer}
        className="w-full bg-gradient-to-b from-gray-100 to-gray-50 rounded-lg border border-neutral-200 overflow-hidden shadow-sm"
        style={{ minHeight: '500px' }}
      />

      {/* Events List */}
      {events.length > 0 && (
        <div className="space-y-sm">
          <h3 className="font-bold text-neutral-900 text-sm">
            Scheduled Appointments ({events.length})
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

      {/* Empty State Message */}
      {events.length === 0 && (
        <div className="text-center py-lg">
          <div className="text-neutral-600 text-sm">
            No appointments booked yet. The map above shows Capital Rooms HQ in Shoreditch and available service areas.
          </div>
        </div>
      )}
    </div>
  )
}

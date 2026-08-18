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

// Default center: Capital Rooms, 66 Paul Street, EC2A 4NA (Shoreditch, London)
const DEFAULT_CENTER = { lat: 51.5247, lng: -0.0866 }

export default function AgencyDiaryMap({ events }: AgencyDiaryMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)

  useEffect(() => {
    // Initialize map with Leaflet (open-source, no API key needed)
    // Using a simple tile provider
    if (!mapContainer.current) return

    // Create a simple SVG-based map view
    const canvas = document.createElement('canvas')
    canvas.width = mapContainer.current.offsetWidth
    canvas.height = 500

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw map background
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw grid
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, canvas.height)
      ctx.stroke()
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(canvas.width, i)
      ctx.stroke()
    }

    // Draw location markers
    const markerSize = 12
    events.forEach((event, index) => {
      // Pseudo-random position based on address hash
      const hashCode = event.property.address
        .split('')
        .reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)
      const x = ((hashCode % 100) / 100) * (canvas.width - 40) + 20
      const y = ((Math.floor(hashCode / 100) % 80) / 80) * (canvas.height - 40) + 20

      // Draw marker circle
      const color =
        event.type === 'maintenance'
          ? '#3b82f6' // blue
          : event.type === 'clean'
          ? '#10b981' // green
          : '#f59e0b' // amber

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, markerSize, 0, Math.PI * 2)
      ctx.fill()

      // Draw white center
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x, y, markerSize * 0.6, 0, Math.PI * 2)
      ctx.fill()

      // Draw label
      ctx.fillStyle = '#1f2937'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1), x, y)
    })

    // Draw legend
    ctx.fillStyle = 'white'
    ctx.fillRect(10, 10, 200, 80)
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 1
    ctx.strokeRect(10, 10, 200, 80)

    ctx.fillStyle = '#374151'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Appointments:', 20, 25)

    const legendItems = [
      { color: '#3b82f6', label: 'Maintenance' },
      { color: '#10b981', label: 'Cleaning' },
      { color: '#f59e0b', label: 'Appointment' },
    ]

    legendItems.forEach((item, i) => {
      ctx.fillStyle = item.color
      ctx.fillRect(20, 35 + i * 16, 10, 10)
      ctx.fillStyle = '#4b5563'
      ctx.font = '10px sans-serif'
      ctx.fillText(item.label, 35, 40 + i * 16)
    })

    // Add canvas to container
    mapContainer.current.innerHTML = ''
    mapContainer.current.appendChild(canvas)

    // Add click handler to show details
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      // Check which marker was clicked
      events.forEach((event, index) => {
        const hashCode = event.property.address
          .split('')
          .reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)
        const x = ((hashCode % 100) / 100) * (canvas.width - 40) + 20
        const y = ((Math.floor(hashCode / 100) % 80) / 80) * (canvas.height - 40) + 20

        const distance = Math.sqrt((clickX - x) ** 2 + (clickY - y) ** 2)
        if (distance < 20) {
          // Marker clicked
          const details = `${event.person_name} - ${event.property.address} at ${event.time}`
          console.log('Clicked appointment:', details)
        }
      })
    })
  }, [events])

  return (
    <div className="space-y-lg">
      {/* Map */}
      <div
        ref={mapContainer}
        className="w-full h-96 bg-slate-100 rounded-lg border border-slate-300 overflow-hidden"
      />

      {/* Events List */}
      {events.length > 0 && (
        <div className="space-y-sm">
          <h3 className="font-bold text-slate-900">Locations ({events.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {events.map((event, index) => (
              <div key={event.id} className="p-md rounded-lg border border-slate-300 bg-slate-50">
                <div className="flex items-start gap-md">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold mt-sm" style={{
                    backgroundColor:
                      event.type === 'maintenance'
                        ? '#3b82f6'
                        : event.type === 'clean'
                        ? '#10b981'
                        : '#f59e0b',
                  }}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 text-sm">{event.person_name}</div>
                    <div className="text-xs text-slate-600 mt-xs">📍 {event.property.address}</div>
                    <div className="text-xs text-slate-500 mt-xs">⏰ {event.time}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

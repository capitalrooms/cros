'use client'

import { useState } from 'react'
import { getTodayGMT, getDaysUntil, formatDateUK } from '@/lib/dateUtils'

interface CalendarAppointment {
  id: string
  title?: string
  property_name?: string
  room_name?: string
  booked_date?: string
  clean_date?: string
  viewing_date?: string
  appointment_date?: string
  start_time?: string
  duration_minutes?: number
  status?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
}

interface ThreeDayCalendarProps {
  appointments: CalendarAppointment[]
  role: 'cleaner' | 'contractor' | 'lettings' | 'admin'
  onAppointmentClick?: (appointment: CalendarAppointment) => void
}

export default function ThreeDayCalendar({
  appointments,
  role,
  onAppointmentClick,
}: ThreeDayCalendarProps) {
  const [currentDate, setCurrentDate] = useState(getTodayGMT())

  // Generate 3-day window: today + 2 days
  const dates = [0, 1, 2].map((offset) => {
    const d = new Date(`${currentDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + offset)
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  // Get date field based on role
  const getDateField = (appt: any): string | undefined => {
    if (role === 'cleaner') return appt.clean_date
    if (role === 'contractor') return appt.booked_date
    if (role === 'lettings') return appt.viewing_date
    return appt.appointment_date || appt.booked_date || appt.clean_date
  }

  // Filter appointments for each day
  const appointmentsByDay = dates.map((date) => {
    return appointments
      .filter((appt) => {
        const apptDate = getDateField(appt)
        return apptDate === date
      })
      .sort((a, b) => {
        const timeA = a.start_time || '00:00'
        const timeB = b.start_time || '00:00'
        return timeA.localeCompare(timeB)
      })
  })

  // Get color based on status/priority
  const getAppointmentColor = (appt: CalendarAppointment, dateStr: string): string => {
    const daysUntil = getDaysUntil(dateStr)

    if (daysUntil < 0) {
      return 'bg-red-900 text-white'
    } else if (daysUntil === 0) {
      return 'bg-blue-600 text-white'
    } else if (appt.priority === 'urgent' || appt.priority === 'high') {
      return 'bg-orange-600 text-white'
    } else if (appt.status === 'confirmed' || appt.status === 'completed') {
      return 'bg-green-600 text-white'
    } else {
      return 'bg-neutral-700 text-white'
    }
  }

  const handlePrevWeek = () => {
    const d = new Date(`${currentDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 3)
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    setCurrentDate(`${year}-${month}-${day}`)
  }

  const handleNextWeek = () => {
    const d = new Date(`${currentDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 3)
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    setCurrentDate(`${year}-${month}-${day}`)
  }

  // Time slots from 8am to 6pm
  const timeSlots = Array.from({ length: 22 }, (_, i) => {
    const hour = 8 + Math.floor(i / 2)
    const mins = i % 2 === 0 ? '00' : '30'
    return `${String(hour).padStart(2, '0')}:${mins}`
  })

  const getAppointmentPosition = (startTime?: string): { top: string; height: string } => {
    if (!startTime) return { top: '0', height: '60px' }

    const [hours, mins] = startTime.split(':').map(Number)
    const totalMins = hours * 60 + mins - 8 * 60 // Offset from 8am
    const topPercent = (totalMins / (10 * 60)) * 100 // 10 hours total

    return {
      top: `${topPercent}%`,
      height: `${Math.max(40, (60 / 60) * 100)}px`, // Min 40px height
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-neutral-950 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Your week</h2>
          <span className="text-xs text-neutral-400">
            {formatDateUK(dates[0])} – {formatDateUK(dates[2])}
          </span>
        </div>
      </div>

      {/* Day tabs */}
      <div className="grid grid-cols-3 border-b border-neutral-800">
        {dates.map((date, idx) => {
          const isToday = date === getTodayGMT()
          const dayLabel = formatDateUK(date)
          const parts = dayLabel.split(' ')
          const dayName = parts[0]
          const dayNum = parts[1]

          return (
            <button
              key={date}
              className={`border-r border-neutral-800 px-3 py-3 text-center text-xs font-semibold transition-colors ${
                isToday
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-900 text-white hover:bg-neutral-800'
              } ${idx === 2 ? 'border-r-0' : ''}`}
            >
              <div>{dayName}</div>
              <div className="text-xs font-normal text-neutral-300">{dayNum}</div>
              {appointmentsByDay[idx].length > 0 && (
                <div className="mt-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                  {appointmentsByDay[idx].length}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Time grid calendar */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hours header */}
          <div className="grid grid-cols-[60px_1fr_1fr_1fr] border-b border-neutral-800">
            <div className="px-2 py-2 text-xs font-semibold text-neutral-500">Time</div>
            {dates.map((_, idx) => (
              <div
                key={idx}
                className={`border-r border-neutral-800 px-2 py-2 text-xs font-semibold text-neutral-500 text-center ${
                  idx === 2 ? 'border-r-0' : ''
                }`}
              >
                {formatDateUK(dates[idx]).split(' ').join('\n')}
              </div>
            ))}
          </div>

          {/* Time slots */}
          <div className="grid grid-cols-[60px_1fr_1fr_1fr] bg-neutral-900">
            {timeSlots.map((time, timeIdx) => (
              <div key={time} className="contents">
                {/* Time label */}
                {timeIdx % 2 === 0 && (
                  <div className="border-r border-b border-neutral-800 px-2 py-2 text-xs text-neutral-500 font-semibold h-12">
                    {time}
                  </div>
                )}
                {timeIdx % 2 !== 0 && <div className="border-r border-b border-neutral-800 h-12"></div>}

                {/* Day columns */}
                {dates.map((date, dayIdx) => (
                  <div
                    key={`${date}-${time}`}
                    className={`border-r border-b border-neutral-800 relative h-12 ${
                      dayIdx === 2 ? 'border-r-0' : ''
                    }`}
                  >
                    {/* Render appointments starting at this time */}
                    {timeIdx % 2 === 0 &&
                      appointmentsByDay[dayIdx].map((appt) => {
                        if (appt.start_time !== time) return null

                        const duration = appt.duration_minutes || 60
                        const heightPx = Math.max(40, (duration / 30) * 24) // 24px per 30 mins

                        return (
                          <button
                            key={appt.id}
                            onClick={() => onAppointmentClick?.(appt)}
                            className={`absolute inset-x-0.5 left-1 right-1 text-xs p-1 rounded cursor-pointer overflow-hidden text-left truncate hover:shadow-lg transition-shadow ${getAppointmentColor(
                              appt,
                              date
                            )}`}
                            style={{
                              top: '2px',
                              height: `${heightPx}px`,
                            }}
                            title={`${appt.title || appt.property_name || 'Appointment'} at ${appt.start_time}`}
                          >
                            <div className="font-semibold truncate text-xs">
                              {appt.title || appt.property_name || 'Appt'}
                            </div>
                            {appt.room_name && (
                              <div className="text-xs opacity-80 truncate">{appt.room_name}</div>
                            )}
                          </button>
                        )
                      })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="grid grid-cols-2 gap-2 border-t border-neutral-800 p-4">
        <button
          onClick={handlePrevWeek}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          ← Prev
        </button>
        <button
          onClick={handleNextWeek}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          Next →
        </button>
      </div>
    </section>
  )
}

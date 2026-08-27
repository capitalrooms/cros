'use client'

import { useState } from 'react'
import { getTodayGMT, getDaysUntil, formatDateUK } from '@/lib/dateUtils'

interface CalendarAppointment {
  id: string
  title: string
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
  const getDateField = (appt: CalendarAppointment): string | undefined => {
    if (role === 'cleaner') return appt.clean_date
    if (role === 'contractor') return appt.booked_date
    if (role === 'lettings') return appt.viewing_date
    return appt.appointment_date || appt.booked_date || appt.clean_date
  }

  // Filter appointments for each day
  const appointmentsByDay = dates.map((date) => {
    return appointments.filter((appt) => {
      const apptDate = getDateField(appt)
      return apptDate === date
    })
  })

  // Count for each day
  const dayCounts = appointmentsByDay.map((appts) => appts.length)

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
              {dayCounts[idx] > 0 && (
                <div className="mt-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                  {dayCounts[idx]}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Calendar grid - simplified for now */}
      <div className="p-4 text-center text-sm text-neutral-400">
        <p>3-day calendar view (appointments will render here)</p>
        <div className="mt-4 space-y-2">
          {appointmentsByDay.map((dayAppts, idx) =>
            dayAppts.length > 0 ? (
              <div key={dates[idx]} className="rounded-lg bg-neutral-800 p-2">
                <p className="font-semibold text-white">{formatDateUK(dates[idx])}</p>
                <p className="text-xs text-neutral-300">{dayAppts.length} appointment(s)</p>
              </div>
            ) : null
          )}
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

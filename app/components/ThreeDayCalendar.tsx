'use client'

import { useState, useRef, useEffect } from 'react'
import { getTodayGMT, getDaysUntil, formatDateUK } from '@/lib/dateUtils'

interface CalendarAppointment {
  id: string
  title?: string
  property_name?: string
  property_id?: string
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

export interface RescheduleNotifyOpts {
  notify: boolean
  message: string
  propertyId: string
}

interface ThreeDayCalendarProps {
  appointments: CalendarAppointment[]
  role: 'cleaner' | 'contractor' | 'lettings' | 'admin'
  onAppointmentClick?: (appointment: CalendarAppointment) => void
  /** When provided, appointments are draggable (touch) and tappable to reschedule */
  onAppointmentReschedule?: (
    id: string,
    newDate: string,
    newTime: string,
    notifyOpts?: RescheduleNotifyOpts
  ) => Promise<void> | void
  /** When provided, tapping an empty time slot fires this callback (expanded view only) */
  onSlotTap?: (date: string, time: string) => void
  /**
   * When set (or changed), the calendar jumps to show a 3-day window containing
   * this ISO date and expands into the time-grid view automatically.
   */
  jumpToDate?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateNice(iso: string): string {
  if (!iso) return 'the scheduled date'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTimeNice(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return m === '00' ? `${display}${ampm}` : `${display}:${m}${ampm}`
}

function generateRescheduleMessage(
  role: string,
  propertyName: string,
  newDate: string,
  newTime: string
): string {
  const d = formatDateNice(newDate)
  const t = formatTimeNice(newTime)
  const at = t ? ` at ${t}` : ''
  const prop = propertyName || 'your property'

  if (role === 'cleaner')
    return `🧹 The clean at ${prop} has been rescheduled to ${d}${at}. Please ensure communal areas are accessible at the new time. Apologies for any inconvenience.`
  if (role === 'contractor')
    return `🔧 A maintenance visit at ${prop} has been rescheduled to ${d}${at}. Please ensure the property is accessible at this time.`
  if (role === 'lettings')
    return `🔑 A viewing at ${prop} has been rescheduled to ${d}${at}. We will have a management set of keys for access. Thank you for your hospitality whilst we visit and we hope not to disturb you for too long.`
  return `📋 An appointment at ${prop} has been rescheduled to ${d}${at}.`
}

// ── Notification preview panel (shared between sheets) ────────────────────────
function NotificationPreview({
  notify,
  onToggle,
  message,
  onMessageChange,
  onReset,
  propertyName,
  customised,
}: {
  notify: boolean
  onToggle: (v: boolean) => void
  message: string
  onMessageChange: (v: string) => void
  onReset: () => void
  propertyName: string
  customised: boolean
}) {
  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="reschedule-notify"
          checked={notify}
          onChange={(e) => onToggle(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="reschedule-notify" className="text-sm font-semibold text-neutral-900">
          Notify tenants of the change
        </label>
      </div>

      {/* Preview */}
      {notify && (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">
              📨 Tenant notification preview
            </p>
            {customised && (
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-blue-600 underline hover:text-blue-800"
              >
                Reset to default
              </button>
            )}
          </div>

          <textarea
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <div className="rounded-lg bg-white border border-blue-200 px-3 py-2 space-y-2">
            <p className="text-xs font-semibold text-neutral-700">This will be sent to:</p>
            <p className="text-xs text-neutral-600">
              👥 All current tenants at{' '}
              <span className="font-semibold">{propertyName || 'the property'}</span>
            </p>
            <p className="text-xs font-semibold text-neutral-700 pt-1">Via:</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                📱 Push notification
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                💬 In-app message
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Drag-confirm bottom sheet ─────────────────────────────────────────────────
function DragConfirmSheet({
  appt,
  newDate,
  newTime,
  role,
  onConfirm,
  onCancel,
}: {
  appt: CalendarAppointment
  newDate: string
  newTime: string
  role: string
  onConfirm: (notifyOpts: RescheduleNotifyOpts) => Promise<void>
  onCancel: () => void
}) {
  const propertyName = appt.property_name || ''
  const defaultMsg = generateRescheduleMessage(role, propertyName, newDate, newTime)
  const [notify, setNotify] = useState(!!appt.property_id)
  const [message, setMessage] = useState(defaultMsg)
  const [customised, setCustomised] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleMessageChange = (v: string) => { setMessage(v); setCustomised(true) }
  const handleReset = () => { setMessage(defaultMsg); setCustomised(false) }

  const label = appt.title || appt.property_name || 'Appointment'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white px-6 py-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-neutral-300" />
        <h3 className="text-base font-bold text-neutral-900 mb-1">Move appointment?</h3>
        <p className="text-sm text-neutral-600 mb-1 truncate font-medium">{label}</p>
        <p className="text-sm text-neutral-500 mb-5">
          → {formatDateNice(newDate)} at {formatTimeNice(newTime)}
        </p>

        {appt.property_id && (
          <div className="mb-5">
            <NotificationPreview
              notify={notify}
              onToggle={setNotify}
              message={message}
              onMessageChange={handleMessageChange}
              onReset={handleReset}
              propertyName={propertyName}
              customised={customised}
            />
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={async () => {
              setSaving(true)
              await onConfirm({ notify, message, propertyId: appt.property_id || '' })
              setSaving(false)
            }}
            disabled={saving}
            className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Moving…' : notify && appt.property_id ? 'Move & Notify' : 'Move'}
          </button>
          <button onClick={onCancel} className="flex-1 rounded-xl border border-neutral-300 py-3 text-sm font-semibold text-neutral-700">
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ── Tap-to-reschedule bottom sheet ────────────────────────────────────────────
function RescheduleSheet({
  appointment,
  role,
  onSave,
  onClose,
  onView,
}: {
  appointment: CalendarAppointment
  role: string
  onSave: (id: string, date: string, time: string, notifyOpts?: RescheduleNotifyOpts) => Promise<void> | void
  onClose: () => void
  onView?: (appt: CalendarAppointment) => void
}) {
  const [date, setDate] = useState(
    appointment.clean_date ||
    appointment.booked_date ||
    appointment.viewing_date ||
    appointment.appointment_date ||
    getTodayGMT()
  )
  const [time, setTime] = useState(appointment.start_time || '09:00')
  const [saving, setSaving] = useState(false)

  const propertyName = appointment.property_name || ''
  const getDefaultMsg = (d: string, t: string) => generateRescheduleMessage(role, propertyName, d, t)
  const [notify, setNotify] = useState(!!appointment.property_id)
  const [message, setMessage] = useState(getDefaultMsg(date, time))
  const [customised, setCustomised] = useState(false)

  // Auto-regenerate message when date/time changes (unless user edited)
  useEffect(() => {
    if (!customised) setMessage(getDefaultMsg(date, time))
  }, [date, time, customised])

  const handleMessageChange = (v: string) => { setMessage(v); setCustomised(true) }
  const handleReset = () => { setMessage(getDefaultMsg(date, time)); setCustomised(false) }

  const handleSave = async () => {
    setSaving(true)
    await onSave(appointment.id, date, time,
      appointment.property_id ? { notify, message, propertyId: appointment.property_id } : undefined
    )
    setSaving(false)
    onClose()
  }

  const label = appointment.title || appointment.property_name || 'Appointment'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white px-6 py-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-neutral-300" />
        <h3 className="text-base font-bold text-neutral-900 mb-1">Reschedule</h3>
        <p className="text-sm text-neutral-500 mb-5 truncate">{label}</p>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1 uppercase tracking-wide">New date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setCustomised(false) }}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1 uppercase tracking-wide">New time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => { setTime(e.target.value); setCustomised(false) }}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-900"
            />
          </div>
        </div>

        {appointment.property_id && (
          <div className="mb-5">
            <NotificationPreview
              notify={notify}
              onToggle={setNotify}
              message={message}
              onMessageChange={handleMessageChange}
              onReset={handleReset}
              propertyName={propertyName}
              customised={customised}
            />
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Moving…' : notify && appointment.property_id ? 'Move & Notify' : '↕ Move'}
          </button>
          {onView && (
            <button
              onClick={() => { onClose(); onView(appointment) }}
              className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-neutral-700"
            >
              View
            </button>
          )}
          <button onClick={onClose} className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-neutral-500">
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ThreeDayCalendar({
  appointments,
  role,
  onAppointmentClick,
  onAppointmentReschedule,
  onSlotTap,
  jumpToDate,
}: ThreeDayCalendarProps) {
  const [currentDate, setCurrentDate] = useState(getTodayGMT())
  const [rescheduling, setRescheduling] = useState<CalendarAppointment | null>(null)
  const [dragConfirm, setDragConfirm] = useState<{ appt: CalendarAppointment; newDate: string; newTime: string } | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [expanded, setExpanded] = useState(false)

  // Jump to a specific date when requested externally
  useEffect(() => {
    if (jumpToDate) {
      setCurrentDate(jumpToDate)
      setExpanded(true)
    }
  }, [jumpToDate])

  const touchDragRef = useRef<{ appt: CalendarAppointment; targetDate: string | null; targetTime: string | null } | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const dates = [0, 1, 2].map((offset) => {
    const d = new Date(`${currentDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + offset)
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  const getDateField = (appt: any): string | undefined => {
    if (role === 'cleaner') return appt.clean_date
    if (role === 'contractor') return appt.booked_date
    if (role === 'lettings') return appt.viewing_date
    return appt.appointment_date || appt.booked_date || appt.clean_date
  }

  const appointmentsByDay = dates.map((date) =>
    appointments
      .filter((appt) => getDateField(appt) === date)
      .sort((a, b) => (a.start_time || '00:00').localeCompare(b.start_time || '00:00'))
  )

  const totalThisWindow = appointmentsByDay.reduce((s, day) => s + day.length, 0)

  const getAppointmentColor = (appt: CalendarAppointment, dateStr: string): string => {
    const daysUntil = getDaysUntil(dateStr)
    if (daysUntil < 0) return 'bg-red-900 text-white'
    if (daysUntil === 0) return 'bg-blue-600 text-white'
    if (appt.priority === 'urgent' || appt.priority === 'high') return 'bg-orange-600 text-white'
    if (appt.status === 'confirmed' || appt.status === 'completed') return 'bg-green-600 text-white'
    return 'bg-neutral-700 text-white'
  }

  const handlePrevWeek = () => {
    const d = new Date(`${currentDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 3)
    setCurrentDate(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`)
  }

  const handleNextWeek = () => {
    const d = new Date(`${currentDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 3)
    setCurrentDate(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`)
  }

  const timeSlots = Array.from({ length: 22 }, (_, i) => {
    const hour = 8 + Math.floor(i / 2)
    const mins = i % 2 === 0 ? '00' : '30'
    return `${String(hour).padStart(2, '0')}:${mins}`
  })

  // ── Touch drag (document-level, added once) ───────────────────────────────
  useEffect(() => {
    if (!onAppointmentReschedule) return

    const onMove = (e: TouchEvent) => {
      if (!touchDragRef.current) return
      e.preventDefault()
      const touch = e.touches[0]
      setGhostPos({ x: touch.clientX, y: touch.clientY })
      const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
      const slot = el?.closest('[data-slot-date]') as HTMLElement | null
      touchDragRef.current.targetDate = slot?.getAttribute('data-slot-date') ?? null
      touchDragRef.current.targetTime = slot?.getAttribute('data-slot-time') ?? null
    }

    const onEnd = (e: TouchEvent) => {
      if (!touchDragRef.current) return
      const { appt, targetDate, targetTime } = touchDragRef.current
      const lastTouch = e.changedTouches[0]
      const moved = Math.hypot(
        (lastTouch?.clientX ?? 0) - (touchStartRef.current?.x ?? 0),
        (lastTouch?.clientY ?? 0) - (touchStartRef.current?.y ?? 0)
      )
      touchDragRef.current = null
      touchStartRef.current = null
      setGhostPos(null)

      if (moved < 8) {
        setRescheduling(appt)
      } else if (targetDate && targetTime) {
        setDragConfirm({ appt, newDate: targetDate, newTime: targetTime })
      }
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [onAppointmentReschedule])

  const handleApptTouchStart = (e: React.TouchEvent, appt: CalendarAppointment) => {
    if (!onAppointmentReschedule) return
    const touch = e.touches[0]
    touchDragRef.current = { appt, targetDate: null, targetTime: null }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    setGhostPos({ x: touch.clientX, y: touch.clientY })
  }

  const handleApptClick = (appt: CalendarAppointment) => {
    if (onAppointmentReschedule) {
      setRescheduling(appt)
    } else {
      onAppointmentClick?.(appt)
    }
  }

  return (
    <>
      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
        {/* Header */}
        <div className="border-b border-neutral-800 bg-neutral-950 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Your week</h2>
            <div className="flex items-center gap-3">
              {onSlotTap && expanded && (
                <span className="text-xs text-neutral-500">Tap a slot to book</span>
              )}
              {onAppointmentReschedule && expanded && !onSlotTap && (
                <span className="text-xs text-neutral-500">Drag or tap to move</span>
              )}
              <span className="text-xs text-neutral-400">
                {formatDateUK(dates[0])} – {formatDateUK(dates[2])}
              </span>
            </div>
          </div>
        </div>

        {/* Day tabs */}
        <div className="grid grid-cols-3 border-b border-neutral-800">
          {dates.map((date, idx) => {
            const isToday = date === getTodayGMT()
            const parts = formatDateUK(date).split(' ')
            const count = appointmentsByDay[idx].length
            return (
              <button
                key={date}
                onClick={() => setExpanded(true)}
                className={`border-r border-neutral-800 px-3 py-3 text-center text-xs font-semibold transition-colors ${
                  isToday ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-white hover:bg-neutral-800'
                } ${idx === 2 ? 'border-r-0' : ''}`}
              >
                <div>{parts[0]}</div>
                <div className="text-xs font-normal text-neutral-300">{parts[1]}</div>
                {count > 0 ? (
                  <div className="mt-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">{count}</div>
                ) : (
                  <div className="mt-1 h-4" />
                )}
              </button>
            )
          })}
        </div>

        {/* Collapsed state */}
        {!expanded && (
          <div className="px-4 py-3 space-y-2">
            {totalThisWindow === 0 ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-500">Nothing booked this window</p>
                <button
                  onClick={() => setExpanded(true)}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 transition-colors"
                >
                  Open ↓
                </button>
              </div>
            ) : (
              <>
                {appointmentsByDay.map((dayAppts, dayIdx) =>
                  dayAppts.map((appt) => {
                    const isToday = dates[dayIdx] === getTodayGMT()
                    const label = appt.title || appt.property_name || 'Appointment'
                    const timeStr = appt.start_time ? appt.start_time.slice(0, 5) : ''
                    return (
                      <button
                        key={appt.id}
                        onClick={() => handleApptClick(appt)}
                        onTouchStart={(e) => handleApptTouchStart(e, appt)}
                        className="w-full flex items-center justify-between rounded-xl bg-neutral-800 px-3 py-2.5 text-left hover:bg-neutral-700 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{label}</div>
                          <div className="text-xs text-neutral-400">
                            {isToday ? 'Today' : formatDateUK(dates[dayIdx])}{timeStr ? ` · ${timeStr}` : ''}
                          </div>
                        </div>
                        <span className="ml-3 shrink-0 text-neutral-400 text-sm">
                          {onAppointmentReschedule ? '↕' : '›'}
                        </span>
                      </button>
                    )
                  })
                )}
                <button
                  onClick={() => setExpanded(true)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 py-1.5 text-xs font-semibold text-neutral-400 hover:bg-neutral-700 transition-colors"
                >
                  Open full calendar ↓
                </button>
              </>
            )}
          </div>
        )}

        {/* Expanded time grid */}
        {expanded && (
          <>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <div className="grid grid-cols-[60px_1fr_1fr_1fr] border-b border-neutral-800">
                  <div className="px-2 py-2 text-xs font-semibold text-neutral-500">Time</div>
                  {dates.map((_, idx) => (
                    <div key={idx} className={`border-r border-neutral-800 px-2 py-2 text-xs font-semibold text-neutral-500 text-center ${idx === 2 ? 'border-r-0' : ''}`}>
                      {formatDateUK(dates[idx]).split(' ').join('\n')}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-[60px_1fr_1fr_1fr] bg-neutral-900">
                  {timeSlots.map((time, timeIdx) => (
                    <div key={time} className="contents">
                      {timeIdx % 2 === 0 ? (
                        <div className="border-r border-b border-neutral-800 px-2 py-2 text-xs text-neutral-500 font-semibold h-12">
                          {time}
                        </div>
                      ) : (
                        <div className="border-r border-b border-neutral-800 h-12" />
                      )}

                      {dates.map((date, dayIdx) => {
                        // Appointments whose start_time floors to this 30-min slot
                        const slotToMinutes = (t: string) => {
                          const [h, m] = t.split(':').map(Number)
                          return h * 60 + m
                        }
                        const slotMin = slotToMinutes(time)
                        const cellAppts = timeIdx % 2 === 0
                          ? appointmentsByDay[dayIdx].filter((a) => {
                              const am = slotToMinutes(a.start_time || '08:00')
                              return am >= slotMin && am < slotMin + 30
                            })
                          : []
                        const hasApptHere = cellAppts.length > 0
                        const slotClickable = !hasApptHere && !!onSlotTap && timeIdx % 2 === 0
                        return (
                        <div
                          key={`${date}-${time}`}
                          data-slot-date={date}
                          data-slot-time={time}
                          onClick={slotClickable ? () => onSlotTap!(date, time) : undefined}
                          className={`border-r border-b border-neutral-800 relative h-12 ${dayIdx === 2 ? 'border-r-0' : ''} ${slotClickable ? 'cursor-pointer group hover:bg-neutral-800/60' : ''}`}
                        >
                          {/* + hint on hover for bookable slots */}
                          {slotClickable && (
                            <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
                              +
                            </span>
                          )}
                          {cellAppts.map((appt, apptIdx) => {
                            const duration = appt.duration_minutes || 60
                            const heightPx = Math.max(20, (duration / 30) * 24)
                            const total = cellAppts.length
                            const widthPct = Math.floor(100 / total)
                            const leftPct = apptIdx * widthPct
                            const isLast = apptIdx === total - 1
                            return (
                              <button
                                key={appt.id}
                                onClick={(e) => { e.stopPropagation(); handleApptClick(appt) }}
                                onTouchStart={(e) => handleApptTouchStart(e, appt)}
                                style={{
                                  top: '2px',
                                  height: `${heightPx}px`,
                                  left: `${leftPct + 1}%`,
                                  width: isLast ? `calc(${widthPct}% - 4px)` : `calc(${widthPct}% - 2px)`,
                                  WebkitUserSelect: 'none',
                                  WebkitTouchCallout: 'none',
                                  userSelect: 'none',
                                }}
                                className={`absolute text-xs p-1 rounded overflow-hidden text-left cursor-grab ${getAppointmentColor(appt, date)}`}
                                title={`${appt.title || appt.property_name || 'Appointment'} at ${appt.start_time || '—'}`}
                              >
                                <div className="font-semibold truncate text-xs leading-tight">
                                  {appt.title || appt.property_name || 'Appt'}
                                </div>
                                {appt.room_name && heightPx > 30 && (
                                  <div className="text-xs opacity-80 truncate leading-tight">{appt.room_name}</div>
                                )}
                                {onAppointmentReschedule && heightPx > 36 && (
                                  <div className="text-xs opacity-60">⠿</div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-neutral-800 p-4">
              <button onClick={handlePrevWeek} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800">
                ← Prev
              </button>
              <button onClick={() => setExpanded(false)} className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-400 hover:bg-neutral-700">
                Collapse ↑
              </button>
              <button onClick={handleNextWeek} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800">
                Next →
              </button>
            </div>
          </>
        )}
      </section>

      {/* Drag ghost */}
      {ghostPos && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg bg-blue-600 text-white text-xs px-3 py-1.5 shadow-xl font-semibold opacity-90"
          style={{ left: ghostPos.x - 50, top: ghostPos.y - 28, transform: 'rotate(-2deg)', transition: 'none' }}
        >
          {touchDragRef.current?.appt.title || touchDragRef.current?.appt.property_name || 'Appointment'}
        </div>
      )}

      {/* Drag confirm sheet */}
      {dragConfirm && onAppointmentReschedule && (
        <DragConfirmSheet
          appt={dragConfirm.appt}
          newDate={dragConfirm.newDate}
          newTime={dragConfirm.newTime}
          role={role}
          onConfirm={async (notifyOpts) => {
            await onAppointmentReschedule(dragConfirm.appt.id, dragConfirm.newDate, dragConfirm.newTime, notifyOpts)
            setDragConfirm(null)
          }}
          onCancel={() => setDragConfirm(null)}
        />
      )}

      {/* Tap reschedule sheet */}
      {rescheduling && onAppointmentReschedule && (
        <RescheduleSheet
          appointment={rescheduling}
          role={role}
          onSave={onAppointmentReschedule}
          onClose={() => setRescheduling(null)}
          onView={onAppointmentClick}
        />
      )}
    </>
  )
}

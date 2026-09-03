'use client'

import { useState, useEffect, useRef } from 'react'
import { getTodayGMT } from '@/lib/dateUtils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DiaryAppointment {
  id: string
  title?: string            // "Room 1 — 4 Willis Road"
  room_name?: string        // "Viewing" (type label shown as sublabel)
  property_name?: string
  property_id?: string
  viewing_date?: string
  start_time?: string       // "HH:MM"
  duration_minutes?: number
}

export interface RescheduleNotifyOpts {
  notify: boolean
  message: string
  propertyId: string
}

interface Props {
  appointments: DiaryAppointment[]
  onSlotTap?: (date: string, time: string) => void
  onAppointmentReschedule?: (
    id: string,
    newDate: string,
    newTime: string,
    notifyOpts?: RescheduleNotifyOpts
  ) => Promise<void> | void
  jumpToDate?: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const START_HOUR = 8   // 8am
const END_HOUR = 19    // 7pm (last label shown)
const PX_PER_MIN = 2.4 // pixels per minute — gives 144px per hour

// ── Helpers ────────────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTop(mins: number): number {
  return (mins - START_HOUR * 60) * PX_PER_MIN
}

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hr = h % 12 || 12
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, '0')}${ampm}`
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const rm = mins % 60
  return rm ? `${h}h ${rm}m` : h === 1 ? '1 hr' : `${h} hrs`
}

function generateRescheduleMsg(propertyName: string, newDate: string, newTime: string): string {
  const d = new Date(newDate + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const t = fmt12(newTime)
  const prop = propertyName || 'the property'
  return `🔑 A viewing at ${prop} has been rescheduled to ${d} at ${t}. We will have a management set of keys for access. Thank you for your hospitality whilst we visit and we hope not to disturb you for too long.`
}

// ── Overlap detection ─────────────────────────────────────────────────────────
// For each day, group appointments into overlap clusters and assign column positions.

interface PositionedAppt extends DiaryAppointment {
  col: number
  totalCols: number
  topPx: number
  heightPx: number
}

function positionAppointments(appts: DiaryAppointment[]): PositionedAppt[] {
  const sorted = [...appts].sort((a, b) =>
    timeToMinutes(a.start_time || '09:00') - timeToMinutes(b.start_time || '09:00')
  )

  const result: PositionedAppt[] = []
  // Simple greedy overlap: maintain "active" columns
  const cols: number[] = [] // cols[i] = end-minute of appointment in column i

  for (const appt of sorted) {
    const startMin = timeToMinutes(appt.start_time || '09:00')
    const dur = appt.duration_minutes || 60
    const endMin = startMin + dur
    const topPx = minutesToTop(startMin)
    const heightPx = Math.max(PX_PER_MIN * dur - 2, 22) // min 22px for visibility

    // Find a free column
    let col = cols.findIndex(endM => endM <= startMin)
    if (col === -1) {
      col = cols.length
      cols.push(endMin)
    } else {
      cols[col] = endMin
    }

    result.push({ ...appt, col, totalCols: 0, topPx, heightPx })
  }

  // Second pass: for each appointment, count how many columns are active at its start time
  // (totalCols determines width)
  for (const pos of result) {
    const startMin = timeToMinutes(pos.start_time || '09:00')
    const endMin = startMin + (pos.duration_minutes || 60)
    // Count overlapping appointments
    const overlapping = result.filter(other => {
      const oStart = timeToMinutes(other.start_time || '09:00')
      const oEnd = oStart + (other.duration_minutes || 60)
      return oStart < endMin && oEnd > startMin
    })
    pos.totalCols = Math.max(...overlapping.map(o => o.col + 1))
  }

  return result
}

// ── Reschedule bottom sheet ────────────────────────────────────────────────────

function RescheduleSheet({
  appt,
  onSave,
  onClose,
}: {
  appt: DiaryAppointment
  onSave: (id: string, newDate: string, newTime: string, opts: RescheduleNotifyOpts) => Promise<void> | void
  onClose: () => void
}) {
  const [date, setDate] = useState(appt.viewing_date || getTodayGMT())
  const [time, setTime] = useState(appt.start_time || '09:00')
  const [notify, setNotify] = useState(!!appt.property_id)
  const [saving, setSaving] = useState(false)
  const propertyName = appt.property_name || ''
  const getDefaultMsg = (d: string, t: string) => generateRescheduleMsg(propertyName, d, t)
  const [message, setMessage] = useState(() => getDefaultMsg(date, time))
  const [customised, setCustomised] = useState(false)

  useEffect(() => {
    if (!customised) setMessage(getDefaultMsg(date, time))
  }, [date, time])

  const handleSave = async () => {
    setSaving(true)
    await onSave(appt.id, date, time, { notify, message, propertyId: appt.property_id || '' })
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white px-6 py-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-neutral-300" />
        <h3 className="text-base font-bold text-neutral-900 mb-0.5">Reschedule</h3>
        <p className="text-sm text-neutral-500 mb-5 truncate">{appt.title || appt.property_name || 'Viewing'}</p>

        <label className="block text-xs font-bold uppercase tracking-wide text-neutral-600 mb-1">New date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full mb-4 rounded-xl border border-neutral-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <label className="block text-xs font-bold uppercase tracking-wide text-neutral-600 mb-1">New time</label>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="w-full mb-5 rounded-xl border border-neutral-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        {appt.property_id && (
          <div className="mb-5 rounded-xl border-2 border-blue-100 bg-blue-50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="ldr-notify"
                checked={notify}
                onChange={e => setNotify(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="ldr-notify" className="text-sm font-semibold text-neutral-900">
                Notify tenants of the change
              </label>
            </div>
            {notify && (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">📨 Tenant notification preview</p>
                <textarea
                  value={message}
                  onChange={e => { setMessage(e.target.value); setCustomised(true) }}
                  rows={4}
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-xs text-blue-600">
                  Sent via push notification + in-app message to all current tenants at{' '}
                  <span className="font-semibold">{propertyName || 'the property'}</span>.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Moving…' : notify && appt.property_id ? 'Move & Notify' : 'Move'}
          </button>
          <button onClick={onClose} className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-600">
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ── Week strip ─────────────────────────────────────────────────────────────────

function WeekStrip({
  currentDate,
  viewingsByDate,
  onSelectDate,
}: {
  currentDate: string
  viewingsByDate: Record<string, number>
  onSelectDate: (iso: string) => void
}) {
  const today = getTodayGMT()
  // Always show 7 days centred on currentDate
  const days = Array.from({ length: 7 }, (_, i) => addDays(currentDate, i - 3))

  return (
    <div className="flex gap-1">
      {days.map(d => {
        const date = new Date(d + 'T00:00:00')
        const dayNum = date.getDate()
        const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' })
        const isSelected = d === currentDate
        const isToday = d === today
        const count = viewingsByDate[d] || 0

        return (
          <button
            key={d}
            onClick={() => onSelectDate(d)}
            className={`flex-1 rounded-xl py-2 px-0.5 text-center transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white'
                : isToday
                  ? 'border border-blue-400 bg-neutral-900 text-white'
                  : 'bg-neutral-900 text-neutral-500 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider">{dayName}</p>
            <p className="text-base font-black leading-tight">{dayNum}</p>
            <div className="h-4 flex items-center justify-center">
              {count > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px] font-black ${
                  isSelected ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
                }`}>
                  {count}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LettingsDiaryView({
  appointments,
  onSlotTap,
  onAppointmentReschedule,
  jumpToDate,
}: Props) {
  const today = getTodayGMT()
  const [currentDate, setCurrentDate] = useState(jumpToDate || today)
  const [rescheduling, setRescheduling] = useState<DiaryAppointment | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (jumpToDate) setCurrentDate(jumpToDate)
  }, [jumpToDate])

  // Auto-scroll to 8am on mount / date change
  useEffect(() => {
    if (scrollRef.current) {
      // Scroll to first appointment or 8am
      const dayAppts = appointments.filter(a => a.viewing_date === currentDate)
      if (dayAppts.length > 0) {
        const earliest = Math.min(...dayAppts.map(a => timeToMinutes(a.start_time || '09:00')))
        const scrollTo = Math.max(0, minutesToTop(earliest) - 40)
        scrollRef.current.scrollTop = scrollTo
      } else {
        scrollRef.current.scrollTop = 0
      }
    }
  }, [currentDate])

  const goTo = (iso: string) => setCurrentDate(iso)

  const dayAppts = appointments.filter(a => a.viewing_date === currentDate)
  const positioned = positionAppointments(dayAppts)

  const isToday = currentDate === today
  const isPast = currentDate < today
  const dayHeader = new Date(currentDate + 'T00:00:00')
  const weekday = dayHeader.toLocaleDateString('en-GB', { weekday: 'long' })
  const dayDisplay = dayHeader.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const yearDisplay = dayHeader.getFullYear()

  // Count viewings per date for the week strip badges
  const viewingsByDate: Record<string, number> = {}
  for (const appt of appointments) {
    const d = appt.viewing_date || ''
    if (d) viewingsByDate[d] = (viewingsByDate[d] || 0) + 1
  }

  // Hour labels and grid lines
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
  const totalHeight = (END_HOUR - START_HOUR) * 60 * PX_PER_MIN

  const handleApptClick = (appt: DiaryAppointment) => {
    if (onAppointmentReschedule) setRescheduling(appt)
  }

  return (
    <>
      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
        {/* Header */}
        <div className="border-b border-neutral-800 bg-neutral-950 px-4 pt-4 pb-3 space-y-3">
          {/* Day navigator */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => goTo(addDays(currentDate, -1))}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              ←
            </button>
            <div className="flex-1 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                {isToday ? 'Today' : isPast ? 'Past' : weekday}
              </p>
              <p className="text-base font-bold text-white leading-tight">{dayDisplay} {yearDisplay}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {dayAppts.length === 0
                  ? 'No viewings'
                  : `${dayAppts.length} viewing${dayAppts.length !== 1 ? 's' : ''}`}
                {onSlotTap ? <span className="text-neutral-600"> · tap to book</span> : null}
              </p>
            </div>
            <button
              onClick={() => goTo(addDays(currentDate, 1))}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              →
            </button>
          </div>

          {/* Week strip */}
          <WeekStrip
            currentDate={currentDate}
            viewingsByDate={viewingsByDate}
            onSelectDate={goTo}
          />
        </div>

        {/* Scrollable time grid */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: '65vh' }}>
          <div className="relative" style={{ height: `${totalHeight}px` }}>

            {/* Hour grid lines + labels */}
            {hours.map(h => {
              const topPx = minutesToTop(h * 60)
              return (
                <div
                  key={h}
                  className="absolute left-0 right-0 flex items-start"
                  style={{ top: `${topPx}px` }}
                >
                  <span className="w-12 shrink-0 pr-2 text-right text-xs text-neutral-600 font-semibold leading-none -translate-y-2">
                    {fmt12(`${String(h).padStart(2, '0')}:00`)}
                  </span>
                  <div className="flex-1 border-t border-neutral-800" />
                </div>
              )
            })}

            {/* 30-min lighter lines */}
            {hours.slice(0, -1).map(h => {
              const topPx = minutesToTop(h * 60 + 30)
              return (
                <div
                  key={`${h}-30`}
                  className="absolute left-12 right-0 border-t border-neutral-800/40"
                  style={{ top: `${topPx}px` }}
                />
              )
            })}

            {/* Tappable free slots — one per 30-min band if onSlotTap provided */}
            {onSlotTap && Array.from({ length: (END_HOUR - START_HOUR) * 2 }, (_, i) => {
              const totalMin = START_HOUR * 60 + i * 30
              const h = Math.floor(totalMin / 60)
              const m = totalMin % 60
              const slotTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
              const topPx = minutesToTop(totalMin)
              // Check if any appointment falls in this slot
              const occupied = positioned.some(p => {
                const pStart = timeToMinutes(p.start_time || '09:00')
                const pEnd = pStart + (p.duration_minutes || 60)
                return pStart < totalMin + 30 && pEnd > totalMin
              })
              if (occupied) return null
              return (
                <div
                  key={slotTime}
                  onClick={() => onSlotTap(currentDate, slotTime)}
                  className="absolute left-12 right-0 cursor-pointer group hover:bg-neutral-800/30 transition-colors"
                  style={{ top: `${topPx}px`, height: `${30 * PX_PER_MIN}px` }}
                >
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-700 group-hover:text-neutral-500 transition-colors select-none">
                    +
                  </span>
                </div>
              )
            })}

            {/* Appointment chips — absolute positioned */}
            {positioned.map(appt => {
              const widthPct = 100 / appt.totalCols
              const leftPct = appt.col * widthPct
              const isNow = isToday
              const chipColor = isPast
                ? 'bg-neutral-700 text-neutral-200 border-l-4 border-neutral-500'
                : isNow
                  ? 'bg-blue-600 text-white border-l-4 border-blue-300'
                  : 'bg-neutral-700 text-white border-l-4 border-blue-500'

              return (
                <button
                  key={appt.id}
                  onClick={() => handleApptClick(appt)}
                  title={`${appt.title || appt.property_name || 'Viewing'} at ${appt.start_time}`}
                  style={{
                    position: 'absolute',
                    top: `${appt.topPx + 1}px`,
                    height: `${appt.heightPx}px`,
                    left: `calc(${leftPct}% + 48px + 2px)`,
                    width: `calc(${widthPct}% - 48px - 4px)`,
                    zIndex: 10,
                  }}
                  className={`rounded-md px-2 py-1 text-left overflow-hidden cursor-pointer hover:brightness-110 transition-all ${chipColor}`}
                >
                  <div className="font-semibold truncate text-xs leading-tight">
                    {appt.title || appt.property_name || 'Viewing'}
                  </div>
                  {appt.heightPx > 30 && (
                    <div className="text-xs opacity-75 truncate leading-tight">
                      {fmt12(appt.start_time || '09:00')}
                      {appt.duration_minutes && appt.duration_minutes < 60
                        ? ` · ${formatDuration(appt.duration_minutes)}`
                        : ''}
                    </div>
                  )}
                  {appt.heightPx > 48 && onAppointmentReschedule && (
                    <div className="text-xs opacity-50 leading-tight">↕ tap to move</div>
                  )}
                </button>
              )
            })}

            {/* "Today" now-line */}
            {isToday && (() => {
              const now = new Date()
              const nowMin = now.getHours() * 60 + now.getMinutes()
              if (nowMin < START_HOUR * 60 || nowMin > END_HOUR * 60) return null
              const topPx = minutesToTop(nowMin)
              return (
                <div
                  className="absolute left-12 right-0 flex items-center pointer-events-none"
                  style={{ top: `${topPx}px`, zIndex: 20 }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                  <div className="flex-1 border-t-2 border-red-500" />
                </div>
              )
            })()}
          </div>
        </div>
      </section>

      {/* Reschedule sheet */}
      {rescheduling && onAppointmentReschedule && (
        <RescheduleSheet
          appt={rescheduling}
          onSave={onAppointmentReschedule}
          onClose={() => setRescheduling(null)}
        />
      )}
    </>
  )
}

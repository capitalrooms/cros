'use client'

import Link from 'next/link'

/**
 * MultiDayDiaryGrid
 *
 * 5-day × time-slot diary grid, matching the vision spec exactly:
 *   - 60px time labels | repeat(5, 1fr) day columns
 *   - Cream page background, white card, sage/red job blocks
 *   - Today's column highlighted in sage-soft
 *   - Read-only in Phase 1 (no drag)
 */

export interface DiaryJob {
  id: string
  date: string          // YYYY-MM-DD
  time?: string | null  // HH:MM or HH:MM:SS — null means "time TBC" (shows in first slot)
  label: string         // primary text, e.g. property name
  sublabel?: string     // secondary, e.g. job type
  isOverdue?: boolean
  href?: string         // click target
}

interface Props {
  jobs: DiaryJob[]
  startHour?: number    // default 8
  endHour?: number      // default 19 (last row starts at 19:00 → 7pm)
  /** ISO string of "today" for column highlight */
  todayISO?: string
  /** called when an empty slot is clicked — receives iso date + hour string like "09:00" */
  onSlotClick?: (date: string, time: string) => void
  /** called when a job without an href is clicked */
  onJobClick?: (id: string) => void
  /** starting day offset (0 = start from today) */
  dayOffset?: number
}

const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function formatHour(h: number) {
  if (h === 0)  return '12am'
  if (h < 12)  return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function todayISOFn() {
  return new Date().toISOString().split('T')[0]
}

function buildDays(dayOffset = 0): string[] {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  base.setDate(base.getDate() + dayOffset)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function jobHour(job: DiaryJob): number | null {
  if (!job.time) return null
  const [hStr] = job.time.split(':')
  const h = parseInt(hStr, 10)
  return isNaN(h) ? null : h
}

export default function MultiDayDiaryGrid({
  jobs,
  startHour = 8,
  endHour = 19,
  todayISO,
  onSlotClick,
  onJobClick,
  dayOffset = 0,
}: Props) {
  const today = todayISO ?? todayISOFn()
  const days  = buildDays(dayOffset)
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)

  // Index jobs by date+hour for O(1) lookup
  const jobIndex: Record<string, DiaryJob[]> = {}
  for (const j of jobs) {
    const h = jobHour(j)
    // jobs with no time → place in startHour row so they're visible
    const slot = h !== null ? h : startHour
    const key  = `${j.date}_${slot}`
    if (!jobIndex[key]) jobIndex[key] = []
    jobIndex[key].push(j)
  }

  // Date range label for header
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  const rangeLabel = `${fmt(days[0])} — ${fmt(days[4])}`

  return (
    <div>
      {/* Range label */}
      <p className="text-xs font-semibold mb-3" style={{ color: '#59544C' }}>{rangeLabel}</p>

      {/* Grid */}
      <div
        className="rounded-[18px] border overflow-hidden shadow-sm"
        style={{
          background: '#FFFFFF',
          borderColor: '#E7E1D4',
          boxShadow: '0 1px 2px rgba(24,22,20,0.04), 0 8px 20px -8px rgba(24,22,20,0.12)',
          display: 'grid',
          gridTemplateColumns: '60px repeat(5, 1fr)',
        }}
      >
        {/* Header row */}
        <div style={{ borderBottom: '1px solid #E7E1D4', background: '#FBFAF6' }} />
        {days.map(iso => {
          const d      = new Date(iso + 'T00:00:00')
          const isToday = iso === today
          return (
            <div
              key={iso}
              style={{
                padding: '10px 8px',
                textAlign: 'center',
                borderBottom: '1px solid #E7E1D4',
                borderLeft: '1px solid #E7E1D4',
                background: isToday ? '#DCE6DE' : '#FBFAF6',
              }}
            >
              <div style={{ fontSize: 10.5, color: isToday ? '#4B6358' : '#59544C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {DAYS_SHORT[d.getDay()]}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 1, color: isToday ? '#4B6358' : '#181614', fontFamily: 'var(--font-baloo-2, system-ui)' }}>
                {d.getDate()}
              </div>
            </div>
          )
        })}

        {/* Time rows */}
        {hours.map(h => (
          <>
            {/* Time label */}
            <div
              key={`label-${h}`}
              style={{
                padding: '8px 8px 0 0',
                textAlign: 'right',
                fontSize: 10.5,
                color: '#59544C',
                borderRight: '1px solid #E7E1D4',
                borderBottom: '1px solid #E7E1D4',
              }}
            >
              {formatHour(h)}
            </div>

            {/* Day cells */}
            {days.map(iso => {
              const slotJobs = jobIndex[`${iso}_${h}`] ?? []
              const isToday  = iso === today
              return (
                <div
                  key={`${iso}-${h}`}
                  onClick={() => {
                    if (slotJobs.length === 0 && onSlotClick) {
                      onSlotClick(iso, `${String(h).padStart(2,'0')}:00`)
                    }
                  }}
                  style={{
                    position: 'relative',
                    padding: '4px 6px',
                    minHeight: 56,
                    borderLeft: '1px solid #E7E1D4',
                    borderBottom: '1px solid #E7E1D4',
                    background: isToday ? 'rgba(220,230,222,0.18)' : undefined,
                    cursor: slotJobs.length === 0 && onSlotClick ? 'pointer' : undefined,
                  }}
                >
                  {slotJobs.map(j => {
                    const block = (
                      <div
                        key={j.id}
                        style={{
                          background: j.isOverdue ? '#F7E4DE' : '#DCE6DE',
                          borderLeft: `3px solid ${j.isOverdue ? '#B4472F' : '#4B6358'}`,
                          borderRadius: 7,
                          padding: '5px 7px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: j.isOverdue ? '#B4472F' : '#4B6358',
                          lineHeight: 1.3,
                          marginBottom: 3,
                        }}
                      >
                        {j.label}
                        {j.sublabel && (
                          <span style={{ display: 'block', fontWeight: 500, color: '#59544C', fontSize: 9.5 }}>
                            {j.sublabel}
                            {j.time == null ? ' · time TBC' : ''}
                          </span>
                        )}
                      </div>
                    )
                    return j.href
                      ? <Link key={j.id} href={j.href} className="block">{block}</Link>
                      : onJobClick
                        ? <button key={j.id} type="button" className="block w-full text-left" onClick={e => { e.stopPropagation(); onJobClick(j.id) }}>{block}</button>
                        : <div key={j.id}>{block}</div>
                  })}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

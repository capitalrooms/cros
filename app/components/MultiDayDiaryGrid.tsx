'use client'
// The phone apps' diary — contractor, cleaner and lettings (5 days from today, hours down the side).
// 12 Nov 2026: now drawn by the one calendar used across CROS (components/calendar), so it looks like every other diary.
// The props are unchanged, so the three apps didn't need touching beyond saying what colour their entries are.
import { TimeGrid, type CalEntry, type Tone } from '@/components/calendar/Calendar'
import { CAL, parseTime, fromYmd, addDays, todayYmd } from '@/components/calendar/look'

export interface DiaryJob {
  id: string
  date: string          // YYYY-MM-DD
  time?: string | null  // HH:MM or HH:MM:SS — null means "time TBC" (shown under "Any time")
  label: string         // primary text, e.g. property name
  sublabel?: string     // secondary, e.g. job type
  isOverdue?: boolean
  href?: string         // click target
  minutes?: number      // how long it takes (default an hour)
}

interface Props {
  jobs: DiaryJob[]
  startHour?: number    // default 8
  endHour?: number      // default 19
  todayISO?: string
  onSlotClick?: (date: string, time: string) => void
  onJobClick?: (id: string) => void
  dayOffset?: number
  /** what the entries are — sets their colour (repair blue, clean green, viewing purple) */
  tone?: Tone
}

export default function MultiDayDiaryGrid({ jobs, startHour = 8, endHour = 19, todayISO, onSlotClick, onJobClick, dayOffset = 0, tone = 'neutral' }: Props) {
  const start = addDays(fromYmd(todayISO ?? todayYmd()), dayOffset)
  const days = Array.from({ length: 5 }, (_, i) => addDays(start, i))
  const entries: CalEntry[] = jobs.map(j => {
    const t = parseTime(j.time, j.minutes ?? 60)
    return {
      key: j.id, date: j.date, ...t, title: j.label, line2: j.sublabel, tone: j.isOverdue ? 'overdue' : tone,
      href: j.href, onClick: !j.href && onJobClick ? () => onJobClick(j.id) : undefined,
    }
  })
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div>
      <p className="mb-3 text-xs font-semibold" style={{ color: CAL.muted }}>{fmt(days[0])} – {fmt(days[4])}</p>
      <TimeGrid days={days} entries={entries} compact minHour={startHour} maxHour={endHour + 1} hourHeight={56}
        onSlot={onSlotClick ? (d, m) => onSlotClick(d, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`) : undefined} />
    </div>
  )
}

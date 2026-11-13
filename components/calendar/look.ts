// The one calendar look for all of CROS (12 Nov 2026 — Harry: "one calendar styling throughout the system rather than
// 13 different types"). Every calendar — the diary week, the phone apps' diaries, viewings weeks, month views — takes its
// colours, day headings, two-tone hours and time words from here, and its parts from components/calendar.

/** Colours. Two tones the usual way: working hours (9–6, Mon–Fri) white, everything else off-white. */
export const CAL = {
  white: '#FFFFFF',
  off: '#F6F4EF',          // outside working hours, weekends
  line: '#E5E3DD',         // hour lines and column borders
  half: '#F2F0EB',         // the faint half-hour line
  head: '#FFFFFF',
  today: '#B5361F',        // today's date circle, the "now" line
  muted: '#8A867D',        // hour labels
  ink: '#1B1A17',
  hover: '#EEF2F7',
} as const

/** What an entry is → its colour. Same meaning everywhere. */
export type Tone = 'repair' | 'clean' | 'viewing' | 'appointment' | 'overdue' | 'done' | 'pending' | 'neutral'
export const TONES: Record<Tone, { bar: string; tint: string; ink: string; label: string }> = {
  repair:      { bar: '#2F6FB2', tint: '#E9F1FA', ink: '#173A5E', label: 'Repair' },
  clean:       { bar: '#2F855A', tint: '#E7F4EC', ink: '#1C4A33', label: 'Clean' },
  viewing:     { bar: '#7A4FB8', tint: '#F1EAFA', ink: '#40266A', label: 'Viewing' },
  appointment: { bar: '#C0661A', tint: '#FCEFE2', ink: '#5E300A', label: 'Appointment' },
  overdue:     { bar: '#B5361F', tint: '#FBE9E5', ink: '#6E1E10', label: 'Overdue' },
  done:        { bar: '#7C8A80', tint: '#EEF1EE', ink: '#3F4A43', label: 'Done' },
  pending:     { bar: '#C9A227', tint: '#FBF5DF', ink: '#5A4708', label: 'To confirm' },
  neutral:     { bar: '#5F6B63', tint: '#F0F1EE', ink: '#2C332E', label: '' },
}

export const WORK_START = 9, WORK_END = 18
export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
export const isWorkingHour = (d: Date, hour: number) => !isWeekend(d) && hour >= WORK_START && hour < WORK_END
/** an hour cell's background: two tones plus the faint half-hour line */
export const hourCell = (d: Date, hour: number) =>
  `linear-gradient(to bottom, transparent calc(50% - 0.5px), ${CAL.half} calc(50% - 0.5px), ${CAL.half} calc(50% + 0.5px), transparent calc(50% + 0.5px)) ${isWorkingHour(d, hour) ? CAL.white : CAL.off}`

/** yyyy-mm-dd of a local date */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** a yyyy-mm-dd as a Date at midday (never slips a day across the clocks) */
export const fromYmd = (s: string) => new Date(`${s}T12:00:00`)
export const todayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
/** weeks start on Monday */
export const mondayOf = (d: Date) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
export const weekDays = (monday: Date, n = 7) => Array.from({ length: n }, (_, i) => addDays(monday, i))

/** 570 → "9:30am", 720 → "12pm" */
export const niceTime = (m: number) => { const h = Math.floor(m / 60), mm = m % 60, h12 = ((h + 11) % 12) + 1; return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}` }
export const hourLabel = (h: number) => niceTime(h * 60)
/** "09:30:00" → {570, +minutes}; "9-12" / "15-18" (repair slots) → the slot */
export function parseTime(t: string | null | undefined, minutes = 60): { start: number | null; end: number | null } {
  const s = String(t ?? '').trim()
  const slot = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/)
  if (slot) return { start: Number(slot[1]) * 60, end: Number(slot[2]) * 60 }
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return { start: null, end: null }
  const start = Number(m[1]) * 60 + Number(m[2])
  return { start, end: start + minutes }
}
export const weekLabel = (monday: Date, n = 7) => {
  const end = addDays(monday, n - 1)
  return `${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
}

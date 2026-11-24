// Planned Works (24 Nov 2026) — shared rules for multi-day projects on a maintenance job. Pure functions, no I/O.

export const FACILITY_NAMES = ['Sink', 'Shower', 'Bath', 'Toilet', 'Kitchen', 'Cooker', 'Heating', 'Hot water'] as const

// Facility status a contractor may set. Only staff may mark a facility restored (decision approved 24 Nov).
export const CONTRACTOR_FACILITY_STATUS = ['available', 'restricted', 'unavailable', 'partial'] as const
export const ALL_FACILITY_STATUS = ['available', 'restricted', 'unavailable', 'partial', 'restored'] as const

export const FACILITY_LABEL: Record<string, string> = {
  available: 'Available', restricted: 'Restricted', unavailable: 'Unavailable', partial: 'Partly available', restored: 'Restored',
}

// Ready-made daily messages a contractor picks from. Free text is also allowed.
export const DAILY_MESSAGES = [
  { key: 'water_off', label: 'Water unavailable', text: 'Please do not use the water supply in the work area until further notice.' },
  { key: 'paint_drying', label: 'Paint drying', text: 'Please avoid touching freshly painted surfaces.' },
  { key: 'work_ongoing', label: 'Work ongoing', text: 'The contractor has finished for today and will return on the date shown.' },
  { key: 'area_closed', label: 'Area inaccessible', text: 'Please do not enter the work area until further notice.' },
  { key: 'facility_restored', label: 'Facility restored', text: 'The facility is now available to use again.' },
  { key: 'delayed', label: 'Delayed works', text: 'The works are taking longer than expected. An updated completion date will follow.' },
] as const

// Working days: Monday to Friday. Bank holidays are not yet excluded (a later decision).
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

export function addWorkingDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  let left = Math.max(0, Math.floor(days))
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (!isWeekend(d)) left--
  }
  return d.toISOString().slice(0, 10)
}

// Project day number on a given date (day 1 = start date, weekends not counted). Clamped to the duration.
export function projectDay(startIso: string, todayIso: string, durationDays: number): number {
  const start = new Date(`${startIso}T12:00:00Z`), end = new Date(`${todayIso}T12:00:00Z`)
  if (end < start) return 0
  let n = 0
  const d = new Date(start)
  while (d <= end) { if (!isWeekend(d)) n++; d.setUTCDate(d.getUTCDate() + 1) }
  return Math.min(Math.max(n, 1), durationDays)
}

// The contractor's daily update may never complete the project. This is checked on the server too.
export function canAcceptDailyUpdate(projectStatus: string | null | undefined): boolean {
  return projectStatus !== 'completed'
}

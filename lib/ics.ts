/**
 * Minimal iCalendar (.ics) generator for calendar invites.
 *
 * We email these as attachments (via Resend) so a staff member can accept a
 * booking straight into their own Gmail / Google Calendar / Apple Calendar —
 * the "at minimum, a calendar invite they can accept" path from 25 Aug #8,
 * without needing full Google OAuth sync.
 *
 * Times are written as "floating" local time (no Z, no TZID) so they show at the
 * wall-clock time the booker entered, wherever the recipient opens them.
 */

export interface IcsEvent {
  uid: string
  title: string
  description?: string
  location?: string
  /** Local date, YYYY-MM-DD. */
  date: string
  /** Local time, HH:MM (24h). Defaults to 09:00. */
  time?: string
  durationMinutes?: number
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** "YYYYMMDDTHHMMSS" floating local time from date + time strings. */
function floating(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`
}

/** Add minutes to a floating stamp, rolling over via a Date in local terms. */
function addMinutes(date: string, time: string, minutes: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const dt = new Date(y, m - 1, d, hh, mm + minutes)
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
}

/** Escape per RFC 5545 (commas, semicolons, backslashes, newlines). */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function utcStamp(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export function buildIcs(event: IcsEvent): string {
  const time = event.time || '09:00'
  const start = floating(event.date, time)
  const end = addMinutes(event.date, time, event.durationMinutes || 30)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Capital Rooms//CROS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp()}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(event.title)}`,
    event.description ? `DESCRIPTION:${esc(event.description)}` : '',
    event.location ? `LOCATION:${esc(event.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  // RFC 5545 wants CRLF line endings.
  return lines.join('\r\n')
}

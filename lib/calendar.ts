import { TIME_SLOTS } from './booking'

/** Slot start/end as 24h hours — must match TIME_SLOTS values. */
const SLOT_HOURS: Record<string, [number, number]> = {
  '9-12': [9, 12],
  '12-15': [12, 15],
  '15-18': [15, 18],
}

function toICSDate(date: string, hour: number) {
  const d = new Date(date)
  d.setHours(hour, 0, 0, 0)
  // Floating local time — no Z suffix, so it lands at the stated UK wall-clock time.
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  )
}

/** Fold long lines to 75 octets per RFC 5545, else Gmail mangles them. */
function fold(line: string) {
  if (line.length <= 74) return line
  const parts = [line.slice(0, 74)]
  let rest = line.slice(74)
  while (rest.length > 73) {
    parts.push(' ' + rest.slice(0, 73))
    rest = rest.slice(73)
  }
  parts.push(' ' + rest)
  return parts.join('\r\n')
}

function escape(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export interface VisitInvite {
  ticketId: string
  title: string
  date: string
  slot: string
  propertyName: string
  propertyAddress: string
  roomName?: string | null
  /** Bumped on each reschedule so calendars UPDATE rather than duplicate. */
  sequence?: number
  cancelled?: boolean
}

/**
 * Builds an .ics invite. The UID is derived from the ticket id, so a reschedule
 * with a higher SEQUENCE moves the existing calendar entry instead of creating a
 * second one — the difference between a working diary and three phantom
 * appointments after two reschedules.
 */
export function buildVisitICS(invite: VisitInvite) {
  const [startHour, endHour] = SLOT_HOURS[invite.slot] ?? [9, 12]
  const slotLabel = TIME_SLOTS.find((s) => s.value === invite.slot)?.label ?? ''

  const location = [invite.propertyName, invite.propertyAddress].filter(Boolean).join(', ')
  const where = invite.roomName ? `${invite.roomName} — ${location}` : location

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Capital Rooms//CROS//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${invite.cancelled ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:ticket-${invite.ticketId}@capitalrooms.co.uk`,
    `SEQUENCE:${invite.sequence ?? 0}`,
    `DTSTAMP:${toICSDate(new Date().toISOString(), new Date().getHours())}`,
    `DTSTART:${toICSDate(invite.date, startHour)}`,
    `DTEND:${toICSDate(invite.date, endHour)}`,
    `SUMMARY:${escape(`Repair: ${invite.title}`)}`,
    `LOCATION:${escape(where)}`,
    `DESCRIPTION:${escape(`${invite.title}\n${where}\nArrival window: ${slotLabel}`)}`,
    `STATUS:${invite.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(fold).join('\r\n')
}

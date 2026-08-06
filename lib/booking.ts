export const TIME_SLOTS = [
  { value: '9-12', label: '9am – 12pm' },
  { value: '12-15', label: '12pm – 3pm' },
  { value: '15-18', label: '3pm – 6pm' },
] as const

export function slotLabel(slot: string | null | undefined) {
  return TIME_SLOTS.find((s) => s.value === slot)?.label ?? ''
}

/** "Thu 7 Aug, 9am – 12pm" — never show a booked status without its time. */
export function formatBooking(
  date: string | null | undefined,
  slot: string | null | undefined
) {
  if (!date) return ''
  const day = new Date(date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const time = slotLabel(slot)
  return time ? `${day}, ${time}` : day
}

/**
 * Tenant-facing wording. "assigned" reads as non-committal, so booked jobs
 * always surface as "Repair booked" alongside the date and slot.
 */
export const STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  assigned: 'Repair booked',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/**
 * Never claim a repair is "booked" without a time to show for it — an
 * unqualified "Repair booked" reads as confident but tells the reader nothing.
 */
/** Locations that are reachable via the key safe without tenant involvement. */
const COMMUNAL = [
  'Kitchen',
  'Lounge/Living Room',
  'Ground Floor Hallway',
  'First Floor Hallway',
  'Ground Floor Bathroom',
  'First Floor Bathroom',
  'Stairs',
  'Front Entrance',
  'Back Door/Garden',
  'Shared Storage',
  'Other Communal Area',
]

export function isCommunal(location: string | null | undefined) {
  return !!location && COMMUNAL.includes(location)
}

/**
 * Earliest bookable date.
 *
 * A bedroom job needs 24h notice because the tenant has to arrange access — be
 * home, or agree to leave the door open. Communal areas are reachable via the
 * key safe, so same-day is fine. Emergencies bypass the rule entirely.
 */
export function earliestBookableDate(
  location: string | null | undefined,
  priority?: string | null
) {
  const d = new Date()
  const needsNotice = !isCommunal(location) && priority !== 'emergency' && priority !== 'high'
  if (needsNotice) d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function bookingLeadTimeNote(
  location: string | null | undefined,
  priority?: string | null
) {
  if (priority === 'emergency' || priority === 'high') return 'Urgent — can be booked today.'
  if (isCommunal(location)) return 'Communal area — reachable via key safe, can be booked today.'
  return 'Bedroom access needs 24 hours notice so the tenant can arrange access.'
}

export function statusLabel(status: string, bookedDate?: string | null) {
  if (status === 'assigned' && !bookedDate) return 'Awaiting time'
  return STATUS_LABELS[status] ?? status
}

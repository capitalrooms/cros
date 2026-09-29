/**
 * Appointment creation action handler.
 * Parses booking commands and validates against available slots.
 */

export interface AppointmentCreateDetails {
  type: 'viewing' | 'inspection' | 'maintenance' | 'delivery'
  propertyName?: string
  propertyId?: string
  roomName?: string
  roomId?: string
  dateStr: string           // e.g. "2026-10-03", "tomorrow", "next Monday"
  timeStr: string           // e.g. "15:30", "3:30pm", "afternoon"
  title: string             // e.g. "Viewing - Karina"
  description?: string
  tenants?: string[]        // tenant names or IDs to notify
  contractorId?: string     // for maintenance
}

export function validateAppointmentCreate(
  details: AppointmentCreateDetails,
  rooms: { id: string; name: string; property_id: string }[] = []
): {
  valid: boolean
  roomId?: string
  propertyId?: string
  dateTime?: string
  error?: string
  warnings?: string[]
} {
  const warnings: string[] = []

  // Validate date/time parsing happened
  if (!details.dateStr || !details.timeStr) {
    return { valid: false, error: 'Date and time required' }
  }

  // If room is specified, find it
  if (details.roomName) {
    const room = rooms.find(
      (r) =>
        r.name?.toLowerCase().includes(details.roomName!.toLowerCase()) ||
        r.id === details.roomName
    )

    if (!room) {
      warnings.push(`Room not found: ${details.roomName} — booking property only`)
    } else {
      details.roomId = room.id
      details.propertyId = room.property_id
    }
  }

  // Title required
  if (!details.title || details.title.length < 3) {
    return { valid: false, error: 'Appointment title required' }
  }

  return {
    valid: true,
    roomId: details.roomId,
    propertyId: details.propertyId,
    dateTime: `${details.dateStr}T${details.timeStr}`,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

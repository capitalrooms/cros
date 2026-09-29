/**
 * Room update action handler.
 * Validates and transforms parsed room details into DB updates.
 */

export interface RoomUpdateDetails {
  roomName: string          // e.g. "Room 3", "071ALR01"
  propertyName?: string     // e.g. "71 Alloa Road"
  updates: {
    room_type?: string      // e.g. "double", "ensuite", "single"
    size?: string           // e.g. "small", "medium", "large"
    description?: string    // e.g. "large ensuite", "window seat"
    room_size?: number      // square meters (if extracted)
  }
}

export function validateRoomUpdate(
  details: RoomUpdateDetails,
  rooms: { id: string; name: string; unit_code: string | null; property_id?: string }[]
): { valid: boolean; roomId?: string; error?: string } {
  if (!details.roomName) {
    return { valid: false, error: 'Room name required' }
  }

  // Try to match room by name or unit_code
  const matched = rooms.find(
    (r) =>
      r.name?.toLowerCase().includes(details.roomName.toLowerCase()) ||
      r.unit_code?.toLowerCase() === details.roomName.toLowerCase()
  )

  if (!matched) {
    return { valid: false, error: `Room not found: ${details.roomName}` }
  }

  return { valid: true, roomId: matched.id }
}

/** Transform parsed details into a DB update payload */
export function buildRoomUpdatePayload(
  roomId: string,
  details: RoomUpdateDetails
): Record<string, any> {
  const updates: Record<string, any> = {}

  // Map natural language room types to canonical values
  const typeMap: Record<string, string> = {
    single: 'single',
    double: 'double',
    ensuite: 'ensuite',
    'en-suite': 'ensuite',
    twin: 'twin',
    studio: 'studio',
  }

  const sizeMap: Record<string, string> = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
  }

  if (details.updates.room_type) {
    const normalized = details.updates.room_type.toLowerCase()
    const canonical = typeMap[normalized] || details.updates.room_type
    updates.room_type = canonical
  }

  if (details.updates.size) {
    const normalized = details.updates.size.toLowerCase()
    updates.room_size = sizeMap[normalized] || details.updates.size
  }

  if (details.updates.room_size) {
    updates.total_area = details.updates.room_size
  }

  if (details.updates.description) {
    updates.description = details.updates.description
  }

  return { roomId, updates }
}

// Where a repair is (25 Oct 2026). A job keeps the reporter's room (room_id) and where the problem is (location, e.g.
// "Kitchen", "My Room / Bedroom"). Screens showed the room first, so a kitchen or hallway job read as "Room 2" — a
// contractor could have gone into a tenant's bedroom, and booking used the bedroom notice rule for shared areas.
type J = { location?: string | null; rooms?: { name?: string | null } | null }

/** Is the problem in a tenant's own room? No location recorded counts as their room (the safe reading). */
export const inTenantRoom = (j: J) => !j.location || /my room|bedroom/i.test(j.location)

/** "Room 2" for a job in someone's room, "Kitchen" for a shared area. */
export const jobWhere = (j: J) => inTenantRoom(j) ? (j.rooms?.name || 'Their room') : String(j.location)

/** What the booking notice rules (lib/access) should be given: the room for a room job, else the shared area. */
export const jobPlace = (j: J) => inTenantRoom(j) ? (j.rooms?.name ?? j.location ?? null) : (j.location ?? null)

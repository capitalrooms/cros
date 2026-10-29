// Words for a let (14 Oct 2026, Harry: "copy the exact same stuff for single let renting but just tweak any words").
// A whole home let to one household — a single-let house or flat (properties.property_type 'single_let', whose one
// unit is called "Whole Property") — goes through exactly the same offer / apply / reserve route as a room in a
// shared house; only the words change. Safe to use in the browser and on the server.

/** A whole house or flat, rather than a room in a shared house. */
export function isWholeLet(propertyType?: string | null, roomName?: string | null): boolean {
  return propertyType === 'single_let' || /^(whole|entire)\b/i.test(String(roomName ?? '').trim())
}

/** An address on one line. Some are saved with line breaks, which email subjects refuse and inputs run together. */
export function oneLine(s?: string | null): string {
  return String(s ?? '').split(/\s*[\r\n]+\s*/).map(x => x.trim()).filter(Boolean).join(', ').replace(/,\s*,/g, ',')
}

/** "Room 1, 44 Claverton Street, London" — or just the address for a whole home (never "Whole Property, …"). */
export function placeLabel(whole: boolean, roomName?: string | null, address?: string | null): string {
  const a = oneLine(address)
  const r = String(roomName ?? '').trim()
  // a let-only room named after its street ("95 Rope Street") would print the address twice
  return whole || !r || a.toLowerCase().includes(r.toLowerCase()) ? a : `${r}, ${a}`
}

export interface LetWords {
  unit: string          // room | property
  theUnit: string       // the room | the property
  thisUnit: string      // this room | this property
  yourUnit: string      // your room | your new home
  ourUnits: string      // our rooms | this property
  details: string       // Room details | Property details
  bills: string         // " (all bills included)" for rooms; nothing claimed for a whole home
  housemate: string     // housemate | tenant
}

export function letWords(whole: boolean): LetWords {
  return whole
    ? { unit: 'property', theUnit: 'the property', thisUnit: 'this property', yourUnit: 'your new home', ourUnits: 'this property', details: 'Property details', bills: '', housemate: 'tenant' }
    : { unit: 'room', theUnit: 'the room', thisUnit: 'this room', yourUnit: 'your room', ourUnits: 'our rooms', details: 'Room details', bills: ' (all bills included)', housemate: 'housemate' }
}

/** A property's short name: its first line, plus the street when the first line is only "Flat 4" / "Apartment 2",
 *  or the building when it's only a number ("315" → "315 Eden House"). */
export function shortAddress(s?: string | null): string {
  const parts = String(s ?? '').split(/\s*[\r\n,]+\s*/).map(x => x.trim()).filter(Boolean)
  if (!parts.length) return ''
  if (/^\d+[a-z]?$/i.test(parts[0]) && parts[1]) return `${parts[0]} ${parts[1]}`
  return /^(flat|apartment|apt|unit|studio|room)\s+\S+$/i.test(parts[0]) && parts[1] ? `${parts[0]}, ${parts[1]}` : parts[0]
}

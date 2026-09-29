// A tenancy's bank payment reference: house number (3 digits) + first two letters of the street's first word
// + first letter of its second word + room number (2 digits). "208 Rotherhithe Street", Room 5 → "208ROS05".
// The same reference goes on the agreement, the check-in balance and every rent demand, and is what the
// bank import matches payments on — so it is generated, never typed.
export function buildPaymentRef(propertyName: string, roomNumber: number | string | null | undefined): string {
  // the part with the house number and street: skip "Flat 4" / "Room 2" / "Apartment 3" lines, so
  // "Flat 4, 44 Claverton Street" (or the same on separate lines) → "44 Claverton Street" → 044CLS
  const segs = String(propertyName || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean)
  const street = (segs.find(x => /^\d+[a-z]?\s+\S/i.test(x) && !/^(flat|apartment|apt|room|unit|studio)\b/i.test(x))
    // a building with no street number ("Flat 4708, Bagshaw Building"): the flat number + the building name
    ?? (() => { const i = segs.findIndex(x => /^(flat|apartment|apt|unit|studio)\s+\d+/i.test(x)); return i >= 0 ? `${segs[i].match(/\d+/)![0]} ${segs[i + 1] ?? ''}`.trim() : undefined })()
    ?? segs[0] ?? '')
  const parts = street.split(/\s+/)
  const houseNum = parseInt(parts[0]) || 0
  const word1 = parts[1] || ''
  const word2 = parts[2] || ''
  const hPad = String(houseNum).padStart(3, '0')
  const abbr = (word1.slice(0, 2) + word2.slice(0, 1)).toUpperCase()
  const room = typeof roomNumber === 'number' ? roomNumber : parseInt(String(roomNumber ?? '').match(/\d+/)?.[0] ?? '0')
  return `${hPad}${abbr}${String(room || 0).padStart(2, '0')}`
}

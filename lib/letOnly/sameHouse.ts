// Is this address a house we already have? (16 Oct 2026) — one rule for adding let-only rooms, so Room 3 added months
// after Room 1 lands under the same property instead of making a second "95 Rope Street".
// Same postcode (when both have one) and the same first line — or the same house number and street word, so
// "95 Rope St" and "95 Rope Street" are one house.
const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const firstLine = (v: unknown) => String(v ?? '').split(/[,\n]/)[0]
const numberAndStreet = (v: unknown) => {
  const m = firstLine(v).toLowerCase().match(/^\s*(?:flat\s+\w+\s*,?\s*)?(\d+[a-z]?)\s+([a-z]+)/)
  return m ? `${m[1]} ${m[2]}` : ''
}

export interface HouseLike { name?: string | null; address?: string | null; postcode?: string | null }

export function sameHouse(p: HouseLike, address: string, postcode: string): boolean {
  const pc = norm(postcode), ppc = norm(p.postcode)
  if (pc && ppc && pc !== ppc) return false
  if (!pc && !ppc) { /* no postcodes to go on — first line must match exactly */ }
  const street = norm(firstLine(address)), ns = numberAndStreet(address)
  if (!street) return false
  return [p.name, p.address].some(v => norm(firstLine(v)) === street || (!!ns && numberAndStreet(v) === ns && !!(pc && ppc)))
}

/** "Room 3" when Rooms 1 and 2 exist */
export function nextRoomName(existing: { name?: string | null }[]): string {
  const used = new Set(existing.map(r => parseInt(String(r.name ?? '').match(/\d+/)?.[0] ?? '')).filter(n => n > 0))
  let n = 1; while (used.has(n)) n++
  return `Room ${n}`
}

// A room's public listing, in words (9 Nov 2026: shared by the website's listing page). Server only.
import { createServiceClient } from '@/lib/supabase'
import { loadListing, listingToken, type Listing } from '@/lib/listing/listing'
import type { Station } from '@/lib/listing/area'

// what can be said in public: no flat or house number, no full postcode — "Flat 4, 44 Claverton Street, London,
// SW1V 3AU" → "Claverton Street"; a marketing name ("The Pimlico House") is left as it is
export const publicTitle = (name: string) => {
  const parts = name.split(/\s*[,\n]\s*/).map(p => p.replace(/^(flat|apartment|unit|room)\s*\w+$/i, '').replace(/^\d+[a-z]?\s+/i, '').trim())
    .filter(p => p && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(p) && !/^london$/i.test(p))
  return parts[0] || 'Room to rent'
}
export const gbp = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
export const when = (d: string | null) => !d ? 'Ask us' : d <= today() ? 'Available now' : `From ${new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`

/** The ad's title, as the portals write it: what it is, then where — "Medium double room on Willis Road, E15".
 *  The room type is the one saved on the room ("Large Double Ensuite" → "Large double en-suite room"). */
export function adTitle(l: Listing) {
  const f = l.facts
  const where = l.displayAddress?.trim() || publicTitle(l.displayName)
  if (l.wholeLet) return `${f.bedrooms ? `${f.bedrooms}-bedroom home` : 'Home'} on ${where}`
  let kind = f.roomType && !/single let/i.test(f.roomType) ? f.roomType.toLowerCase().replace(/en-?suite/, 'en-suite').replace(/\s+room$/, '') : f.ensuite ? 'en-suite' : ''
  if (f.ensuite && kind && !kind.includes('en-suite')) kind += ' en-suite'
  const it = `${kind} room`.trim()
  return `${it[0].toUpperCase()}${it.slice(1)} on ${where}`
}
// a written headline is kept as a line under the title — unless it only says the same again ("Double room on Willis Road")
export const extraHeadline = (l: Listing, where: string) => l.headline && !l.headline.toLowerCase().includes(where.toLowerCase()) ? l.headline : null

export async function load(roomId: string, token: string) {
  if (token !== listingToken(roomId)) return null
  return loadListing(createServiceClient() as any, roomId)
}

/** When nobody has written about the room yet, say what the records know — plainly, nothing invented. */
export function autoDescription(l: Listing, where: string, stations: Station[]): string {
  const f = l.facts
  const kind = f.ensuite ? 'room with its own en-suite bathroom' : `${f.roomType ? f.roomType.toLowerCase() + ' ' : ''}room`.replace(/room room/, 'room')
  const first = l.wholeLet
    ? `A ${f.bedrooms ? `${f.bedrooms}-bedroom ` : ''}home on ${where}${f.furnished ? `, ${f.furnished.toLowerCase()}` : ''}${l.billsIncluded ? ', with bills included' : ''}.`
    : `A ${kind} in a ${f.roomsInHouse || f.bedrooms || ''}-bedroom house share on ${where}${f.furnished ? `, ${f.furnished.toLowerCase()}` : ''}${l.billsIncluded ? ', with bills included' : ''}.`.replace(/a -bedroom/, 'a')
  const lines = [first.replace(/\s+/g, ' ')]
  if (!l.wholeLet && f.housemates) lines.push(`You’d be sharing with ${f.housemates} ${f.housemates === 1 ? 'housemate' : 'housemates'}${f.livingRoom ? ', with a shared living room' : ''}${f.bathrooms ? ` and ${f.bathrooms} bathroom${f.bathrooms === 1 ? '' : 's'}` : ''}.`)
  if (stations[0]) lines.push(`${stations[0].name} (${stations[0].lines.slice(0, 2).join(', ') || stations[0].kinds.join(', ')}) is about a ${stations[0].walkMin}-minute walk${stations[1] ? `, and ${stations[1].name} ${stations[1].walkMin} minutes` : ''}.`)
  lines.push('Professionally managed by Capital Rooms — repairs reported in the app, and a team on hand when you need us.')
  return lines.join(' ')
}


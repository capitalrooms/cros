// The four ways a property is written (29 Oct 2026, Harry, on Claverton showing as just "Flat 4"):
//   name       — lists and tiles:          "Flat 4, 44 Claverton Street" · "24 Spurgeon Road"
//   system     — its own screens:           "Flat 4, 44 Claverton Street, SW1V 3AU"
//   paperwork  — letters, agreements, PDFs: "Flat 4, 44 Claverton Street, London, SW1V 3AU"
//   marketing  — Rightmove / website:       "Claverton Street, SW1V" (never the number or the flat)
// The code (044CLS) is separate — properties.property_code.
import { shortAddress } from '@/lib/lettings/letWording'
import { displayAddressFrom } from '@/lib/listing/record'

type P = { name?: string | null; address?: string | null; postcode?: string | null }
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i
const lines = (s?: string | null) => String(s ?? '').split(/\s*[\r\n,]+\s*/).map(x => x.trim()).filter(Boolean)
const full = (p: P) => (lines(p.address).length >= lines(p.name).length ? p.address : p.name) || p.name || p.address || ''

/** "SW1V3AU" / "sw1v 3au" → "SW1V 3AU" */
export function postcodeOf(p: P): string {
  const m = String(p.postcode || full(p)).toUpperCase().match(POSTCODE)
  return m ? `${m[1]} ${m[2]}` : ''
}
export function propertyName(p: P): string { return shortAddress(p.name || p.address) || shortAddress(p.address) }
export function propertySystemAddress(p: P): string { return [propertyName(p), postcodeOf(p)].filter(Boolean).join(', ') }
export function propertyPaperworkAddress(p: P): string {
  const pc = postcodeOf(p)
  const parts = lines(full(p)).filter(x => !POSTCODE.test(x.toUpperCase()) || x.replace(POSTCODE, '').trim())
    .map(x => x.replace(POSTCODE, '').trim()).filter(Boolean)
  if (/^\d+[a-z]?$/i.test(parts[0] ?? '') && parts[1]) parts.splice(0, 2, `${parts[0]} ${parts[1]}`)   // "315", "Eden House" → "315 Eden House"
  return [...parts, pc].filter(Boolean).join(', ')
}
export function propertyMarketingName(p: P): string { return displayAddressFrom(full(p), postcodeOf(p)) }

/**
 * lib/sortProperties.ts
 *
 * Sort property-like objects so that leading house numbers are treated
 * as integers, not strings.
 *
 *   ✅  1, 4, 8, 13, 20, 208
 *   ❌  1, 13, 20, 208, 4, 8   ← plain alphabetical
 *
 * Works on any object with a `name` and/or `address` field.
 * Pass the array; get back a new sorted array (original untouched).
 */
/** The house number a property sorts by: its property code's leading digits (044CLS → 44), otherwise the number
 *  before the street — skipping "Flat 4," / "Room 2," / "Unit 3," prefixes. null when there isn't one (e.g. "E14 HMO"). */
export function houseNumber(p: { name?: string | null; address?: string | null; property_code?: string | null }): number | null {
  const code = (p.property_code || '').match(/^(\d{1,4})/)
  if (code) return Number(code[1])
  const text = (p.name || p.address || '').replace(/^\s*(flat|apartment|apt|room|unit|studio)\s*\w+\s*,?\s*/i, '')
  const m = text.match(/^\s*(\d+)/)
  return m ? Number(m[1]) : null
}

export function sortPropertiesNumerically<
  T extends { name?: string | null; address?: string | null; property_code?: string | null }
>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ha = houseNumber(a), hb = houseNumber(b)
    if (ha != null && hb != null && ha !== hb) return ha - hb
    if (ha != null && hb == null) return -1      // numbered houses first, then names without a number
    if (ha == null && hb != null) return 1
    const na = (a.name || a.address || '').trim()
    const nb = (b.name || b.address || '').trim()
    return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' })
  })
}

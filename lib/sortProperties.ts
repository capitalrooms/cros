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
export function sortPropertiesNumerically<
  T extends { name?: string | null; address?: string | null }
>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const na = (a.name || a.address || '').trim()
    const nb = (b.name || b.address || '').trim()
    return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' })
  })
}

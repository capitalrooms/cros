// Dates written short inside stored text ("received 23 Oct 2026", "expires 16/09/2027") shown in full — "23 October
// 2026" — wherever CROS shows them (Harry, 24 Oct 2026: full dates everywhere). For older activity notes, document
// descriptions and messages; new text is written with full dates in the first place.
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }

export function fullDatesIn(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b\.? (\d{4})\b/g, (_, d, m, y) => `${Number(d)} ${LONG[SHORT[m.toLowerCase()]]} ${y}`)
    .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (all, d, mo, y) => Number(mo) >= 1 && Number(mo) <= 12 && Number(d) <= 31 ? `${Number(d)} ${LONG[Number(mo) - 1]} ${y}` : all)
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (all, y, mo, d) => Number(mo) >= 1 && Number(mo) <= 12 ? `${Number(d)} ${LONG[Number(mo) - 1]} ${y}` : all)
}

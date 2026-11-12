// Floor-plan text → room sizes (12 Nov 2026). Agents' floor plans and listings carry lines like "ROOM 1 8SQM",
// "Bedroom 2  3.20m x 2.90m (10'6" x 9'6")" or "Kitchen 12.4 sq m (133 sq ft)". Paste that text and each line with a
// size becomes a room to confirm; everything else useful ("Total area 85 sq m", "Gas central heating") is kept as
// notes for the house. Plain rules, no AI — the same text always gives the same answer.

export interface TextRoom { label: string; area_sqm: number; dimensions: string }
export interface TextPlan { detected_rooms: TextRoom[]; notes: string[]; total_sqm: number | null; bathrooms_count?: number; ensuite_room_labels: string[] }

const NUM = String.raw`(\d+(?:[.,]\d+)?)`
const SQM = new RegExp(String.raw`${NUM}\s*(?:sq\.?\s*m(?:etres?|eters?)?\b|sqm\b|m²|m2\b|square\s*met(?:re|er)s?)`, 'i')
const SQFT = new RegExp(String.raw`${NUM}\s*(?:sq\.?\s*f(?:ee)?t\b|sqft\b|ft²|ft2\b|square\s*f(?:ee|oo)t)`, 'i')
const DIMS_M = new RegExp(String.raw`${NUM}\s*m?\s*[x×*]\s*${NUM}\s*m\b`, 'i')
const DIMS_FT = /(\d+)\s*['’′]\s*(?:(\d+)\s*(?:["”″]|''))?\s*[x×*]\s*(\d+)\s*['’′]\s*(?:(\d+)\s*(?:["”″]|''))?/i
const n = (s: string) => Number(s.replace(',', '.'))
const r1 = (x: number) => Math.round(x * 10) / 10

/** The room's name: the words before the first size, tidied ("ROOM 1" → "Room 1", "BEDROOM TWO:" → "Bedroom two"). */
function labelOf(line: string, at: number): string {
  const raw = line.slice(0, at).replace(/[:\-–—|•*()]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  return raw.toLowerCase().replace(/^./, c => c.toUpperCase()).replace(/\b(wc|en-suite|ensuite)\b/gi, m => m.toLowerCase() === 'wc' ? 'WC' : m)
}

export function parseFloorPlanText(text: string): TextPlan {
  const out: TextPlan = { detected_rooms: [], notes: [], total_sqm: null, ensuite_room_labels: [] }
  // "Room 1 8sqm Room 2 9sqm" on one line → split before each new label that follows a size
  const lines = text.replace(/\r/g, '').split(/\n|;|(?<=(?:sq\.?\s*m|sqm|m²|m2|sq\.?\s*ft|sqft)\)?)\s*,?\s+(?=[A-Za-z])/i).map(l => l.trim()).filter(Boolean)
  let bathrooms = 0
  for (const line of lines) {
    const m = line.match(SQM), f = line.match(SQFT), dm = line.match(DIMS_M), dft = line.match(DIMS_FT)
    let area = 0, dims = ''
    if (m) area = n(m[1])
    else if (f) area = n(f[1]) / 10.7639
    if (dm) { dims = `${dm[1]}m × ${dm[2]}m`; if (!area) area = n(dm[1]) * n(dm[2]) }
    else if (dft) {
      const a = Number(dft[1]) + Number(dft[2] ?? 0) / 12, b = Number(dft[3]) + Number(dft[4] ?? 0) / 12
      dims = dft[0].replace(/\s+/g, ' ').trim(); if (!area) area = a * b * 0.092903
    }
    const firstAt = Math.min(...[m, f, dm, dft].filter(Boolean).map(x => (x as RegExpMatchArray).index ?? Infinity))
    const label = area ? labelOf(line, firstAt) : ''
    if (area && /\b(total|gross|approx(?:imate)?\s+(?:gross\s+)?(?:internal\s+)?(?:floor\s+)?area|internal area|floor area|GIA)\b/i.test(label || line)) {
      out.total_sqm = r1(area); out.notes.push(line); continue
    }
    if (area && label) {
      out.detected_rooms.push({ label, area_sqm: r1(area), dimensions: dims })
      if (/en-?suite/i.test(line)) out.ensuite_room_labels.push(label)
      if (/bath|shower/i.test(label) && !/en-?suite/i.test(label)) bathrooms++
      continue
    }
    // no size: still worth keeping if it says something ("Gas central heating", "Garden 30ft", "Not to scale" isn't)
    if (line.length > 3 && !/not to scale|for illustrat|measurements are approx|copyright|©|produced (for|by)|floorplan by|www\.|plan for guidance/i.test(line)) out.notes.push(line)
  }
  if (bathrooms) out.bathrooms_count = bathrooms
  return out
}

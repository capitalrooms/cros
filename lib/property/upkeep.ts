// Upkeep by area (6 Nov 2026, Harry: "how much they have spent on communal area upkeep like painting … so they can see
// it's been ages since I spent on decorating in the kitchen, it needs it"). Every expense and imported statement line
// for a house is read for WHERE (kitchen, bathroom, hallway & stairs, a bedroom, outside…) and WHAT (decorating,
// flooring, plumbing…). One line can name several ("Painting Room 2 and repair one room ceiling") — it counts towards
// each area it names — split equally unless the office has set the split (upkeep_splits, migration 270). Per area: when it was last decorated, what's been spent each
// year, and a nudge when decorating is due. Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'

export const AREAS: { key: string; label: string; re: RegExp; communal: boolean }[] = [
  { key: 'kitchen', label: 'Kitchen', re: /kitchen|cooker|oven|hob|extractor|worktop/i, communal: true },
  { key: 'bathroom', label: 'Bathrooms & toilets', re: /bath|shower|toilet|\bwc\b|loo|basin|en-?suite/i, communal: true },
  { key: 'hallway', label: 'Hallway & stairs', re: /hall|stair|landing|corridor|entrance|front door|communal/i, communal: true },
  { key: 'living', label: 'Living room', re: /living|lounge|sitting room|reception/i, communal: true },
  { key: 'outside', label: 'Outside & garden', re: /garden|gate|fence|tree|hedge|roof|gutter|exterior|outside|bins?\b|drive|patio|window clean/i, communal: true },
]
export const WORK: { key: string; label: string; re: RegExp }[] = [
  { key: 'decorating', label: 'Decorating', re: /paint|decorat|repaint|emulsion|wallpaper|touch[- ]?up|plaster|skim/i },
  { key: 'flooring', label: 'Flooring', re: /carpet|floor|vinyl|laminate|lino|tiles?\b/i },
  { key: 'plumbing', label: 'Plumbing', re: /leak|pipe|plumb|tap|drain|blocked|toilet system|cistern|boiler|radiator/i },
  { key: 'electrical', label: 'Electrical', re: /socket|electric|light|bulb|fuse|wiring|switch/i },
  { key: 'furniture', label: 'Furniture & fittings', re: /bed|mattress|wardrobe|drawer|sofa|chair|table|desk|blind|curtain|shelf|door/i },
  { key: 'appliances', label: 'Appliances', re: /washing machine|dishwasher|fridge|freezer|microwave|dryer|kettle|toaster|appliance/i },
  { key: 'cleaning', label: 'Cleaning', re: /clean|deep clean|carpet clean/i },
  { key: 'garden', label: 'Garden', re: /garden|hedge|tree|lawn|weed/i },
]
/** how long before a communal area's decorating is worth looking at again (years) */
const DECORATE_EVERY = 4

export interface UpkeepLine { id: string; date: string; amount: number; full: number; description: string; source: 'expense' | 'statement'; work: string[]; areas: { key: string; label: string }[]; splitSet: boolean }
export interface UpkeepArea {
  key: string; label: string; communal: boolean
  total: number; byYear: Record<string, number>
  lastDecorated: string | null; lastSpend: string | null
  decoratingDue: boolean                       // communal, and nothing on decorating for DECORATE_EVERY years (or ever, on record)
  lines: UpkeepLine[]
}
export interface Upkeep { since: string | null; areas: UpkeepArea[] }

const roomKey = (d: string) => d.match(/\broom\s*(\d{1,2})\b/i)?.[1]

export async function upkeepFor(s: SupabaseClient, propertyId: string): Promise<Upkeep> {
  const [{ data: ex }, { data: st }, { data: rooms }, { data: sp }] = await Promise.all([
    s.from('recharge_expenses').select('id, description, notes, amount, expense_date, room_id').eq('property_id', propertyId).is('voided_at', null),
    s.from('statement_line_items').select('id, description, amount, statement_date').eq('property_id', propertyId),
    s.from('rooms').select('id, name').eq('property_id', propertyId),
    s.from('upkeep_splits').select('source, line_id, splits'),   // the office's own splits (migration 270); none → equal
  ])
  const splitOf = new Map(((sp ?? []) as any[]).map(x => [`${x.source}:${x.line_id}`, x.splits as { area: string; amount: number }[]]))
  const roomName = new Map(((rooms ?? []) as any[]).map(r => [r.id, String(r.name)]))
  const raw = [
    ...((ex ?? []) as any[]).map(e => ({ id: e.id as string, date: e.expense_date, amount: Math.abs(Number(e.amount)), description: `${e.description ?? ''}${e.room_id && roomName.get(e.room_id) ? ` (${roomName.get(e.room_id)})` : ''}`, notes: e.notes ?? '', source: 'expense' as const })),
    ...((st ?? []) as any[]).map(l => ({ id: l.id as string, date: l.statement_date, amount: Math.abs(Number(l.amount)), description: String(l.description ?? ''), notes: '', source: 'statement' as const })),
  ].filter(l => l.date && l.amount > 0 && !/\brent\b|management fee|letting fee|commission|insurance|licen[cs]e|certificate|gas safe|eicr|epc|council tax|service charge|ground rent/i.test(l.description))

  const areas = new Map<string, UpkeepArea>()
  const area = (key: string, label: string, communal: boolean) => {
    if (!areas.has(key)) areas.set(key, { key, label, communal, total: 0, byYear: {}, lastDecorated: null, lastSpend: null, decoratingDue: false, lines: [] })
    return areas.get(key)!
  }
  for (const l of raw) {
    const text = `${l.description} ${l.notes}`
    const where: { key: string; label: string; communal: boolean }[] = AREAS.filter(a => a.re.test(text))
    const room = roomKey(text)
    if (room) where.push({ key: `room-${room}`, label: `Room ${room}`, communal: false })
    // can't tell where: shown as "Not yet placed" (never dropped — every pound spent appears somewhere); the office
    // places it by setting its split
    if (!where.length) where.push({ key: 'unplaced', label: 'Not yet placed', communal: false })
    const work = WORK.filter(w => w.re.test(text)).map(w => w.key)
    const set = splitOf.get(`${l.source}:${l.id}`)
    // a split the office set decides the areas outright — even ones the description doesn't name
    if (set?.length) {
      where.length = 0
      for (const x of set) {
        const known = AREAS.find(a => a.key === x.area)
        where.push(known ? { key: known.key, label: known.label, communal: known.communal } : { key: x.area, label: x.area.startsWith('room-') ? `Room ${x.area.slice(5)}` : 'Not yet placed', communal: false })
      }
    }
    const share = Math.round((l.amount / where.length) * 100) / 100
    const lineAreas = where.map(w => ({ key: w.key, label: w.label }))
    for (const [wi, w] of where.entries()) {
      // equal shares to the penny — the last takes any leftover penny, so the parts always make the whole exactly
      const amount = set ? Number(set.find(x => x.area === w.key)?.amount ?? 0) : wi === where.length - 1 ? Math.round((l.amount - share * (where.length - 1)) * 100) / 100 : share
      if (set && !amount) continue
      const a = area(w.key, w.label, w.communal)
      a.total += amount
      const y = l.date.slice(0, 4)
      a.byYear[y] = Math.round(((a.byYear[y] ?? 0) + amount) * 100) / 100
      if (!a.lastSpend || l.date > a.lastSpend) a.lastSpend = l.date
      if (work.includes('decorating') && (!a.lastDecorated || l.date > a.lastDecorated)) a.lastDecorated = l.date
      a.lines.push({ id: l.id, date: l.date, amount, full: l.amount, description: l.description, source: l.source, work, areas: lineAreas, splitSet: !!set })
    }
  }
  const since = raw.map(l => l.date).sort()[0] ?? null
  const cutoff = new Date(Date.now() - DECORATE_EVERY * 365.25 * 86_400_000).toISOString().slice(0, 10)
  // the communal areas always show, even with nothing on record — "nothing since 2023" is the point
  for (const a of AREAS) area(a.key, a.label, a.communal)
  const out = [...areas.values()].map(a => ({
    ...a, total: Math.round(a.total * 100) / 100,
    decoratingDue: a.communal && a.key !== 'outside' && (!a.lastDecorated || a.lastDecorated < cutoff),
    lines: a.lines.sort((x, y) => y.date.localeCompare(x.date)),
  }))
  out.sort((a, b) => Number(a.key === 'unplaced') - Number(b.key === 'unplaced') || Number(b.communal) - Number(a.communal) || Number(b.decoratingDue) - Number(a.decoratingDue) || a.label.localeCompare(b.label, undefined, { numeric: true }))
  return { since, areas: out }
}

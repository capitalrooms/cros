// Upkeep by area (6 Nov 2026, Harry: "how much they have spent on communal area upkeep like painting … so they can see
// it's been ages since I spent on decorating in the kitchen, it needs it"). Every expense and imported statement line
// for a house is read for WHERE (kitchen, bathroom, hallway & stairs, a bedroom, outside…) and WHAT (decorating,
// flooring, plumbing…). One line can name several ("Painting Room 2 and repair one room ceiling") — it counts towards
// each area it names (its amount is shared between them). Per area: when it was last decorated, what's been spent each
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

export interface UpkeepLine { date: string; amount: number; description: string; source: 'expense' | 'statement'; work: string[] }
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
  const [{ data: ex }, { data: st }, { data: rooms }] = await Promise.all([
    s.from('recharge_expenses').select('description, notes, amount, expense_date, room_id').eq('property_id', propertyId).is('voided_at', null),
    s.from('statement_line_items').select('description, amount, statement_date').eq('property_id', propertyId),
    s.from('rooms').select('id, name').eq('property_id', propertyId),
  ])
  const roomName = new Map(((rooms ?? []) as any[]).map(r => [r.id, String(r.name)]))
  const raw = [
    ...((ex ?? []) as any[]).map(e => ({ date: e.expense_date, amount: Math.abs(Number(e.amount)), description: `${e.description ?? ''}${e.room_id && roomName.get(e.room_id) ? ` (${roomName.get(e.room_id)})` : ''}`, notes: e.notes ?? '', source: 'expense' as const })),
    ...((st ?? []) as any[]).map(l => ({ date: l.statement_date, amount: Math.abs(Number(l.amount)), description: String(l.description ?? ''), notes: '', source: 'statement' as const })),
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
    if (!where.length) continue   // can't tell where — left out rather than guessed
    const work = WORK.filter(w => w.re.test(text)).map(w => w.key)
    const share = Math.round((l.amount / where.length) * 100) / 100
    for (const w of where) {
      const a = area(w.key, w.label, w.communal)
      a.total += share
      const y = l.date.slice(0, 4)
      a.byYear[y] = Math.round(((a.byYear[y] ?? 0) + share) * 100) / 100
      if (!a.lastSpend || l.date > a.lastSpend) a.lastSpend = l.date
      if (work.includes('decorating') && (!a.lastDecorated || l.date > a.lastDecorated)) a.lastDecorated = l.date
      a.lines.push({ date: l.date, amount: share, description: l.description, source: l.source, work })
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
  out.sort((a, b) => Number(b.communal) - Number(a.communal) || Number(b.decoratingDue) - Number(a.decoratingDue) || a.label.localeCompare(b.label, undefined, { numeric: true }))
  return { since, areas: out }
}

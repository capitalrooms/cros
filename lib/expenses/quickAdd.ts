// Quick add (5 Nov 2026, Harry: "a bulk … text box where you could with a property address above a list of items
// quickly add a bunch of expense items"). Reads pasted text into draft expenses, nothing saved:
//
//   4 Willis Road
//   Mattress protector Room 2 £15.99 Amazon
//   Bulbs x4 £8.50 from Screwfix 3/11
//   12 Saltwell Street
//   Smoke alarm £22 Toolstation
//
// A line with an amount is an item; a line without one names the house (by its code, e.g. 004WIR, or its number and
// street). Each item keeps its own description; the supplier, a room ("Room 2"), a date ("3/11", "yesterday") and a
// category are picked out where they're written. Everything is shown for checking before anything is added.
import { PROPERTY_WIDE_CATEGORIES, ROOM_SPECIFIC_CATEGORY_TYPES } from '@/lib/expense-categories'

export interface QuickProperty { id: string; name: string | null; address?: string | null; property_code?: string | null }
export interface QuickRoom { id: string; property_id: string; name: string }
export interface QuickDraft {
  line: number; text: string
  property_id: string | null; property: string | null
  room_id: string | null; room: string | null
  description: string; amount: number | null; supplier: string | null; expense_date: string; category: string | null
  problem: string | null
}

// shops staff buy from most — matched as words, so "Amazon" in "Mattress protector Amazon" is the supplier
const SHOPS = ['Amazon', 'Screwfix', 'Toolstation', 'B&Q', 'Argos', 'IKEA', 'Dunelm', 'Wickes', 'Currys', 'eBay', 'John Lewis', 'Asda', 'Tesco', 'Sainsbury’s', 'Sainsburys', 'Homebase', 'Wilko', 'Robert Dyas', 'Lidl', 'Aldi', 'Poundland', 'Home Bargains', 'The Range', 'Jewson', 'Travis Perkins', 'City Plumbing', 'CEF', 'Selco']
const AMOUNT = /£\s?(\d[\d,]*(?:\.\d{1,2})?)|(?:^|\s)(\d[\d,]*\.\d{2})(?=\s|$)/
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The house a heading line names: its code, else its number and street (the first line of its name or address). */
export function matchProperty(text: string, props: QuickProperty[]): QuickProperty | null {
  const t = squash(text)
  if (!t) return null
  const byCode = props.find(p => p.property_code && t.includes(squash(p.property_code)))
  if (byCode) return byCode
  const first = (p: QuickProperty) => squash(String(p.name || p.address || '').split(/[,\n]/)[0])
  const exact = props.filter(p => first(p) && (t.startsWith(first(p)) || first(p).startsWith(t)))
  if (exact.length === 1) return exact[0]
  // "Willis Rd" / "4 Willis": number + the street's first word
  const m = text.toLowerCase().match(/(\d+[a-z]?)\s+([a-z']+)/)
  if (m) {
    const hits = props.filter(p => { const f = String(p.name || p.address || '').toLowerCase().split(/[,\n]/)[0]; return f.startsWith(`${m[1]} `) && f.includes(m[2]) })
    if (hits.length === 1) return hits[0]
  }
  return null
}

function dateIn(text: string, today: Date): { date: string; rest: string } {
  let rest = text, date = iso(today)
  if (/\byesterday\b/i.test(rest)) { const d = new Date(today); d.setDate(d.getDate() - 1); date = iso(d); rest = rest.replace(/\byesterday\b/i, ' ') }
  else if (/\btoday\b/i.test(rest)) rest = rest.replace(/\btoday\b/i, ' ')
  const m = rest.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?\b/)
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear()
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]))
    if (!isNaN(d.getTime()) && d.getMonth() === Number(m[2]) - 1) {
      if (!m[3] && d > today) d.setFullYear(y - 1)   // "3/12" written in January is last December
      date = iso(d); rest = rest.replace(m[0], ' ')
    }
  }
  return { date, rest }
}

/** The category whose words appear in the description; room items use the room categories. */
export function guessCategory(description: string, inRoom: boolean): string | null {
  const d = ` ${description.toLowerCase()} `
  const has = (k: string) => d.includes(` ${k.toLowerCase()}`) || d.includes(`${k.toLowerCase()} `)
  if (inRoom) { const r = ROOM_SPECIFIC_CATEGORY_TYPES.find(c => c.keywords.some(has)); if (r) return r.slug }
  const p = PROPERTY_WIDE_CATEGORIES.find(c => c.type !== 'income' && !['management_fee', 'letting_fee'].includes(c.slug) && c.keywords.some(has))
  return p?.slug ?? (inRoom ? 'room_other' : null)
}

export function parseQuickAdd(text: string, props: QuickProperty[], rooms: QuickRoom[], today = new Date()): QuickDraft[] {
  const out: QuickDraft[] = []
  let house: QuickProperty | null = null
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/^[\s•*\-–—]+/, '').trim()
    if (!line) return
    const amt = line.match(AMOUNT)
    if (!amt) {   // a heading: the house the next items are for
      house = matchProperty(line, props)
      if (!house) out.push({ line: i + 1, text: line, property_id: null, property: null, room_id: null, room: null, description: line, amount: null, supplier: null, expense_date: iso(today), category: null, problem: 'No house matches this line — check the address or use its code (e.g. 004WIR)' })
      return
    }
    const amount = Number((amt[1] ?? amt[2]).replace(/,/g, ''))
    let rest = line.replace(amt[0], ' ')
    const { date, rest: r2 } = dateIn(rest, today); rest = r2
    // supplier: "from / by / at / via X", else a known shop named anywhere
    let supplier: string | null = null
    const via = rest.match(/\b(?:from|by|at|via)\s+([A-Z][\w&’'.-]*(?:\s+[A-Z][\w&’'.-]*)?)/)
    if (via) { supplier = via[1]; rest = rest.replace(via[0], ' ') }
    else {
      const shop = SHOPS.find(s => new RegExp(`(^|[^a-z])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(rest))
      if (shop) { supplier = shop; rest = rest.replace(new RegExp(shop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ') }
    }
    // the room, by name ("Room 2", "room 2", "Rm 2")
    const rm = rest.match(/\b(?:room|rm)\s*(\d+[a-z]?)\b/i)
    const room = house && rm ? rooms.find(x => x.property_id === house!.id && squash(x.name) === squash(`room${rm[1]}`)) ?? null : null
    if (room && rm) rest = rest.replace(rm[0], ' ')
    // what's left is the description — without delivery chatter
    const description = rest.replace(/\b(free\s+)?(delivered|delivery|next day|prime)\b/gi, ' ').replace(/\s*[-–—,:;]\s*$/g, '').replace(/^\s*[-–—,:;]\s*/, '').replace(/\s{2,}/g, ' ').trim()
    const problem = !house ? 'Put the house’s address on a line above this item' : !description ? 'Say what it was' : amount <= 0 ? 'The amount must be more than £0' : null
    out.push({
      line: i + 1, text: line, property_id: house?.id ?? null, property: house ? String(house.name || house.address || '').split(/[,\n]/)[0] : null,
      room_id: room?.id ?? null, room: room?.name ?? (rm ? `Room ${rm[1]} (not found)` : null),
      description: description ? description[0].toUpperCase() + description.slice(1) : '', amount, supplier, expense_date: date,
      category: guessCategory(description, !!room), problem,
    })
  })
  return out
}

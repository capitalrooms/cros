// Void rate: how long managed rooms sat empty over the last 3, 6 or 12 months.
// Counted only from when CROS has a record for each room (its first recorded tenancy, or the day the room was
// put on the market if it has never had one) — older history isn't on file yet, so it is shown as "not on record",
// never as empty. A room with neither (a house still being refurbished) isn't counted at all.
// When the records say empty but the room is still marked let (a tenancy ended and nothing was recorded after it),
// those days are "check", not counted, and the room is listed so the records can be put right.
import type { SupabaseClient } from '@supabase/supabase-js'

export const VOID_WINDOWS = [3, 6, 12] as const
export type VoidWindow = typeof VOID_WINDOWS[number]

const DAY = 86400000
const toDay = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / DAY)
const toIso = (d: number) => new Date(d * DAY + DAY / 2).toISOString().slice(0, 10)
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim().replace(/,.*$/, '')
const monthsBack = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10) }

export interface VoidRoom {
  id: string; name: string; houseId: string; house: string; landlordId: string | null; landlord: string
  knownFrom: string; rent: number | null
  // per window: days counted, days empty, rent lost, timeline segments [fromDay, toDay, kind] as offsets from the window start
  w: Record<VoidWindow, { counted: number; empty: number; lost: number; segments: [number, number, 'let' | 'empty' | 'unknown' | 'check'][] }>
  emptyNowSince: string | null
  check: string | null      // why the records need looking at
}
export interface VoidGroup { id: string; name: string; rooms: number; counted: number; empty: number; lost: number; rate: number }

export async function loadVoids(s: SupabaseClient, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) {
  const [{ data: props }, { data: rooms }, { data: tens }] = await Promise.all([
    s.from('properties').select('id, name, address, landlord_id, letting_type, is_demo'),
    s.from('rooms').select('id, property_id, name, status, created_at, available_date, current_asking_rent, is_let_only'),
    s.from('tenancies').select('room_id, start_date, end_date, rent_amount, let_cancelled_at'),
  ]) as { data: any[] | null }[]
  const managed = new Map((props ?? []).filter(p => !p.is_demo && p.letting_type !== 'let_only').map(p => [p.id, p]))
  const landlordIds = [...new Set([...managed.values()].map(p => p.landlord_id).filter(Boolean))]
  const { data: lls } = landlordIds.length ? await s.from('people').select('id, first_name, last_name, full_name, company').in('id', landlordIds) : { data: [] }
  const llName = new Map(((lls ?? []) as any[]).map(p => [p.id, p.company || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Landlord']))

  const end = toDay(today) + 1   // up to and including today
  const byRoom = new Map<string, any[]>()
  for (const t of tens ?? []) if (!t.let_cancelled_at && t.start_date) (byRoom.get(t.room_id) ?? byRoom.set(t.room_id, []).get(t.room_id)!).push(t)

  const out: VoidRoom[] = []
  const gaps: number[] = []   // finished gaps between two tenancies (days), any time on record
  for (const r of rooms ?? []) {
    const p = managed.get(r.property_id)
    if (!p || r.is_let_only) continue
    const ts = (byRoom.get(r.id) ?? []).sort((a, b) => a.start_date.localeCompare(b.start_date))
    const firstStart = ts[0]?.start_date as string | undefined
    const marketed = r.status === 'available'
    // only what's on file: a room with no tenancy on record counts only once it's on the market (from its
    // available date); with neither (e.g. a house still being refurbished) it isn't counted at all
    if (!(firstStart && firstStart <= today) && !marketed) continue
    const knownFrom = firstStart && firstStart <= today ? firstStart : String(r.available_date || r.created_at || today).slice(0, 10)
    const lets = ts.map(t => [toDay(t.start_date), t.end_date ? toDay(t.end_date) + 1 : Infinity] as [number, number])
    for (let i = 1; i < ts.length; i++) {
      const prevEnd = ts[i - 1].end_date
      if (prevEnd && ts[i].start_date > prevEnd) gaps.push(toDay(ts[i].start_date) - toDay(prevEnd) - 1)
    }
    const latest = [...ts].reverse().find(t => Number(t.rent_amount) > 0)
    const rent = latest ? Number(latest.rent_amount) : r.current_asking_rent ? Number(r.current_asking_rent) : null
    const letOn = (d: number) => lets.some(([a, b]) => d >= a && d < b)
    let emptyNowSince: string | null = null
    if (!letOn(end - 1) && toDay(knownFrom) < end) { let d = end - 1; while (d > toDay(knownFrom) && !letOn(d - 1)) d--; emptyNowSince = toIso(d) }
    // records say empty, room says let → those trailing days are unconfirmed
    const checkFrom = emptyNowSince && !marketed ? toDay(emptyNowSince) : Infinity
    const check = emptyNowSince && !marketed ? `Marked let, but no tenancy on file since ${new Date(`${emptyNowSince}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : null

    const w = {} as VoidRoom['w']
    for (const m of VOID_WINDOWS) {
      const start = toDay(monthsBack(today, m)), known = Math.max(start, toDay(knownFrom))
      const segments: VoidRoom['w'][VoidWindow]['segments'] = []
      let counted = 0, empty = 0
      for (let d = start; d < end; d++) {
        const kind = d < known ? 'unknown' : letOn(d) ? 'let' : d >= checkFrom ? 'check' : 'empty'
        if (kind === 'let' || kind === 'empty') { counted++; if (kind === 'empty') empty++ }
        const last = segments[segments.length - 1]
        if (last && last[2] === kind) last[1] = d - start + 1; else segments.push([d - start, d - start + 1, kind])
      }
      w[m] = { counted, empty, lost: rent ? Math.round(empty * rent * 12 / 365 * 100) / 100 : 0, segments }
    }
    out.push({ id: r.id, name: r.name ?? '', houseId: p.id, house: firstLine(p.name || p.address), landlordId: p.landlord_id ?? null, landlord: llName.get(p.landlord_id) ?? 'No landlord set', knownFrom, rent, w, emptyNowSince: marketed ? emptyNowSince : null, check })
  }
  out.sort((a, b) => a.house.localeCompare(b.house, 'en', { numeric: true }) || a.name.localeCompare(b.name, 'en', { numeric: true }))

  const group = (key: (r: VoidRoom) => [string, string], m: VoidWindow): VoidGroup[] => {
    const g = new Map<string, VoidGroup>()
    for (const r of out) {
      const [id, name] = key(r)
      const x = g.get(id) ?? { id, name, rooms: 0, counted: 0, empty: 0, lost: 0, rate: 0 }
      x.rooms++; x.counted += r.w[m].counted; x.empty += r.w[m].empty; x.lost += r.w[m].lost
      g.set(id, x)
    }
    return [...g.values()].map(x => ({ ...x, lost: Math.round(x.lost * 100) / 100, rate: x.counted ? Math.round(x.empty / x.counted * 1000) / 10 : 0 })).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
  }
  const summary = Object.fromEntries(VOID_WINDOWS.map(m => {
    const counted = out.reduce((a, r) => a + r.w[m].counted, 0), empty = out.reduce((a, r) => a + r.w[m].empty, 0)
    const full = out.filter(r => r.w[m].segments.every(sg => sg[2] === 'let' || sg[2] === 'empty')).length
    return [m, {
      rate: counted ? Math.round(empty / counted * 1000) / 10 : 0, emptyDays: empty, countedDays: counted,
      lost: Math.round(out.reduce((a, r) => a + r.w[m].lost, 0)), fullyOnRecord: full, rooms: out.length,
      byLandlord: group(r => [r.landlordId ?? 'none', r.landlord], m), byHouse: group(r => [r.houseId, r.house], m),
    }]
  })) as Record<VoidWindow, { rate: number; emptyDays: number; countedDays: number; lost: number; fullyOnRecord: number; rooms: number; byLandlord: VoidGroup[]; byHouse: VoidGroup[] }>
  return {
    today, rooms: out, summary,
    avgDaysToRelet: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null, relets: gaps.length,
    emptyNow: out.filter(r => r.emptyNowSince).map(r => ({ room: r.name, house: r.house, since: r.emptyNowSince!, rent: r.rent })),
    checks: out.filter(r => r.check).map(r => ({ room: r.name, house: r.house, houseId: r.houseId, why: r.check! })),
  }
}

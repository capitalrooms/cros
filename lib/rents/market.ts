// The market in an area (12 Nov 2026, Harry: "a valuation estimator … what would a 1 bed, 2 bed-5 bed or a room or an
// en-suite typically go for in x area … sales and rents both … a smart graphic summary … metrics we could use in
// conversation"). Three free sources, each named on screen:
//   · rents — ONS Price Index of Private Rents (lib/rents/ons, table ons_rents): whole homes by bedrooms, monthly
//   · sales — HM Land Registry UK House Price Index (landregistry.data.gov.uk, linked-data JSON): average price by type
//   · rooms — our own rooms in that borough (asking rents and the rents on current tenancies), split en-suite / not
// Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'

const UA = { 'User-Agent': 'CapitalRooms-CROS/1.0 (lettings software)' }
export const HPI_SOURCE = 'HM Land Registry UK House Price Index'

export interface Sales { month: string; average: number | null; change12: number | null; change1: number | null; flat: number | null; terraced: number | null; semi: number | null; detached: number | null; firstTime: number | null; changeFlat: number | null; changeTerraced: number | null; sales: number | null }
export interface OurRooms { rooms: number; roomMedian: number | null; roomLow: number | null; roomHigh: number | null; ensuites: number; ensuiteMedian: number | null; ensuiteLow: number | null; ensuiteHigh: number | null; wholeLets: number; wholeMedian: number | null }

const slug = (name: string) => name.toLowerCase().replace(/&/g, 'and').replace(/[,.']/g, '').replace(/\s+/g, '-')
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The Land Registry's months for an area, newest first, in ONE request (12 Nov 2026: a request per month got
 *  throttled and left gaps in the charts). Cached for a day. */
// the list only returns the fields it's asked for
const PROPS = ['refMonth', 'averagePrice', 'percentageAnnualChange', 'percentageChange', 'averagePriceFlatMaisonette', 'averagePriceTerraced', 'averagePriceSemiDetached', 'averagePriceDetached', 'averagePriceFirstTimeBuyer', 'percentageAnnualChangeFlatMaisonette', 'percentageAnnualChangeTerraced', 'salesVolume'].join(',')
async function hpiMonths(areaName: string, n: number): Promise<any[]> {
  const r = await fetch(`https://landregistry.data.gov.uk/data/ukhpi/region/${slug(areaName)}.json?_pageSize=${n}&_sort=-refMonth&_properties=${PROPS}`, { headers: UA, next: { revalidate: 86400 } } as any).catch(() => null)
  if (!r?.ok) return []
  return ((await r.json().catch(() => null))?.result?.items ?? []).filter((t: any) => num(t.averagePrice) != null)
}

/** The latest month the Land Registry has published for an area (it runs about two months behind). */
export async function salesFor(areaName: string): Promise<Sales | null> {
  const t = (await hpiMonths(areaName, 1))[0]
  if (!t) return null
  return { month: String(t.refMonth).slice(0, 7), average: num(t.averagePrice), change12: num(t.percentageAnnualChange), change1: num(t.percentageChange), flat: num(t.averagePriceFlatMaisonette), terraced: num(t.averagePriceTerraced),
    semi: num(t.averagePriceSemiDetached), detached: num(t.averagePriceDetached), firstTime: num(t.averagePriceFirstTimeBuyer), changeFlat: num(t.percentageAnnualChangeFlatMaisonette),
    changeTerraced: num(t.percentageAnnualChangeTerraced), sales: num(t.salesVolume) }
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) }
const pctl = (xs: number[], p: number) => { if (xs.length < 3) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]) }

/** Our own rooms in a borough: what's being asked and what's being paid now. */
export async function ourRooms(s: SupabaseClient, areaCode: string): Promise<OurRooms> {
  const { data: props } = await s.from('properties').select('id, postcode, property_type').not('postcode', 'is', null)
  const list = (props ?? []) as any[]
  const codes = new Map<string, string>()
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100)
    const r = await fetch('https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postcodes: batch.map(p => p.postcode) }) }).then(x => x.json()).catch(() => null)
    for (const row of r?.result ?? []) if (row?.result?.codes?.admin_district) codes.set(String(row.query).toUpperCase().replace(/\s/g, ''), row.result.codes.admin_district)
  }
  const here = list.filter(p => codes.get(String(p.postcode).toUpperCase().replace(/\s/g, '')) === areaCode)
  const empty: OurRooms = { rooms: 0, roomMedian: null, roomLow: null, roomHigh: null, ensuites: 0, ensuiteMedian: null, ensuiteLow: null, ensuiteHigh: null, wholeLets: 0, wholeMedian: null }
  if (!here.length) return empty
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const [{ data: rooms }, { data: lets }] = await Promise.all([
    s.from('rooms').select('id, property_id, has_ensuite, current_asking_rent').in('property_id', here.map(p => p.id)),
    s.from('tenancies').select('room_id, rent_amount, end_date, let_cancelled_at').in('property_id', here.map(p => p.id)).lte('start_date', today),
  ])
  const paying = new Map<string, number>()
  for (const t of (lets ?? []) as any[]) if (!t.let_cancelled_at && (!t.end_date || t.end_date >= today) && Number(t.rent_amount) > 0) paying.set(t.room_id, Number(t.rent_amount))
  const whole = new Set(here.filter(p => !/hmo/i.test(String(p.property_type ?? 'hmo'))).map(p => p.id))
  const room: number[] = [], ens: number[] = [], wl: number[] = []
  for (const r of (rooms ?? []) as any[]) {
    const rent = paying.get(r.id) ?? (Number(r.current_asking_rent) > 0 ? Number(r.current_asking_rent) : null)
    if (!rent || rent < 300 || rent > 15000) continue
    if (whole.has(r.property_id)) wl.push(rent); else if (r.has_ensuite) ens.push(rent); else room.push(rent)
  }
  return { rooms: room.length, roomMedian: median(room), roomLow: pctl(room, 0.2), roomHigh: pctl(room, 0.8), ensuites: ens.length, ensuiteMedian: median(ens), ensuiteLow: pctl(ens, 0.2), ensuiteHigh: pctl(ens, 0.8), wholeLets: wl.length, wholeMedian: median(wl) }
}

/** House prices month by month for the last `months` (Land Registry), oldest first. */
export async function salesHistory(areaName: string, months = 24): Promise<{ month: string; average: number | null; change12: number | null }[]> {
  return (await hpiMonths(areaName, months)).map(t => ({ month: String(t.refMonth).slice(0, 7), average: num(t.averagePrice), change12: num(t.percentageAnnualChange) })).reverse()
}

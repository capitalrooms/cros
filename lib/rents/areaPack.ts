// Everything we know about an area's market, in one shape (12 Nov 2026) — for "Ask the data" and the market report.
// Rents (ONS, latest + 3 years of months), house prices (Land Registry, latest + 2 years), our own rooms, the gross
// yield, and London to compare. Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'
import { rentHistory, ONS_SOURCE } from '@/lib/rents/ons'
import { salesFor, salesHistory, ourRooms, HPI_SOURCE, type Sales, type OurRooms } from '@/lib/rents/market'

export interface AreaPack {
  code: string; name: string; region: string | null
  rents: Record<string, any>; rentTrend: { period: string; all: number | null; one: number | null; two: number | null; three: number | null }[]
  sales: Sales | null; salesTrend: { month: string; average: number | null; change12: number | null }[]
  ours: OurRooms | null; yieldAll: number | null; yieldFlat: number | null
}
export const SOURCES = { rents: ONS_SOURCE, sales: HPI_SOURCE }

export async function areaPack(s: SupabaseClient, code: string, o: { ours?: boolean } = {}): Promise<AreaPack | null> {
  const { data: rents } = await s.from('ons_rents').select('*').eq('area_code', code).maybeSingle() as { data: any }
  if (!rents) return null
  const [rentTrend, sales, salesTrend, ours] = await Promise.all([
    rentHistory(s, code, 36).catch(() => []), salesFor(rents.area_name).catch(() => null), salesHistory(rents.area_name, 24).catch(() => []),
    o.ours === false ? Promise.resolve(null) : ourRooms(s, code).catch(() => null),
  ])
  const yieldAll = rents.rent_all && sales?.average ? Math.round(rents.rent_all * 12 / sales.average * 1000) / 10 : null
  const yieldFlat = rents.rent_flat && sales?.flat ? Math.round(rents.rent_flat * 12 / sales.flat * 1000) / 10 : null
  return { code, name: rents.area_name, region: rents.region, rents, rentTrend, sales, salesTrend, ours, yieldAll, yieldFlat }
}

/** The pack as compact text for the AI — figures only. */
export function packText(p: AreaPack): string {
  const r = p.rents, s = p.sales
  const yearly = (arr: { all?: number | null; average?: number | null }[], key: 'all' | 'average', every: number) => arr.filter((_, i) => (arr.length - 1 - i) % every === 0).map((x: any) => `${(x.period ?? x.month).slice(0, 7)}: £${x[key]?.toLocaleString('en-GB') ?? '—'}`).join(', ')
  return [
    `AREA: ${p.name} (${p.region ?? ''})`,
    `Rents ${r.period.slice(0, 7)} (ONS, whole homes, monthly): average £${r.rent_all} (${r.change_all}% on a year), 1-bed £${r.rent_1} (${r.change_1}%), 2-bed £${r.rent_2} (${r.change_2}%), 3-bed £${r.rent_3} (${r.change_3}%), 4+ bed £${r.rent_4} (${r.change_4}%), flats £${r.rent_flat}, terraced £${r.rent_terraced}.`,
    p.rentTrend.length ? `Average rent every 6 months: ${yearly(p.rentTrend, 'all', 6)}` : '',
    s ? `House prices ${s.month} (Land Registry, by type — no bedroom split): average £${s.average} (${s.change12}% on a year, ${s.change1}% on the month), flats/maisonettes any size £${s.flat} (${s.changeFlat}%), terraced houses £${s.terraced} (${s.changeTerraced}%), semi-detached £${s.semi}, detached £${s.detached}, first-time buyers £${s.firstTime}.` : 'House prices: none published for this area.',
    p.salesTrend.length ? `Average price every 3 months: ${yearly(p.salesTrend, 'average', 3)}` : '',
    p.yieldAll ? `Gross yield (average rent × 12 ÷ average price): ${p.yieldAll}%${p.yieldFlat ? `, flats ${p.yieldFlat}%` : ''}.` : '',
    p.ours && (p.ours.rooms || p.ours.ensuites) ? `Capital Rooms' own rooms here: ${p.ours.rooms} rooms, typical £${p.ours.roomMedian}; ${p.ours.ensuites} en-suites, typical £${p.ours.ensuiteMedian}.` : '',
  ].filter(Boolean).join('\n')
}

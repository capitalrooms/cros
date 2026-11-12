// /api/admin/market — the Market page (lib/rents/market). Office staff.
//   GET                → { areas: [{ code, name, region, rent, change }] } for the search and the London map
//   GET ?area=<code>   → { area, rents, sales, ours, london } — rents (ONS), sales (Land Registry), our rooms, and London to compare
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { salesFor, salesHistory, ourRooms, HPI_SOURCE } from '@/lib/rents/market'
import { rentHistory } from '@/lib/rents/ons'
import { ONS_SOURCE } from '@/lib/rents/ons'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const code = req.nextUrl.searchParams.get('area')
  if (!code) {
    const { data, error } = await s.from('ons_rents').select('area_code, area_name, region, rent_all, change_all, period').order('area_name')
    if (error) return NextResponse.json({ areas: [], setupNeeded: true })
    // change over 1, 3, 6 and 12 months for every area, from the month-by-month figures (migration 281)
    const from = new Date(); from.setUTCMonth(from.getUTCMonth() - 16)
    const hist = new Map<string, { period: string; rent: number }[]>()
    for (let i = 0; ; i += 1000) {
      const { data: h, error: he } = await s.from('ons_rents_history').select('area_code, period, rent_all').gte('period', from.toISOString().slice(0, 10)).order('period').range(i, i + 999)
      if (he || !h?.length) break
      for (const x of h as any[]) if (x.rent_all) { const a = hist.get(x.area_code) ?? []; a.push({ period: x.period, rent: x.rent_all }); hist.set(x.area_code, a) }
      if (h.length < 1000) break
    }
    const over = (code: string, n: number) => { const a = hist.get(code); if (!a || a.length <= n) return null; const now = a[a.length - 1].rent, then = a[a.length - 1 - n].rent; return then ? Math.round((now - then) / then * 1000) / 10 : null }
    return NextResponse.json({ areas: (data ?? []).map((r: any) => ({ code: r.area_code, name: r.area_name, region: r.region, rent: r.rent_all, change: r.change_all, period: r.period,
      changes: { 1: over(r.area_code, 1), 3: over(r.area_code, 3), 6: over(r.area_code, 6), 12: over(r.area_code, 12) ?? r.change_all } })) })
  }
  const { data: rents } = await s.from('ons_rents').select('*').eq('area_code', code).maybeSingle() as { data: any }
  if (!rents) return NextResponse.json({ error: 'No figures for that area yet' }, { status: 404 })
  const regionCode = rents.region === 'London' ? 'E12000007' : null
  const [sales, ours, london, londonSales, rentTrend, saleTrend] = await Promise.all([
    salesFor(rents.area_name).catch(() => null),
    ourRooms(s as any, code).catch(() => null),
    regionCode ? s.from('ons_rents').select('rent_all, change_all').eq('area_code', regionCode).maybeSingle().then(r => r.data) : Promise.resolve(null),
    rents.region === 'London' ? salesFor('London').catch(() => null) : Promise.resolve(null),
    rentHistory(s as any, code, 13).catch(() => []), salesHistory(rents.area_name, 13).catch(() => []),
  ])
  // change over 1, 3, 6 and 12 months — rents (ONS months) and house prices (Land Registry months)
  const ch = (arr: (number | null)[], n: number) => { const a = arr.filter((x): x is number => x != null); if (a.length <= n) return null; const now = a[a.length - 1], then = a[a.length - 1 - n]; return then ? Math.round((now - then) / then * 1000) / 10 : null }
  const rentVals = rentTrend.map(t => t.all), priceVals = saleTrend.map(t => t.average)
  const changes = {
    rent: { 1: ch(rentVals, 1), 3: ch(rentVals, 3), 6: ch(rentVals, 6), 12: ch(rentVals, 12) ?? rents.change_all },
    price: { 1: ch(priceVals, 1) ?? sales?.change1 ?? null, 3: ch(priceVals, 3), 6: ch(priceVals, 6), 12: ch(priceVals, 12) ?? sales?.change12 ?? null },
  }
  return NextResponse.json({ area: { code, name: rents.area_name, region: rents.region }, rents, sales, ours, changes, london: london ? { rent: (london as any).rent_all, change: (london as any).change_all, priceChange: londonSales?.change12 ?? null } : null, sources: { rents: ONS_SOURCE, sales: HPI_SOURCE } })
}

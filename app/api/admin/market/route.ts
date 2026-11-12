// /api/admin/market — the Market page (lib/rents/market). Office staff.
//   GET                → { areas: [{ code, name, region, rent, change }] } for the search and the London map
//   GET ?area=<code>   → { area, rents, sales, ours, london } — rents (ONS), sales (Land Registry), our rooms, and London to compare
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { salesFor, ourRooms, HPI_SOURCE } from '@/lib/rents/market'
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
    return NextResponse.json({ areas: (data ?? []).map((r: any) => ({ code: r.area_code, name: r.area_name, region: r.region, rent: r.rent_all, change: r.change_all, period: r.period })) })
  }
  const { data: rents } = await s.from('ons_rents').select('*').eq('area_code', code).maybeSingle() as { data: any }
  if (!rents) return NextResponse.json({ error: 'No figures for that area yet' }, { status: 404 })
  const regionCode = rents.region === 'London' ? 'E12000007' : null
  const [sales, ours, london, londonSales] = await Promise.all([
    salesFor(rents.area_name).catch(() => null),
    ourRooms(s as any, code).catch(() => null),
    regionCode ? s.from('ons_rents').select('rent_all, change_all').eq('area_code', regionCode).maybeSingle().then(r => r.data) : Promise.resolve(null),
    rents.region === 'London' ? salesFor('London').catch(() => null) : Promise.resolve(null),
  ])
  return NextResponse.json({ area: { code, name: rents.area_name, region: rents.region }, rents, sales, ours, london: london ? { rent: (london as any).rent_all, change: (london as any).change_all, priceChange: londonSales?.change12 ?? null } : null, sources: { rents: ONS_SOURCE, sales: HPI_SOURCE } })
}

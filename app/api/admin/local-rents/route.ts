// /api/admin/local-rents — official local rents (lib/rents/ons). Office staff.
//   GET ?propertyId= | ?postcode=   → { rents | null, source }
//   POST { action: 'refresh' }      → load the newest ONS release now (it also runs weekly)
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { localRents, refreshOnsRents, ONS_SOURCE } from '@/lib/rents/ons'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  let pc = req.nextUrl.searchParams.get('postcode')
  const pid = req.nextUrl.searchParams.get('propertyId')
  if (!pc && pid) { const { data } = await s.from('properties').select('postcode').eq('id', pid).maybeSingle() as { data: any }; pc = data?.postcode ?? null }
  const rents = await localRents(s as any, pc).catch(() => null)
  return NextResponse.json({ rents, source: ONS_SOURCE, postcode: pc })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'refresh') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  try { return NextResponse.json({ ok: true, result: await refreshOnsRents(createServiceClient() as any, !!b.force) }) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 }) }
}

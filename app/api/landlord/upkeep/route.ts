// GET /api/landlord/upkeep — the signed-in landlord's houses, each with what's been spent on each part of the house
// and when it was last decorated (lib/property/upkeep). The office viewing as a landlord passes ?as=<personId>.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { landlordFor } from '@/lib/landlord/documents'
import { upkeepFor } from '@/lib/property/upkeep'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const id = await landlordFor(req)
  if (!id) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const s = createServiceClient()
  const { data: props } = await s.from('properties').select('id, name, is_demo').eq('landlord_id', id).order('name')
  const houses = ((props ?? []) as any[]).filter(p => !p.is_demo)
  return NextResponse.json({ houses: await Promise.all(houses.map(async p => ({ id: p.id, name: String(p.name ?? '').split('\n')[0], ...(await upkeepFor(s as any, p.id)) }))) })
}

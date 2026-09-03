/**
 * Monthly portfolio snapshot — records total rent, management fee income,
 * and room count so the Growth trend chart has data to plot over time.
 *
 * Run on the 1st of each month via Vercel Cron:
 *   vercel.json: { "path": "/api/cron/portfolio-snapshot", "schedule": "0 6 1 * *" }
 *
 * Also callable manually from admin for backfill.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Accept the Vercel Cron auth header or the CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all properties with management_fee_pct + their rooms with current_asking_rent
  const { data: props } = await service
    .from('properties')
    .select('id, management_fee_pct')

  if (!props) return NextResponse.json({ error: 'Could not fetch properties' }, { status: 500 })

  const { data: rooms } = await service
    .from('rooms')
    .select('property_id, current_asking_rent, status')
    .not('current_asking_rent', 'is', null)

  // Only count rooms that are occupied (actively bringing in rent)
  const occupiedRooms = (rooms || []).filter(
    (r: any) => r.current_asking_rent && r.status === 'occupied'
  )

  const feePctByProperty: Record<string, number> = {}
  for (const p of props) {
    feePctByProperty[p.id] = p.management_fee_pct ?? 12
  }

  let totalRent = 0
  let totalFee = 0
  for (const r of occupiedRooms as any[]) {
    const rent = parseFloat(r.current_asking_rent) || 0
    const pct = feePctByProperty[r.property_id] ?? 12
    totalRent += rent
    totalFee += rent * (pct / 100)
  }

  const snapshotDate = new Date()
  snapshotDate.setDate(1) // always snap to first of month
  const dateStr = snapshotDate.toISOString().split('T')[0]

  const { error } = await service.from('portfolio_snapshots').upsert({
    snapshot_date: dateStr,
    total_rent: Math.round(totalRent * 100) / 100,
    total_fee: Math.round(totalFee * 100) / 100,
    room_count: occupiedRooms.length,
    property_count: new Set(occupiedRooms.map((r: any) => r.property_id)).size,
  }, { onConflict: 'snapshot_date' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    date: dateStr,
    totalRent,
    totalFee,
    roomCount: occupiedRooms.length,
  })
}

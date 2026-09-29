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
import { resolveFee, feeAmount } from '@/lib/fees/managementFee'

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
    .select('id, property_id, current_asking_rent, status')
    .not('current_asking_rent', 'is', null)

  // Only count rooms that are occupied (actively bringing in rent)
  const occupiedRooms = (rooms || []).filter(
    (r: any) => r.current_asking_rent && r.status === 'occupied'
  )

  // Fee: each current tenancy's own management fee, else its property's (never an assumed 12%)
  const today = new Date().toISOString().slice(0, 10)
  const { data: lets } = await service.from('tenancies')
    .select('room_id, rent_amount, management_fee_type, management_fee_pct, management_fee_fixed, properties(management_fee_type, management_fee_pct, management_fee_fixed)')
    .lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  const letByRoom = new Map(((lets ?? []) as any[]).map(t => [t.room_id, t]))

  let totalRent = 0
  let totalFee = 0
  for (const r of occupiedRooms as any[]) {
    const t = letByRoom.get(r.id)
    const rent = t ? Number(t.rent_amount || 0) : (parseFloat(r.current_asking_rent) || 0)
    totalRent += rent
    totalFee += (t ? feeAmount(resolveFee(t, t.properties), { received: rent, charged: rent }) : null) ?? 0
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

// Vercel Cron calls scheduled jobs with GET — without this the job was rejected (405) and never ran.
export const GET = POST

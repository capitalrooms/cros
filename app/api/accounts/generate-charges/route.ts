/**
 * POST /api/accounts/generate-charges
 * Creates rent_charge rows for all occupied rooms in a given month.
 * Idempotent — skips rooms that already have a charge for that month.
 * Body: { month?: "YYYY-MM-DD" }  defaults to first of current month.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.json().catch(() => ({}))

  // Default to first of current month
  let chargeMonth: string
  if (body.month) {
    chargeMonth = body.month
  } else {
    const d = new Date()
    d.setDate(1)
    chargeMonth = d.toISOString().split('T')[0]
  }

  // Fetch all occupied rooms with a rent amount
  const { data: rooms, error } = await service
    .from('rooms')
    .select('id, property_id, current_asking_rent, status')
    .eq('status', 'occupied')
    .not('current_asking_rent', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!rooms?.length) {
    return NextResponse.json({ created: 0, skipped: 0, month: chargeMonth })
  }

  // Build rows — upsert so duplicates are harmless
  const rows = rooms.map((r: any) => ({
    room_id: r.id,
    property_id: r.property_id,
    charge_month: chargeMonth,
    amount_due: parseFloat(r.current_asking_rent),
    amount_received: 0,
    status: 'pending',
  }))

  const { data: inserted, error: upsertErr } = await service
    .from('rent_charges')
    .upsert(rows, { onConflict: 'room_id,charge_month', ignoreDuplicates: true })
    .select('id')

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    created: inserted?.length ?? 0,
    total: rooms.length,
    month: chargeMonth,
  })
}

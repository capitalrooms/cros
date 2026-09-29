/**
 * POST /api/accounts/generate-charges
 * Creates rent_charge rows for all occupied rooms in a given month.
 * Idempotent — skips rooms that already have a charge for that month.
 * Body: { month?: "YYYY-MM-DD" }  defaults to first of current month.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { generateMonthCharges } from '@/lib/rentCharges/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  // Single-room mode: called when user marks a room paid for the first time
  if (body.room_id) {
    // Fetch room name + property code to generate the RR- reference
    const { data: roomData } = await service
      .from('rooms')
      .select('name, properties(property_code)')
      .eq('id', body.room_id)
      .maybeSingle()
    const { genRentRef } = await import('@/lib/references')
    const propCode = (roomData as any)?.properties?.property_code
    const roomName = (roomData as any)?.name
    const reference = propCode && roomName
      ? genRentRef(propCode, roomName, new Date(chargeMonth))
      : null

    const { data: inserted, error: upsertErr } = await service
      .from('rent_charges')
      .upsert({
        room_id: body.room_id,
        property_id: body.property_id,
        charge_month: chargeMonth,
        amount_due: body.amount_due ?? 0,
        amount_received: 0,
        status: 'pending',
        ...(reference ? { reference } : {}),
      }, { onConflict: 'room_id,charge_month', ignoreDuplicates: false })
      .select('id')
      .single()

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, charge_id: (inserted as any)?.id })
  }

  // Bulk mode: every tenancy running this month (part months pro-rata; demo houses excluded) — shared with the cron
  try {
    const result = await generateMonthCharges(service, chargeMonth)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not raise the charges' }, { status: 500 })
  }
}

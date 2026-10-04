// GET /api/admin/rent-roll?month=YYYY-MM — every room's rent for the month, what has arrived and what's missing,
// and per property what's ready to go on a statement (lib/finance/rentRoll).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { buildRentRoll } from '@/lib/finance/rentRoll'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const month = req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7)
  try {
    return NextResponse.json(await buildRentRoll(createServiceClient(), month, { practice: req.nextUrl.searchParams.get('practice') === '1' }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load the rent roll' }, { status: 400 })
  }
}

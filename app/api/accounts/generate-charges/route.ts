/**
 * POST /api/accounts/generate-charges
 * Creates rent_charge rows for all occupied rooms in a given month.
 * Idempotent — skips rooms that already have a charge for that month.
 * Body: { month?: "YYYY-MM-DD" }  defaults to first of current month.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { generateMonthCharges, ensureTenancyCharge } from '@/lib/rentCharges/generate'

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

  // Single-tenancy mode: called when someone marks a room paid for the first time. Charges belong to a tenancy
  // (migration 217): the given tenancy, else the one in that room that month (the newest, if two shared the month).
  if (body.tenancy_id || body.room_id) {
    let tenancyId: string | null = body.tenancy_id ?? null
    if (!tenancyId) {
      const [y, m] = chargeMonth.split('-').map(Number)
      const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
      const { data: t } = await service.from('tenancies').select('id').eq('room_id', body.room_id).is('let_cancelled_at', null)
        .lte('start_date', monthEnd).or(`end_date.is.null,end_date.gte.${chargeMonth}`).order('start_date', { ascending: false }).limit(1).maybeSingle()
      tenancyId = t?.id ?? null
    }
    if (!tenancyId) return NextResponse.json({ error: 'No tenancy in that room that month — rent is charged to a tenancy.' }, { status: 400 })
    const id = await ensureTenancyCharge(service, tenancyId, chargeMonth)
    if (!id) return NextResponse.json({ error: 'That tenancy isn’t running that month, or has no rent set.' }, { status: 400 })
    return NextResponse.json({ ok: true, charge_id: id })
  }

  // Bulk mode: every tenancy running this month (part months pro-rata; demo houses excluded) — shared with the cron
  try {
    const result = await generateMonthCharges(service, chargeMonth, { practice: body.practice === true })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not raise the charges' }, { status: 500 })
  }
}

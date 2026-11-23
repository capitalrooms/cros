// GET ?month=YYYY-MM-01 → { byProperty: { [propertyId]: { count, total } } } — expenses logged for each house this month
// (the ones that will be charged on this month's statement: deduct_month, else the expense date). Read-only. Used for the
// tick box on the rent roll: ticked = expenses added, empty = none added yet.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function GET(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'That isn’t part of your access.' }, { status: 403 })
  const month = req.nextUrl.searchParams.get('month') ?? ''
  if (!/^\d{4}-\d{2}-01$/.test(month)) return NextResponse.json({ error: 'Month must be the 1st, e.g. 2026-11-01' }, { status: 400 })
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const s = createServiceClient()
  const { data, error } = await s.from('recharge_expenses').select('property_id, amount, expense_date, deduct_month, voided_at')
    .is('deduct_month', null).gte('expense_date', `${month.slice(0, 7)}-01`).lte('expense_date', end)   // not moved to another month
  // also expenses booked to this month from an earlier date (deduct_month)
  const { data: moved } = await s.from('recharge_expenses').select('property_id, amount, expense_date, deduct_month, voided_at').eq('deduct_month', month)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const byProperty: Record<string, { count: number; total: number }> = {}
  const seen = new Set<string>()
  for (const e of [...(data ?? []), ...(moved ?? [])] as any[]) {
    if (e.voided_at) continue
    const key = `${e.property_id}:${e.expense_date}:${e.amount}:${e.deduct_month ?? ''}`
    if (seen.has(key)) continue; seen.add(key)
    const b = byProperty[e.property_id] ?? { count: 0, total: 0 }
    b.count += 1; b.total = r2(b.total + Number(e.amount || 0)); byProperty[e.property_id] = b
  }
  return NextResponse.json({ month, byProperty })
}

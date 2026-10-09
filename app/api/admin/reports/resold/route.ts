// GET /api/admin/reports/resold?from=YYYY-MM-DD&to=YYYY-MM-DD — every landlord expense in the period with what it
// cost us beside what the landlord was charged (migration 195 cost_amount; blank = charged at cost). The difference
// is profit on goods resold — e.g. a £15 light charged at £20 — so the accountant can see why money spent and money
// recharged differ. Voided expenses and practice (demo) houses are left out.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { demoPropertyIds } from '@/lib/demoProperties'

export const dynamic = 'force-dynamic'
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const from = req.nextUrl.searchParams.get('from'), to = req.nextUrl.searchParams.get('to')
  if (!isDate(from) || !isDate(to)) return NextResponse.json({ error: 'Choose the dates' }, { status: 400 })
  const s = createServiceClient()
  const { data, error } = await s.from('recharge_expenses')
    .select('id, txn_no, expense_date, description, supplier, amount, cost_amount, property_id, source, properties(name)')
    .gte('expense_date', from).lte('expense_date', to).is('voided_at', null).order('expense_date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const demo = await demoPropertyIds(s as any)
  const rows = ((data ?? []) as any[]).filter(e => !demo.has(e.property_id)).map(e => {
    const charged = r2(Number(e.amount)), cost = e.cost_amount == null ? charged : r2(Number(e.cost_amount))
    return { id: e.id, no: e.txn_no, date: e.expense_date, house: String(e.properties?.name ?? '').split('\n')[0], description: e.description, supplier: e.supplier ?? '', cost, charged, margin: r2(charged - cost) }
  })
  const sum = (k: 'cost' | 'charged' | 'margin', list = rows) => r2(list.reduce((n, r) => n + r[k], 0))
  const marked = rows.filter(r => r.margin !== 0)
  return NextResponse.json({ rows, totals: { cost: sum('cost'), charged: sum('charged'), margin: sum('margin'), count: rows.length, markedCount: marked.length, markedCost: sum('cost', marked), markedCharged: sum('charged', marked) } })
}

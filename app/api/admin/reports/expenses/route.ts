// Expenses report: everything spent on each property in a period — expenses logged in CROS and the expense lines
// on statements imported from the previous agent (so April–September 2026 show too). Voided expenses are left out.
import { dropDemo } from '@/lib/demoProperties'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const supabase = createServiceClient()

  const { searchParams } = new URL(req.url)
  const from     = searchParams.get('from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const to       = searchParams.get('to')   || new Date().toISOString().slice(0, 10)
  const search   = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''

  const propSel = `property:properties(id, name, address, landlord:people!properties_landlord_id_fkey(first_name, last_name, company))`
  const [logged, imported] = await Promise.all([
    supabase.from('recharge_expenses').select(`id, description, amount, expense_date, source, category, txn_no, voided_at, ${propSel}`)
      .gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false }),
    supabase.from('statement_line_items').select(`id, description, amount, statement_date, category, recharge_expense_id, ${propSel}`)
      .gte('statement_date', from).lte('statement_date', to).is('recharge_expense_id', null).order('statement_date', { ascending: false }),
  ])
  if (logged.error) return NextResponse.json({ error: logged.error.message }, { status: 500 })
  logged.data = await dropDemo(supabase as any, logged.data as any[], (r: any) => r.property?.id) as any
  if (!imported.error) imported.data = await dropDemo(supabase as any, imported.data as any[], (r: any) => r.property?.id) as any
  const data = [
    ...((logged.data ?? []) as any[]).filter(r => !r.voided_at).map(r => ({ ...r, reference: r.txn_no ?? null })),
    ...((imported.error ? [] : imported.data ?? []) as any[]).map(r => ({ ...r, expense_date: r.statement_date, source: 'statement' })),
  ].filter(r => !category || r.category === category)

  let rows = data as any[]
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter(r => {
      const prop = r.property
      const name = `${prop?.name || ''} ${prop?.address || ''} ${r.description || ''} ${r.category || ''}`.toLowerCase()
      return name.includes(q)
    })
  }

  // Group by property
  const byProp = new Map<string, any>()
  for (const r of rows) {
    const prop = r.property
    const key = prop?.id || 'unknown'
    if (!byProp.has(key)) {
      byProp.set(key, {
        property_id: prop?.id,
        property_name: prop?.name || prop?.address || 'Unknown',
        landlord_name: prop?.landlord ? (prop.landlord.company || `${prop.landlord.first_name || ''} ${prop.landlord.last_name || ''}`.trim()) : '—',
        total: 0,
        rows: [],
      })
    }
    const g = byProp.get(key)!
    g.total += Number(r.amount || 0)
    g.rows.push(r)
  }

  const properties = [...byProp.values()]
  const grandTotal = properties.reduce((s, p) => s + p.total, 0)

  // Category breakdown
  const byCat = new Map<string, number>()
  for (const r of rows) {
    const cat = r.category || 'Uncategorised'
    byCat.set(cat, (byCat.get(cat) || 0) + Number(r.amount || 0))
  }
  const categories = [...byCat.entries()].map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total)

  return NextResponse.json({ from, to, properties, grand_total: grandTotal, categories })
}

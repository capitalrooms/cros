import { dropDemo } from '@/lib/demoProperties'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from   = searchParams.get('from') || `${new Date().getFullYear() - 1}-04-06`
  const to     = searchParams.get('to')   || `${new Date().getFullYear()}-04-05`
  const search = searchParams.get('search') || ''

  // Find matching landlord(s)
  const { data: landlords } = await supabase
    .from('people')
    .select('id, first_name, last_name, email')
    .eq('role', 'landlord')

  let filteredLandlords = (landlords || []) as any[]
  if (search) {
    const q = search.toLowerCase()
    filteredLandlords = filteredLandlords.filter(l =>
      `${l.first_name || ''} ${l.last_name || ''} ${l.email || ''}`.toLowerCase().includes(q)
    )
  }

  if (filteredLandlords.length === 0) {
    return NextResponse.json({ from, to, landlords: [], totals: { rent: 0, management_fees: 0, letting_fees: 0, expenses: 0, net: 0 } })
  }

  const landlordIds = filteredLandlords.map(l => l.id)

  // Get all properties for these landlords
  const { data: props } = await supabase
    .from('properties')
    .select('id, name, address, landlord_id')
    .in('landlord_id', landlordIds)

  const propsByLandlord = new Map<string, any[]>()
  for (const p of (props || []) as any[]) {
    if (!propsByLandlord.has(p.landlord_id)) propsByLandlord.set(p.landlord_id, [])
    propsByLandlord.get(p.landlord_id)!.push(p)
  }

  const allPropIds = (await dropDemo(supabase as any, props as any[], (p: any) => p.id)).map((p: any) => p.id)
  if (allPropIds.length === 0) {
    return NextResponse.json({ from, to, landlords: filteredLandlords.map(l => ({ ...l, rent: 0, management_fees: 0, letting_fees: 0, expenses: 0, net: 0, properties: [] })), totals: { rent: 0, management_fees: 0, letting_fees: 0, expenses: 0, net: 0 } })
  }

  // Rent received from LSR (most accurate — from actual statements)
  // Two-step: find matching statement IDs first to avoid unreliable nested filter
  const { data: matchingStmts } = await supabase
    .from('landlord_statements')
    .select('id')
    .in('property_id', allPropIds)
    .gte('period_end', from)
    .lte('period_end', to)
  const matchingStmtIds = (matchingStmts || []).map((s: any) => s.id)

  const { data: lsrRows } = matchingStmtIds.length > 0
    ? await supabase
        .from('landlord_statement_rooms')
        .select('property_id, rent_income, management_fee, letting_fee, net_to_landlord, statement:landlord_statements(period_end)')
        .in('statement_id', matchingStmtIds)
    : { data: [] }

  // Expenses
  const { data: expenses } = await supabase
    .from('recharge_expenses')
    .select('property_id, amount')
    .in('property_id', allPropIds)
    .gte('expense_date', from)
    .lte('expense_date', to)

  // Monthly breakdown — group by property then by month
  const propMap = new Map<string, { rent: number; mgmt: number; letting: number; net: number; expenses: number; months: Map<string, any> }>()
  for (const p of (props || []) as any[]) {
    propMap.set(p.id, { rent: 0, mgmt: 0, letting: 0, net: 0, expenses: 0, months: new Map() })
  }

  for (const r of (lsrRows || []) as any[]) {
    const g = propMap.get(r.property_id)
    if (!g) continue
    g.rent    += Number(r.rent_income || 0)
    g.mgmt    += Number(r.management_fee || 0)
    g.letting += Number(r.letting_fee || 0)
    g.net     += Number(r.net_to_landlord || 0)
    const month = (r.statement?.period_end || '').slice(0, 7)
    if (month) {
      if (!g.months.has(month)) g.months.set(month, { rent: 0, mgmt: 0, letting: 0, net: 0, expenses: 0 })
      const m = g.months.get(month)!
      m.rent    += Number(r.rent_income || 0)
      m.mgmt    += Number(r.management_fee || 0)
      m.letting += Number(r.letting_fee || 0)
      m.net     += Number(r.net_to_landlord || 0)
    }
  }
  for (const e of (expenses || []) as any[]) {
    const g = propMap.get(e.property_id)
    if (g) g.expenses += Number(e.amount || 0)
  }

  const result = filteredLandlords.map(l => {
    const lProps = propsByLandlord.get(l.id) || []
    const propertyRows = lProps.map(p => {
      const g = propMap.get(p.id) || { rent: 0, mgmt: 0, letting: 0, net: 0, expenses: 0, months: new Map() }
      return {
        property_id: p.id,
        property_name: p.name || p.address,
        rent: g.rent, management_fees: g.mgmt, letting_fees: g.letting,
        expenses: g.expenses, net: g.net - g.expenses,
        months: [...g.months.entries()].map(([month, v]: [string, any]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
      }
    })
    return {
      landlord_id:   l.id,
      landlord_name: `${l.first_name || ''} ${l.last_name || ''}`.trim(),
      email:         l.email,
      rent:          propertyRows.reduce((s, p) => s + p.rent, 0),
      management_fees: propertyRows.reduce((s, p) => s + p.management_fees, 0),
      letting_fees:  propertyRows.reduce((s, p) => s + p.letting_fees, 0),
      expenses:      propertyRows.reduce((s, p) => s + p.expenses, 0),
      net:           propertyRows.reduce((s, p) => s + p.net, 0),
      properties:    propertyRows,
    }
  })

  const totals = {
    rent:            result.reduce((s, l) => s + l.rent, 0),
    management_fees: result.reduce((s, l) => s + l.management_fees, 0),
    letting_fees:    result.reduce((s, l) => s + l.letting_fees, 0),
    expenses:        result.reduce((s, l) => s + l.expenses, 0),
    net:             result.reduce((s, l) => s + l.net, 0),
  }

  return NextResponse.json({ from, to, landlords: result, totals })
}

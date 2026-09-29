import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { landlordFormalNames } from '@/lib/people'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase.from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator','admin','lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const landlordName = searchParams.get('landlord') || ''
  const taxYear      = searchParams.get('tax_year') || ''
  const customFrom   = searchParams.get('from') || ''
  const customTo     = searchParams.get('to')   || ''

  if (!landlordName) return NextResponse.json({ error: 'Landlord required' }, { status: 400 })

  // Resolve date range
  let periodFrom: string
  let periodTo:   string

  if (taxYear) {
    const startYear = parseInt(taxYear.split('-')[0])
    if (isNaN(startYear)) return NextResponse.json({ error: 'Invalid tax year' }, { status: 400 })
    periodFrom = `${startYear}-04-06`
    periodTo   = `${startYear + 1}-04-05`
  } else if (customFrom && customTo) {
    periodFrom = customFrom
    periodTo   = customTo
  } else {
    return NextResponse.json({ error: 'Provide tax_year or from+to' }, { status: 400 })
  }

  // Find the landlord
  const nameParts = landlordName.trim().split(/\s+/)
  let landlordQuery = supabase.from('people').select('*')
  if (nameParts.length >= 2) {
    landlordQuery = landlordQuery
      .ilike('first_name', `%${nameParts[0]}%`)
      .ilike('last_name',  `%${nameParts[nameParts.length - 1]}%`)
  } else {
    landlordQuery = landlordQuery.or(`first_name.ilike.%${landlordName}%,last_name.ilike.%${landlordName}%`)
  }
  const { data: landlords } = await landlordQuery.limit(5)
  if (!landlords?.length) return NextResponse.json({ error: `No landlord found matching "${landlordName}"` }, { status: 404 })

  const landlord = landlords[0]
  const landlordFullName = landlordFormalNames(landlord)

  // Find properties belonging to this landlord
  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, address')
    .eq('landlord_id', landlord.id)

  if (!properties?.length) return NextResponse.json({ error: 'No properties found for this landlord' }, { status: 404 })

  const propertyIds = properties.map((p: any) => p.id)

  // Get rooms for these properties
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, property_id')
    .in('property_id', propertyIds)

  const roomIds = (rooms || []).map((r: any) => r.id)
  const roomToProperty = new Map((rooms || []).map((r: any) => [r.id, r.property_id]))

  // Rent received in period (charge_month between periodFrom and periodTo)
  const fromMonth = periodFrom.slice(0, 7) + '-01'
  const toMonth   = periodTo.slice(0, 7)   + '-01'

  const { data: rentCharges } = await supabase
    .from('rent_charges')
    .select('room_id, amount_received, status')
    .in('room_id', roomIds.length ? roomIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('charge_month', fromMonth)
    .lte('charge_month', toMonth)
    .in('status', ['paid', 'partial'])

  // Expenses in period
  const { data: expenses } = await supabase
    .from('recharge_expenses')
    .select('property_id, amount')
    .in('property_id', propertyIds)
    .gte('expense_date', periodFrom)
    .lte('expense_date', periodTo)

  // Management fees from statement_rooms (linked via statements → properties)
  const { data: statements } = await supabase
    .from('landlord_statements')
    .select(`
      id, property_id,
      rooms:landlord_statement_rooms ( management_fee, net_to_landlord, rent_income )
    `)
    .in('property_id', propertyIds)
    .gte('period_start', periodFrom)
    .lte('period_end', periodTo)

  // Aggregate per property
  const byProperty = new Map<string, { gross_rent: number; management_fees: number; expenses: number }>()
  for (const p of properties) byProperty.set(p.id, { gross_rent: 0, management_fees: 0, expenses: 0 })

  for (const rc of (rentCharges || []) as any[]) {
    const propId = roomToProperty.get(rc.room_id)
    if (!propId) continue
    const row = byProperty.get(propId)!
    row.gross_rent += Number(rc.amount_received ?? 0)
  }

  for (const exp of (expenses || []) as any[]) {
    const row = byProperty.get(exp.property_id)
    if (!row) continue
    row.expenses += Number(exp.amount)
  }

  for (const stmt of (statements || []) as any[]) {
    const row = byProperty.get(stmt.property_id)
    if (!row) continue
    for (const sr of (stmt.rooms || []) as any[]) {
      row.management_fees += Number(sr.management_fee ?? 0)
    }
  }

  const propBreakdowns = properties.map((p: any) => {
    const agg = byProperty.get(p.id) || { gross_rent: 0, management_fees: 0, expenses: 0 }
    return {
      property_id:      p.id,
      property_name:    p.name || '',
      property_address: p.address,
      gross_rent:       agg.gross_rent,
      management_fees:  agg.management_fees,
      expenses:         agg.expenses,
      net_income:       agg.gross_rent - agg.management_fees - agg.expenses,
    }
  })

  const totals = propBreakdowns.reduce(
    (s, p) => ({ gross_rent: s.gross_rent + p.gross_rent, management_fees: s.management_fees + p.management_fees, expenses: s.expenses + p.expenses }),
    { gross_rent: 0, management_fees: 0, expenses: 0 }
  )

  return NextResponse.json({
    landlord_name: landlordFullName,
    period_from:   periodFrom,
    period_to:     periodTo,
    tax_year:      taxYear || null,
    gross_rent:    totals.gross_rent,
    management_fees: totals.management_fees,
    expenses:      totals.expenses,
    net_income:    totals.gross_rent - totals.management_fees - totals.expenses,
    properties:    propBreakdowns,
  })
}

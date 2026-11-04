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

  // the books (lib/finance/books, 4 Nov 2026): the same figures as the Books screen and the landlord's annual summary.
  // This report used to take rent from CROS's own rent collection (off while CROS mirrors the old system, so rent
  // showed as nothing), costs only from CROS-logged expenses, and fees only from room breakdowns (no letting fees).
  const { createServiceClient } = await import('@/lib/supabase')
  const { loadBooks } = await import('@/lib/finance/books')
  const books = await loadBooks(createServiceClient() as any, { from: periodFrom, to: periodTo, landlordId: landlord.id })
  const byProperty = new Map<string, { gross_rent: number; management_fees: number; expenses: number }>()
  for (const p of properties) byProperty.set(p.id, { gross_rent: 0, management_fees: 0, expenses: 0 })
  for (const r of books.rows) {
    const row = byProperty.get(r.propertyId ?? '')
    if (!row) continue
    if (r.kind === 'rent') row.gross_rent += r.amount
    else if (r.kind === 'fee') row.management_fees += r.amount       // management and letting fees
    else if (r.kind === 'expense') row.expenses += r.amount
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

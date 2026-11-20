import { NextRequest, NextResponse } from 'next/server'
import { requireAnnual } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { landlordFormalNames } from '@/lib/people'
import { recordsStart } from '@/lib/finance/dates'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Directors only (Harry, 18 Nov 2026): the tax-year summary is annual company-level figures, not the monthly accounts
  if (!(await requireAnnual(req))) return NextResponse.json({ error: 'Annual financial reports are not permitted for this account' }, { status: 403 })
  const supabase = createServiceClient()

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
  const { loadBooks } = await import('@/lib/finance/books')
  const books = await loadBooks(createServiceClient() as any, { from: periodFrom, to: periodTo, landlordId: landlord.id })
  // Each landlord statement counts in the tax year it is DATED in (statement date, 6 Apr – 5 Apr). Book entries are grouped
  // by their statement reference; a statement dated outside the year is listed separately, never silently dropped.
  const refs = [...new Set(books.rows.map(r => r.reference).filter(Boolean))] as string[]
  const { data: stmtRows } = refs.length
    ? await supabase.from('landlord_statements').select('statement_reference, statement_date, period_start, period_end').in('statement_reference', refs)
    : { data: [] as any[] }
  const stmtInfo = new Map<string, any>((stmtRows ?? []).map((x: any) => [x.statement_reference, x]))
  const cents = (n: number) => Math.round(n * 100) / 100
  const inYear = (d: string | null | undefined) => !!d && d >= periodFrom && d <= periodTo

  const propBreakdowns = properties.map((p: any) => {
    const groups = new Map<string, { date: string | null; rent: number; fees: number; expenses: number; entries: number; period_start: string | null; period_end: string | null; reference: string | null }>()
    for (const r of books.rows) {
      if (r.propertyId !== p.id || !['rent', 'fee', 'expense'].includes(r.kind)) continue
      // expenses logged in CROS have no statement: they are grouped by their own date
      const info = r.reference ? stmtInfo.get(r.reference) : null
      const key = r.reference ?? `entry:${r.date}:${r.description}`
      const g = groups.get(key) ?? { date: info?.statement_date ?? (r.date ? String(r.date).slice(0, 10) : null), rent: 0, fees: 0, expenses: 0, entries: 0, period_start: info?.period_start ?? null, period_end: info?.period_end ?? null, reference: r.reference ?? null }
      if (r.kind === 'rent') g.rent += r.amount
      else if (r.kind === 'fee') g.fees += r.amount
      else g.expenses += r.amount
      g.entries += 1
      groups.set(key, g)
    }
    const statements = [...groups.values()].map(g => ({
      reference: g.reference, statement_date: g.date, period_start: g.period_start, period_end: g.period_end,
      rent: cents(g.rent), agency_fees: cents(g.fees), expenses: cents(g.expenses), net: cents(g.rent - g.fees - g.expenses),
      entries: g.entries, in_tax_year: inYear(g.date),
      date_basis: g.reference ? 'statement issue date' : 'expense date',
    })).sort((a, b) => String(a.statement_date).localeCompare(String(b.statement_date)))
    const included = statements.filter(x => x.in_tax_year)
    const sum = (k: 'rent' | 'agency_fees' | 'expenses') => cents(included.reduce((t, x) => t + x[k], 0))
    const gross = sum('rent'), fees = sum('agency_fees'), exp = sum('expenses')
    const entries = books.rows.filter(r => r.propertyId === p.id && ['rent', 'fee', 'expense'].includes(r.kind)).length
    return {
      property_id:      p.id,
      property_name:    p.name || '',
      property_address: p.address,
      gross_rent:       gross,
      management_fees:  fees,
      expenses:         exp,
      net_income:       cents(gross - fees - exp),
      statements:       included,
      outside_year:     statements.filter(x => !x.in_tax_year),
      // reconciliation: every book entry for the property is in exactly one statement group (included or outside the year)
      entries,
      entries_grouped:  statements.reduce((t, x) => t + x.entries, 0),
    }
  })

  const totals = propBreakdowns.reduce(
    (s, p) => ({ gross_rent: s.gross_rent + p.gross_rent, management_fees: s.management_fees + p.management_fees, expenses: s.expenses + p.expenses }),
    { gross_rent: 0, management_fees: 0, expenses: 0 }
  )
  const reconciles = propBreakdowns.every(p => p.entries === p.entries_grouped)

  // Coverage (19 Nov 2026): CROS keeps reliable financial records from records_start only. A period that isn't wholly
  // covered gets NO totals — the records held are listed so they can be opened, but they are not a tax-year figure.
  const reliableFrom = await recordsStart(supabase as any)
  const coverage: 'full' | 'partial' | 'none' = periodTo < reliableFrom ? 'none' : periodFrom >= reliableFrom ? 'full' : 'partial'
  const covered = coverage === 'full'
  const coverageMessage = coverage === 'full'
    ? null
    : coverage === 'none'
      ? `CROS holds no financial records for ${periodFrom} to ${periodTo}. Its reliable records start on ${reliableFrom}. No figures are shown for this period.`
      : `CROS can’t produce a reliable, complete figure for ${periodFrom} to ${periodTo}. Its records start on ${reliableFrom}, so only the part of the period from that date is held. No totals are shown.`

  return NextResponse.json({
    reconciles,
    coverage,
    reliable_from: reliableFrom,
    coverage_message: coverageMessage,
    basis: 'Dated by statement issue date and expense date. Statement issue dates are not receipt dates, so this is not a cash-basis tax figure.',
    landlord_name: landlordFullName,
    period_from:   periodFrom,
    period_to:     periodTo,
    tax_year:      taxYear || null,
    gross_rent:    covered ? totals.gross_rent : null,
    management_fees: covered ? totals.management_fees : null,
    expenses:      covered ? totals.expenses : null,
    net_income:    covered ? totals.gross_rent - totals.management_fees - totals.expenses : null,
    properties:    propBreakdowns.map(p => covered ? p : { ...p, gross_rent: null, management_fees: null, expenses: null, net_income: null }),
  })
}

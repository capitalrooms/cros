/**
 * GET /api/admin/agency-income — the figures behind Finance › Agency income (the agency's own annual fee income and
 * year-on-year comparison). Directors only (18 Nov 2026): accounts staff keep the monthly statements, fees and VAT,
 * but not the company's annual turnover. Returns the imported statements, occupied room rents and properties.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAnnual } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAnnual(req))) return NextResponse.json({ error: 'Annual financial reports are not permitted for this account' }, { status: 403 })
  const s = createServiceClient()
  const [{ data: statements, error: e1 }, { data: rooms, error: e2 }, { data: properties, error: e3 }] = await Promise.all([
    s.from('landlord_statements').select(`
      id, statement_date, management_fees, gross_rent,
      property_charges, net_to_landlord, property_id,
      properties(name)
    `).order('statement_date', { ascending: true }),
    s.from('rooms').select('property_id, current_asking_rent, status').eq('status', 'occupied').not('current_asking_rent', 'is', null),
    s.from('properties').select('id, name, management_fee_pct').order('name'),
  ])
  const error = e1 || e2 || e3
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ statements: statements ?? [], rooms: rooms ?? [], properties: properties ?? [] })
}

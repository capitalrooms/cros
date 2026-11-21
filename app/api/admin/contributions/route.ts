// GET /api/admin/contributions?propertyId= — the log of what tenants have done for the house (21 Nov 2026).
// Read-only. Office only.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const propertyId = req.nextUrl.searchParams.get('propertyId')
  const s = createServiceClient() as any
  let q = s.from('house_contributions')
    .select('id, description, amount_gbp, category, created_at, property_id, person_id, properties(name), people(full_name, first_name, last_name)')
    .order('created_at', { ascending: false }).limit(500)
  if (propertyId && UUID.test(propertyId)) q = q.eq('property_id', propertyId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = ((data ?? []) as any[]).map(r => ({
    id: r.id,
    when: r.created_at,
    who: r.people?.full_name || [r.people?.first_name, r.people?.last_name].filter(Boolean).join(' ') || 'Someone',
    house: r.properties?.name ?? '',
    what: r.description,
    amount: r.amount_gbp == null ? null : Number(r.amount_gbp),
    category: r.category,
  }))
  return NextResponse.json({ rows })
}

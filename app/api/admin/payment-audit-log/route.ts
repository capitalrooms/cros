import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { rentChargesForTenancyId } from '@/lib/rentCharges'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await supabase
    .from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const rentChargeId = searchParams.get('rent_charge_id')
  const tenancyId    = searchParams.get('tenancy_id')

  let query = supabase
    .from('payment_audit_log')
    .select('*, performed_by_person:people!payment_audit_log_performed_by_fkey(first_name, last_name)')
    .order('performed_at', { ascending: false })
    .limit(100)

  if (rentChargeId) query = query.eq('rent_charge_id', rentChargeId)
  else if (tenancyId) {
    // Get all rent_charge ids for this tenancy first
    const charges = await rentChargesForTenancyId(supabase as any, tenancyId, 'id, room_id, charge_month').catch(() => [])
    const ids = charges.map((c: any) => c.id)
    if (ids.length === 0) return NextResponse.json({ entries: [] })
    query = query.in('rent_charge_id', ids)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: data || [] })
}

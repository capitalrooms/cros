import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { attachTenancies } from '@/lib/rentCharges'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase.from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator','admin','lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from        = searchParams.get('from') || new Date().toISOString().slice(0, 8) + '01'
  const to          = searchParams.get('to')   || new Date().toISOString().slice(0, 10)
  const outstanding = searchParams.get('outstanding') === '1'
  const property    = searchParams.get('property') || ''
  const tenant      = searchParams.get('tenant')   || ''
  const landlord    = searchParams.get('landlord') || ''

  // charge_month is stored as YYYY-MM-DD (first of month); filter by month overlap with from/to
  const fromMonth = from.slice(0, 7) + '-01'
  const toMonth   = to.slice(0, 7)   + '-01'

  let query = supabase
    .from('rent_charges')
    .select(`
      id, room_id, charge_month, amount_due, amount_received, status, reference,
      room:rooms (
        name,
        properties ( id, name, address, people!properties_landlord_id_fkey ( first_name, last_name ) )
      )
    `)
    .gte('charge_month', fromMonth)
    .lte('charge_month', toMonth)
    .order('charge_month', { ascending: false })

  if (outstanding) query = query.in('status', ['pending', 'partial', 'overdue'])

  const { data: rawCharges, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // rent_charges has no tenancy link — find the tenant occupying each room in that month
  const charges = await attachTenancies(supabase as any, (rawCharges || []) as any[], 'person_id, people!person_id ( first_name, last_name )')

  const rows = (charges || [])
    .map((c: any) => {
      const prop = c.room?.properties
      const landlordPerson = prop?.people
      const tenantPerson   = c.tenancy?.people
      return {
        id:            c.id,
        charge_month:  c.charge_month,
        amount_due:    Number(c.amount_due),
        amount_received: c.amount_received != null ? Number(c.amount_received) : 0,
        status:        c.status,
        reference:     c.reference,
        tenant_name:   tenantPerson ? [tenantPerson.first_name, tenantPerson.last_name].filter(Boolean).join(' ') : 'Unknown',
        room_name:     c.room?.name || '—',
        property_name: prop?.name || prop?.address || '—',
        landlord_name: landlordPerson ? [landlordPerson.first_name, landlordPerson.last_name].filter(Boolean).join(' ') : null,
      }
    })
    .filter((r: any) => {
      if (property && !r.property_name.toLowerCase().includes(property.toLowerCase())) return false
      if (tenant   && !r.tenant_name.toLowerCase().includes(tenant.toLowerCase())) return false
      if (landlord && !(r.landlord_name || '').toLowerCase().includes(landlord.toLowerCase())) return false
      return true
    })

  return NextResponse.json({ rows })
}

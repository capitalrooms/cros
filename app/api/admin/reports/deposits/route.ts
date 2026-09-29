import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') || 'all'  // all | active | ended
  const search = searchParams.get('search') || ''

  let query = supabase
    .from('tenancies')
    .select(`
      id, start_date, end_date, deposit_amount, deposit_scheme_ref, rent_amount,
      tenant:people!person_id(first_name, last_name),
      room:rooms(name,
        property:properties(id, name, address,
          landlord:people!properties_landlord_id_fkey(first_name, last_name)
        )
      )
    `)
    .not('deposit_amount', 'is', null)
    .gt('deposit_amount', 0)
    .order('start_date', { ascending: false })

  if (filter === 'active')  query = query.is('end_date', null)
  if (filter === 'ended')   query = query.not('end_date', 'is', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (data || []) as any[]
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter(r => {
      const tenant  = r.tenant ? `${r.tenant.first_name || ''} ${r.tenant.last_name || ''}` : ''
      const prop    = r.room?.property
      const name    = `${tenant} ${prop?.name || ''} ${prop?.address || ''}`.toLowerCase()
      return name.includes(q)
    })
  }

  const formatted = rows.map(r => ({
    tenancy_id:        r.id,
    start_date:        r.start_date,
    end_date:          r.end_date,
    is_active:         !r.end_date,
    tenant_name:       r.tenant ? `${r.tenant.first_name || ''} ${r.tenant.last_name || ''}`.trim() : '—',
    room_name:         r.room?.name || '—',
    property_name:     r.room?.property?.name || r.room?.property?.address || '—',
    landlord_name:     r.room?.property?.landlord ? `${r.room.property.landlord.first_name || ''} ${r.room.property.landlord.last_name || ''}`.trim() : '—',
    deposit_amount:    Number(r.deposit_amount || 0),
    deposit_scheme_ref: r.deposit_scheme_ref || null,
    protected:         !!r.deposit_scheme_ref,
  }))

  const totals = {
    count:            formatted.length,
    total_held:       formatted.filter(r => r.is_active).reduce((s, r) => s + r.deposit_amount, 0),
    unprotected:      formatted.filter(r => !r.protected && r.is_active).length,
  }

  return NextResponse.json({ rows: formatted, totals, filter })
}

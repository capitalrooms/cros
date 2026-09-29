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
  const filter = searchParams.get('filter') || 'active'  // all | active | ended
  const search = searchParams.get('search') || ''

  let query = supabase
    .from('tenancies')
    .select(`
      id, start_date, end_date, rent_amount, deposit_amount, notice_received_date,
      deposit_scheme_ref, created_at,
      tenant:people!person_id(first_name, last_name, email),
      room:rooms(id, name, current_asking_rent,
        property:properties(id, name, address,
          landlord:people!properties_landlord_id_fkey(first_name, last_name)
        )
      )
    `)
    .order('start_date', { ascending: false })

  const today = new Date().toISOString().slice(0, 10)
  if (filter === 'active') query = query.or(`end_date.is.null,end_date.gt.${today}`)
  if (filter === 'ended')  query = query.lte('end_date', today)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (data || []) as any[]
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter(r => {
      const tenant = r.tenant ? `${r.tenant.first_name || ''} ${r.tenant.last_name || ''}` : ''
      const prop   = r.room?.property
      return `${tenant} ${prop?.name || ''} ${prop?.address || ''} ${r.room?.name || ''}`.toLowerCase().includes(q)
    })
  }

  const formatted = rows.map(r => {
    const prop = r.room?.property
    const isActive = !r.end_date || r.end_date > today
    const daysRemaining = r.end_date
      ? Math.floor((new Date(r.end_date).getTime() - new Date().getTime()) / 86400000)
      : null
    return {
      tenancy_id:        r.id,
      tenant_name:       r.tenant ? `${r.tenant.first_name || ''} ${r.tenant.last_name || ''}`.trim() : '—',
      tenant_email:      r.tenant?.email || null,
      room:              r.room?.name || '—',
      property:          prop?.name || prop?.address || '—',
      landlord:          prop?.landlord ? `${prop.landlord.first_name || ''} ${prop.landlord.last_name || ''}`.trim() : '—',
      start_date:        r.start_date,
      end_date:          r.end_date,
      is_active:         isActive,
      on_notice:         !!r.notice_received_date,
      days_remaining:    daysRemaining,
      rent_amount:       Number(r.rent_amount || r.room?.current_asking_rent || 0),
      deposit_amount:    Number(r.deposit_amount || 0),
      deposit_protected: !!r.deposit_scheme_ref,
    }
  })

  const totals = {
    count:        formatted.length,
    active:       formatted.filter(r => r.is_active).length,
    on_notice:    formatted.filter(r => r.on_notice).length,
    total_rent:   formatted.filter(r => r.is_active).reduce((s, r) => s + r.rent_amount, 0),
  }

  return NextResponse.json({ rows: formatted, totals, filter })
}

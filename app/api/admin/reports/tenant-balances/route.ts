import { dropDemo } from '@/lib/demoProperties'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase.from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator','admin','lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Active tenancies
  const { data: tenAll } = await supabase
    .from('tenancies')
    .select(`
      id, room_id, property_id,
      room:rooms ( name, properties ( name, address ) ),
      person:people!person_id ( first_name, last_name )
    `)
    .is('end_date', null)

  const tenancies = await dropDemo(supabase as any, tenAll as any[], (t: any) => t.property_id)   // practice houses out
  if (!tenancies?.length) return NextResponse.json({ rows: [] })

  const roomIds = tenancies.map((t: any) => t.room_id)

  // All rent charges for active tenancy rooms
  const { data: charges } = await supabase
    .from('rent_charges')
    .select('room_id, amount_due, amount_received, status')
    .in('room_id', roomIds)

  // Group by room_id
  const chargesByRoom = new Map<string, { due: number; received: number; overdue: number }>()
  for (const c of (charges || []) as any[]) {
    if (!chargesByRoom.has(c.room_id)) chargesByRoom.set(c.room_id, { due: 0, received: 0, overdue: 0 })
    const r = chargesByRoom.get(c.room_id)!
    r.due      += Number(c.amount_due)
    r.received += Number(c.amount_received ?? 0)
    if (c.status === 'overdue') r.overdue++
  }

  const rows = (tenancies as any[]).map(t => {
    const agg = chargesByRoom.get(t.room_id) || { due: 0, received: 0, overdue: 0 }
    const balance = agg.received - agg.due
    return {
      tenancy_id:    t.id,
      tenant_name:   t.person ? [t.person.first_name, t.person.last_name].filter(Boolean).join(' ') : 'Unknown',
      room_name:     t.room?.name || '—',
      property_name: t.room?.properties?.name || t.room?.properties?.address || '—',
      total_due:     agg.due,
      total_received: agg.received,
      balance,
      overdue_months: agg.overdue,
    }
  })

  return NextResponse.json({ rows })
}

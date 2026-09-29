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

  const today = new Date().toISOString().slice(0, 10)

  // All rooms
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, current_asking_rent, property_id, properties ( id, name, address )')

  if (!rooms?.length) return NextResponse.json({ rooms: [] })

  // All active tenancies (no end date, or end date in future)
  const { data: activeTenancies } = await supabase
    .from('tenancies')
    .select('room_id')
    .or(`end_date.is.null,end_date.gt.${today}`)

  const occupiedRoomIds = new Set((activeTenancies || []).map((t: any) => t.room_id))

  // Void rooms only
  const voidRooms = (rooms as any[]).filter(r => !occupiedRoomIds.has(r.id))
  if (!voidRooms.length) return NextResponse.json({ rooms: [] })

  const voidRoomIds = voidRooms.map(r => r.id)

  // Most recent ended tenancy per room
  const { data: recentTenancies } = await supabase
    .from('tenancies')
    .select('room_id, end_date, people!person_id ( first_name, last_name )')
    .in('room_id', voidRoomIds)
    .not('end_date', 'is', null)
    .order('end_date', { ascending: false })

  const lastTenancyByRoom = new Map<string, { end_date: string; tenant_name: string }>()
  for (const t of (recentTenancies || []) as any[]) {
    if (!lastTenancyByRoom.has(t.room_id)) {
      lastTenancyByRoom.set(t.room_id, {
        end_date: t.end_date,
        tenant_name: t.people ? [t.people.first_name, t.people.last_name].filter(Boolean).join(' ') : 'Unknown',
      })
    }
  }

  const todayMs = new Date(today).getTime()

  const result = voidRooms.map(r => {
    const last = lastTenancyByRoom.get(r.id)
    const daysVoid = last
      ? Math.floor((todayMs - new Date(last.end_date).getTime()) / 86400000)
      : 9999
    return {
      room_id:          r.id,
      room_name:        r.name,
      property_id:      r.properties?.id || r.property_id,
      property_name:    r.properties?.name || '',
      property_address: r.properties?.address || '',
      monthly_rent:     r.current_asking_rent != null ? Number(r.current_asking_rent) : null,
      last_tenant:      last?.tenant_name || null,
      last_end_date:    last?.end_date || null,
      days_void:        daysVoid === 9999 ? 999 : daysVoid,
    }
  })

  return NextResponse.json({ rooms: result })
}

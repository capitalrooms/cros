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

  const today = new Date().toISOString().slice(0, 10)

  const [tenanciRes, roomsRes] = await Promise.all([
    supabase
      .from('tenancies')
      .select(`
        id, start_date, end_date, notice_received_date, rent_amount, deposit_amount,
        room:rooms(id, name, current_asking_rent,
          property:properties(id, name, address)
        ),
        tenant:people!person_id(first_name, last_name)
      `)
      .order('start_date', { ascending: false }),

    supabase
      .from('rooms')
      .select('id, name, current_asking_rent, property_id, properties(name, address)')
  ])

  const tenancies = (tenanciRes.data || []) as any[]
  const rooms     = (roomsRes.data || []) as any[]

  // Categorise tenancies
  const active     = tenancies.filter(t => !t.end_date || t.end_date > today)
  const onNotice   = active.filter(t => t.notice_received_date)
  const ended      = tenancies.filter(t => t.end_date && t.end_date <= today)

  // Void rooms: rooms with no active tenancy
  const activeRoomIds = new Set(active.map(t => t.room?.id).filter(Boolean))
  const voidRooms     = rooms.filter(r => !activeRoomIds.has(r.id))

  // Upcoming renewals — active tenancies ending in next 90 days
  const in90 = new Date(); in90.setDate(in90.getDate() + 90)
  const upcomingRenewals = active.filter(t => t.end_date && new Date(t.end_date) <= in90 && !t.notice_received_date)

  // Average tenancy length (ended ones)
  const avgLength = ended.length > 0
    ? Math.round(ended.reduce((s, t) => {
        const days = (new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86400000
        return s + days
      }, 0) / ended.length)
    : null

  // Monthly starts/ends over last 12 months
  const months: Record<string, { starts: number; ends: number }> = {}
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i, 1)
    months[d.toISOString().slice(0, 7)] = { starts: 0, ends: 0 }
  }
  for (const t of tenancies) {
    const sm = t.start_date?.slice(0, 7)
    if (sm && months[sm]) months[sm].starts++
    const em = t.end_date?.slice(0, 7)
    if (em && months[em]) months[em].ends++
  }

  return NextResponse.json({
    counts: {
      active:           active.length,
      on_notice:        onNotice.length,
      ended:            ended.length,
      void_rooms:       voidRooms.length,
      total_rooms:      rooms.length,
      upcoming_renewals: upcomingRenewals.length,
    },
    avg_tenancy_days:     avgLength,
    monthly_moves:        Object.entries(months).map(([month, v]) => ({ month, ...v })),
    upcoming_renewals:    upcomingRenewals.map(t => ({
      tenancy_id:   t.id,
      tenant_name:  t.tenant ? `${t.tenant.first_name || ''} ${t.tenant.last_name || ''}`.trim() : '—',
      room:         t.room?.name,
      property:     t.room?.property?.name || t.room?.property?.address,
      end_date:     t.end_date,
    })),
    void_rooms:           voidRooms.map(r => ({
      room_id:      r.id,
      room_name:    r.name,
      property:     (r.properties as any)?.name || (r.properties as any)?.address,
      asking_rent:  r.current_asking_rent,
    })),
  })
}

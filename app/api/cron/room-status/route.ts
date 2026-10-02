// Daily: bring room statuses in line with tenancies (a tenant who has left → available, a new tenancy → occupied).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncRoomStatuses } from '@/lib/rooms/syncStatus'
import { alertLettingsRoomUp } from '@/lib/lettings/roomAlert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  try {
    const changes = await syncRoomStatuses(s, { apply: true })
    // a tenant has moved out and the room is free: tell the lettings team
    for (const c of changes.filter(c => c.to === 'available')) await alertLettingsRoomUp(s, c.roomId, { why: 'The tenant has moved out.' })
    return NextResponse.json({ ok: true, changed: changes.length, changes })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

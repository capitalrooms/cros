/**
 * The signed-in staff member's own notifications — new offers, reservations, deposits recorded — for the
 * notification bell in the admin top bar and the lettings home (app/components/StaffNotificationBell.tsx).
 *
 * GET               → { notifications: [...latest 25], unread }
 * POST { ids }      → marks those read;  POST { all: true } → marks all read
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/portalAuth'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const [{ data }, { count }] = await Promise.all([
    s.from('notifications').select('id, title, body, link, read, created_at')
      .eq('user_id', caller.personId).order('created_at', { ascending: false }).limit(25),
    s.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', caller.personId).eq('read', false),
  ])
  return NextResponse.json({ notifications: data ?? [], unread: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  let q = svc().from('notifications').update({ read: true }).eq('user_id', caller.personId).eq('read', false)
  if (!b.all) {
    const ids = Array.isArray(b.ids) ? b.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : []
    if (!ids.length) return NextResponse.json({ ok: true })
    q = q.in('id', ids)
  }
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

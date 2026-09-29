import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/serverAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/rooms/bulk-update
 * Bulk-update room occupant info and move-out dates from a spreadsheet import.
 * Body: { updates: Array<{ room_id: string, move_out_date?, current_asking_rent?, occupant_name?, occupant_phone?, status? }> }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['lettings', 'administrator', 'admin'].includes(user.assignment?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = serviceClient()
  const { updates } = await req.json()
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  const results: { id: string; ok: boolean; error?: string }[] = []

  for (const u of updates) {
    const { room_id, ...fields } = u
    if (!room_id) continue

    const patch: Record<string, any> = {}
    if (fields.move_out_date   !== undefined) patch.move_out_date        = fields.move_out_date || null
    if (fields.current_asking_rent !== undefined) patch.current_asking_rent = fields.current_asking_rent
    if (fields.occupant_name   !== undefined) patch.occupant_name        = fields.occupant_name || null
    if (fields.occupant_phone  !== undefined) patch.occupant_phone       = fields.occupant_phone || null
    if (fields.status          !== undefined) patch.status               = fields.status

    const { error } = await sb.from('rooms').update(patch).eq('id', room_id)
    results.push({ id: room_id, ok: !error, error: error?.message })
  }

  return NextResponse.json({ ok: true, results, updated: results.filter(r => r.ok).length })
}

/**
 * /api/admin/rooms/[roomId] — the room page (option D, 24 Oct 2026).
 *   GET                                                      → { room overview } (lib/rooms/roomOverview)
 *   POST { action: 'note', content }                         → an office note on the room
 * Office staff with the Properties area (proxy.ts). Messages to tenants go through Quick Notify, not here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadRoomOverview } from '@/lib/rooms/roomOverview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { roomId } = await params
  const o = await loadRoomOverview(createServiceClient(), roomId)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: 404 })
  return NextResponse.json(o)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { roomId } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: room } = await s.from('rooms').select('id, name, property_id').eq('id', roomId).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  if (b.action === 'note') {
    const content = String(b.content ?? '').trim().slice(0, 4000)
    if (!content) return NextResponse.json({ error: 'Write the note first' }, { status: 400 })
    const { error } = await s.from('room_notes').insert({ room_id: roomId, content, note_type: 'office', created_by: caller.email })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

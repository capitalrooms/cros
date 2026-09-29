import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/adminAuth'
import { validateRoomUpdate, buildRoomUpdatePayload } from '@/lib/voice/actions/roomUpdate'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { roomId, updates } = await req.json()

  if (!roomId || !updates) {
    return NextResponse.json({ error: 'Room ID and updates required' }, { status: 400 })
  }

  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Fetch the room to verify it exists
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .select('id, name, property_id')
      .eq('id', roomId)
      .single()

    if (roomErr || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    // Update the room
    const { error: updateErr } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', roomId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: `Updated ${room.name}`,
      roomId,
    })
  } catch (e) {
    console.error('Room update error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

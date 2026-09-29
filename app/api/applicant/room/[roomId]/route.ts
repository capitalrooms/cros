// GET /api/applicant/room/[roomId] — the few public facts the "reserve this room" page shows an applicant:
// room name, asking rent, the property's name, the holding deposit (one week's rent) and its payment reference.
// Served from here so the public page never reads the database directly.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { holdingDepositRef } from '@/lib/offers/holdingRef'
import { oneWeekRent } from '@/lib/tenancy/deposit'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const { data: room } = await createServiceClient().from('rooms')
    .select('id, name, current_asking_rent, properties(name, address)').eq('id', roomId).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const p: any = room.properties
  const monthly = Number(room.current_asking_rent) || null
  return NextResponse.json({
    name: room.name,
    monthly,
    weekly: monthly ? oneWeekRent(monthly) : null,
    property: String(p?.name || p?.address || '').split('\n')[0],
    reference: holdingDepositRef(p?.name, room.name),
  })
}

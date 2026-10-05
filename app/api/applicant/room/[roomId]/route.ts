// GET /api/applicant/room/[roomId] — the few public facts the "reserve this room" page shows an applicant:
// room name, rent, the property's name, the holding deposit (one week's rent) and its payment reference.
// ?a=<applicant id> (on the links in our offer emails): the rent is the one AGREED with that applicant — the lower
// offer we accepted, or the rent on the offer we sent — never the room's advertised rent; plus their first name
// for the greeting. Served from here so the public page never reads the database directly.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { holdingDepositRef } from '@/lib/offers/holdingRef'
import { oneWeekRent } from '@/lib/tenancy/deposit'
import { agreedRent } from '@/lib/lettings/holdingDeposit'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  if (!UUID.test(roomId)) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const svc = createServiceClient()
  const { data: room } = await svc.from('rooms')
    .select('id, name, current_asking_rent, properties(name, address)').eq('id', roomId).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const p: any = room.properties
  let monthly = Number(room.current_asking_rent) || null
  let firstName: string | null = null

  const a = req.nextUrl.searchParams.get('a')
  if (a && UUID.test(a)) {
    const { data: ap } = await svc.from('applicants')
      .select('id, first_name, room_id, offer_id, offered_rent, rent_offer_type, converted_person_id').eq('id', a).maybeSingle()
    if (ap && (ap as any).room_id === room.id) {
      const x = ap as any
      const { data: offer } = await svc.from('offers').select('advertised_rent')
        .or(`applicant_id.eq.${x.id}${x.offer_id ? `,id.eq.${x.offer_id}` : ''}`)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      const agreed = await agreedRent(svc as any, x, offer as any)
      if (agreed) monthly = agreed
      firstName = String(x.first_name || '').trim() || null
    }
  }

  return NextResponse.json({
    name: room.name,
    monthly,
    weekly: monthly ? oneWeekRent(monthly) : null,
    property: String(p?.name || p?.address || '').split('\n')[0],
    reference: holdingDepositRef(p?.name, room.name),
    firstName,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { postcodesIn } from '@/lib/councils/london'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const body = await req.json()
  const { property, rooms } = body

  if (!property || !rooms || !Array.isArray(rooms)) {
    return NextResponse.json({ error: 'Missing property or rooms data' }, { status: 400 })
  }
  // every property must have a postcode (council, licensing letters, maps and bin days all hang off it)
  const postcode = postcodesIn(property.postcode)[0]
  if (!postcode) return NextResponse.json({ error: 'Postcode is required — every property must have one (e.g. E15 1LU).' }, { status: 400 })
  property.postcode = postcode

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Create the property
  const { data: created, error: propErr } = await supabase
    .from('properties')
    .insert(property)
    .select()
    .single()

  if (propErr) {
    console.error('Property insert error:', propErr)
    return NextResponse.json({ error: propErr.message }, { status: 500 })
  }

  if (!created) {
    return NextResponse.json({ error: 'Property insert returned no data' }, { status: 500 })
  }

  // Check for unit_code conflicts and make codes unique if needed
  const unitCodes = rooms.map((r: any) => r.unit_code).filter(Boolean)
  let conflictingCodes: Set<string> = new Set()

  if (unitCodes.length > 0) {
    const { data: existing } = await supabase
      .from('rooms')
      .select('unit_code')
      .in('unit_code', unitCodes)

    conflictingCodes = new Set((existing || []).map((r: any) => r.unit_code))
  }

  // Build rooms with property_id and deduplicated unit codes
  const roomsWithPropertyId = (rooms as any[]).map((r: any) => {
    let unitCode = r.unit_code
    if (unitCode && conflictingCodes.has(unitCode)) {
      // Append a random suffix to make it unique
      unitCode = unitCode + Math.random().toString(36).slice(2, 5).toUpperCase()
    }
    return {
      property_id: created.id,
      name: r.name,
      room_type: r.room_type || null,
      unit_code: unitCode || null,
      status: 'available',
    }
  })

  const { error: roomsErr } = await supabase.from('rooms').insert(roomsWithPropertyId)

  if (roomsErr) {
    console.error('Rooms insert error:', roomsErr)
    // Roll back: delete the property (rooms cascade-delete automatically)
    await supabase.from('properties').delete().eq('id', created.id)
    return NextResponse.json(
      { error: `Could not create rooms: ${roomsErr.message}. Nothing was saved — please try again.` },
      { status: 500 }
    )
  }

  return NextResponse.json({ id: created.id })
}

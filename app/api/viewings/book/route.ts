import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSmsSignOff } from '@/lib/auth'
import { getCurrentUser } from '@/lib/serverAuth'
import twilio from 'twilio'
import { getCommsLive } from '@/lib/comms'
import { withOptionalColumns } from '@/lib/optionalColumns'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/viewings/book
 * Books a viewing and optionally SMS-notifies the current room occupant.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = serviceClient()
  const body = await req.json()
  const {
    room_id,
    property_id,
    visitor_name,
    visitor_phone,
    viewing_date,
    viewing_slot,   // e.g. "14:00"
    notes,
    sms_occupant,   // boolean — send SMS to current occupant
  } = body

  if (!room_id || !property_id || !visitor_name || !viewing_date) {
    return NextResponse.json({ error: 'room_id, property_id, visitor_name, viewing_date required' }, { status: 400 })
  }

  // Create viewing record
  const { data: viewing, error: viewErr } = await withOptionalColumns(withNew => sb.from('viewings').insert({
    room_id,
    property_id,
    visitor_name,
    visitor_phone: visitor_phone || null,
    viewing_date,
    viewing_slot: viewing_slot || null,
    viewing_status: 'scheduled',
    ...(withNew ? { notes: notes || null } : {}),
  }).select('id').single())

  if (viewErr || !viewing) {
    return NextResponse.json({ error: viewErr?.message || 'Failed to create viewing' }, { status: 500 })
  }

  let smsSent = false
  let smsError: string | null = null

  // SMS occupant if requested
  // Text the current occupant — only while tenant comms are live (kill-switch)
  if (sms_occupant && await getCommsLive()) {
    const { data: room } = await sb.from('rooms').select('name, properties(address)').eq('id', room_id).single()
    const { data: occ } = await sb.from('tenancies').select('people!person_id(first_name, full_name, phone)')
      .eq('room_id', room_id).is('end_date', null).limit(1).maybeSingle() as { data: any }
    const phone    = occ?.people?.phone as string | undefined
    const name     = occ?.people?.first_name || occ?.people?.full_name?.split(' ')[0] || 'Resident'
    const address  = (room?.properties as any)?.address || ''
    const dateStr  = new Date(viewing_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    const timeStr  = viewing_slot || ''
    const signOff  = await getSmsSignOff(user.user?.email || '')

    if (phone) {
      const sid   = process.env.TWILIO_ACCOUNT_SID
      const token = process.env.TWILIO_AUTH_TOKEN
      const from  = process.env.TWILIO_FROM_NUMBER

      if (sid && token && from) {
        try {
          const msg = `Hi ${name}, we have a viewing booked for your room at ${address} on ${dateStr}${timeStr ? ` at ${timeStr}` : ''}. Please get in touch if you have any questions. -${signOff}`
          const client = twilio(sid, token)
          await client.messages.create({ body: msg, from, to: phone })
          smsSent = true
        } catch (e: any) {
          smsError = e?.message || 'SMS failed'
        }
      } else {
        smsError = 'SMS provider not configured'
      }
    } else {
      smsError = 'No occupant phone stored for this room'
    }
  }

  return NextResponse.json({
    ok: true,
    viewingId: viewing.id,
    smsSent,
    smsError,
  })
}

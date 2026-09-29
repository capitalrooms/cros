import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { getSmsSignOff } from '@/lib/auth'
import { getCurrentUser } from '@/lib/serverAuth'
import { getCommsLive } from '@/lib/comms'
import twilio from 'twilio'

export const runtime = 'nodejs'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/sms/notify-tenant-viewing
 * Sends a heads-up SMS to the current occupant of a room when a viewing is booked.
 * Looks up the active tenancy on the room and reads people.phone.
 * Silent no-op if no active tenant or no phone stored.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await getCurrentUser(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const live = await getCommsLive()
  if (!live) return NextResponse.json({ ok: true, smsSent: false, reason: 'comms_paused' })

  const { room_id, property_address, viewing_date, viewing_slot, phone: phoneOverride, name: nameOverride } = await req.json()
  const signOff = await getSmsSignOff(user.user?.email || '')
  if (!room_id) return NextResponse.json({ error: 'room_id required' }, { status: 400 })

  const sb = serviceClient()

  // Find the active tenancy for this room and get the tenant's phone
  const { data: tenancy } = await sb
    .from('tenancies')
    .select('id, people!person_id(first_name, phone)')
    .eq('room_id', room_id)
    // current tenancy — including one on notice (it has an end date, and that's when viewings happen)
    .lte('start_date', new Date().toISOString().slice(0, 10))
    .or(`end_date.is.null,end_date.gte.${new Date().toISOString().slice(0, 10)}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const person = tenancy?.people as any
  // a let-only occupant who isn't in CROS: the admin types their mobile when booking
  const phone  = (typeof phoneOverride === 'string' && phoneOverride.trim()) || person?.phone
  const name   = (typeof nameOverride === 'string' && nameOverride.trim().split(' ')[0]) || person?.first_name || 'Resident'

  if (!phone) {
    return NextResponse.json({ ok: true, smsSent: false, reason: 'no_phone' })
  }

  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_FROM_NUMBER

  if (!sid || !token || !from) {
    return NextResponse.json({ ok: true, smsSent: false, reason: 'twilio_not_configured' })
  }

  // Format date nicely
  const dateStr = new Date(viewing_date).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const timeStr = viewing_slot && viewing_slot !== 'the arranged time'
    ? ` at ${viewing_slot}`
    : ''

  const msg = `Hi ${name}, we wanted to let you know that someone will be viewing your room at ${property_address} on ${dateStr}${timeStr}. Please contact us if you have any questions. -${signOff}`

  try {
    const client = twilio(sid, token)
    await client.messages.create({ body: msg, from, to: phone })
    return NextResponse.json({ ok: true, smsSent: true })
  } catch (e: any) {
    return NextResponse.json({ ok: true, smsSent: false, reason: e?.message || 'sms_failed' })
  }
}

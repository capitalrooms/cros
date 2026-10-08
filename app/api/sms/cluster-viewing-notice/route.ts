import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { getSmsSignOff } from '@/lib/auth'
import { getCurrentUser } from '@/lib/serverAuth'
import { getElectedCommsLive } from '@/lib/comms'
import { requireStaff } from '@/lib/portalAuth'
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
 * POST /api/sms/cluster-viewing-notice
 * Sends a bulk heads-up SMS to all current tenants in a set of rooms.
 * Used when running a viewing tour across multiple nearby rooms.
 *
 * Body:
 *   room_ids:      string[]   — managed rooms (CROS room IDs)
 *   viewing_date:  string     — ISO date e.g. "2026-09-19"
 *   time_from:     string     — e.g. "17:00"
 *   time_to:       string     — e.g. "19:00"
 *   message?:      string     — optional override message body
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const user = await getCurrentUser(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  // a tour notice is picked and sent by staff, so it goes while automatic messages are paused
  const live = await getElectedCommsLive()
  if (!live) return NextResponse.json({ error: 'Messages you send are switched off (Settings)' }, { status: 503 })

  const { room_ids, viewing_date, time_from, time_to, message: customMessage } = await req.json()

  if (!Array.isArray(room_ids) || room_ids.length === 0) {
    return NextResponse.json({ error: 'room_ids required' }, { status: 400 })
  }
  if (!viewing_date || !time_from || !time_to) {
    return NextResponse.json({ error: 'viewing_date, time_from, time_to required' }, { status: 400 })
  }

  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_FROM_NUMBER

  if (!sid || !token || !from) {
    return NextResponse.json({ error: 'SMS provider not configured' }, { status: 503 })
  }

  const sb      = serviceClient()
  const signOff = await getSmsSignOff(user.user?.email || '')

  // Look up active tenants for all selected rooms in one query
  const { data: tenancies } = await sb
    .from('tenancies')
    .select('room_id, people!person_id(first_name, phone)')
    .in('room_id', room_ids)
    .is('end_date', null)

  const dateStr = new Date(viewing_date).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const results: { phone: string; name: string; ok: boolean; error?: string }[] = []
  const seen = new Set<string>() // deduplicate by phone

  const client = twilio(sid, token)

  for (const tenancy of tenancies || []) {
    const person = tenancy.people as any
    const phone  = person?.phone
    const name   = person?.first_name || 'Resident'

    if (!phone || seen.has(phone)) continue
    seen.add(phone)

    const body = customMessage ||
      `Hi ${name}, we're holding viewings in your area on ${dateStr} and may visit your property between ${time_from} and ${time_to}. We will knock on the entry door and then on your bedroom door before entering. Please get in touch if this is inconvenient. -${signOff}`

    try {
      await client.messages.create({ body, from, to: phone })
      results.push({ phone, name, ok: true })
    } catch (e: any) {
      results.push({ phone, name, ok: false, error: e?.message })
    }
  }

  const sent  = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  return NextResponse.json({ ok: true, sent, failed, results })
}

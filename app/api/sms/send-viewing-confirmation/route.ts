import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSmsSignOff } from '@/lib/auth'
import { getCurrentUser } from '@/lib/serverAuth'
import { getNewTenantCommsLive } from '@/lib/comms'
import twilio from 'twilio'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const user = await getCurrentUser(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const live = await getNewTenantCommsLive()   // the viewer isn't a tenant yet
    if (!live) return NextResponse.json({ error: 'Tenant comms are paused' }, { status: 503 })

    const body = await req.json()
    const { phone, visitorName, roomAddress, viewingDate, viewingTime } = body

    if (!phone || !visitorName) {
      return NextResponse.json({ error: 'Phone and visitor name required' }, { status: 400 })
    }

    const sid   = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from  = process.env.TWILIO_FROM_NUMBER

    if (!sid || !token || !from) {
      console.warn('Twilio env vars not set — SMS not sent')
      return NextResponse.json({ error: 'SMS provider not configured' }, { status: 503 })
    }

    const signOff = await getSmsSignOff(user.user.email || '')

    const message = `Hi ${visitorName}, your viewing at ${roomAddress} is confirmed for ${viewingDate} at ${viewingTime}. Reply to this message or call/text us directly. -${signOff}`

    const client = twilio(sid, token)
    await client.messages.create({ body: message, from, to: phone })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('SMS send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send SMS' },
      { status: 500 },
    )
  }
}

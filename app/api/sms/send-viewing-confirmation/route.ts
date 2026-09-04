import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

export const runtime = 'nodejs'

interface SMSRequest {
  phone: string
  visitorName: string
  roomAddress: string
  viewingDate: string
  viewingTime: string
  senderName: string
}

export async function POST(req: NextRequest) {
  try {
    const body: SMSRequest = await req.json()
    const { phone, visitorName, roomAddress, viewingDate, viewingTime, senderName } = body

    if (!phone || !visitorName) {
      return NextResponse.json({ error: 'Phone and visitor name required' }, { status: 400 })
    }

    const sid   = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from  = process.env.TWILIO_FROM_NUMBER

    if (!sid || !token || !from) {
      console.warn('Twilio env vars not set — SMS not sent')
      return NextResponse.json(
        { error: 'SMS provider not configured' },
        { status: 503 },
      )
    }

    const message = `Hi ${visitorName}, your viewing at ${roomAddress} is confirmed for ${viewingDate} at ${viewingTime}. Contact ${senderName} at Capital Rooms if you have any questions. -Capital Rooms`

    const client = twilio(sid, token)
    await client.messages.create({ body: message, from, to: phone })

    return NextResponse.json({ success: true, message: 'SMS sent' })
  } catch (error) {
    console.error('SMS send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send SMS' },
      { status: 500 },
    )
  }
}

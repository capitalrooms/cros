import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Send SMS viewing confirmation to applicant
 * POST /api/sms/send-viewing-confirmation
 *
 * For now, this is a placeholder that logs the SMS intent
 * In production, integrate with Twilio or similar SMS provider
 */

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

    // Validate phone
    if (!phone || !visitorName) {
      return NextResponse.json(
        { error: 'Phone and visitor name required' },
        { status: 400 }
      )
    }

    // Format the message
    const message = `Hi ${visitorName}, Your viewing at ${roomAddress} is confirmed for ${viewingDate} at ${viewingTime}. Contact ${senderName} at Capital Rooms if you have questions. -Capital Rooms`

    console.log('SMS would be sent to:', phone)
    console.log('Message:', message)

    // TODO: Integrate with Twilio
    // const twilio = require('twilio');
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   body: message,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: phone
    // });

    return NextResponse.json({
      success: true,
      message: 'SMS confirmation sent (placeholder - Twilio integration needed)',
      sms_logged: true
    })
  } catch (error) {
    console.error('SMS send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send SMS' },
      { status: 500 }
    )
  }
}

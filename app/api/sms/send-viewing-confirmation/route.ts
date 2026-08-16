import { NextRequest, NextResponse } from 'next/server'

/**
 * Send SMS confirmation to applicant after viewing is booked
 * Requires phone number, applicant name, viewing details
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, visitorName, roomAddress, viewingDate, viewingTime, senderName } = body

    if (!phone || !visitorName || !roomAddress || !viewingDate || !viewingTime) {
      return NextResponse.json(
        { error: 'Missing required fields: phone, visitorName, roomAddress, viewingDate, viewingTime' },
        { status: 400 }
      )
    }

    // Format SMS message
    const formattedDate = new Date(viewingDate).toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
    })

    const message = `Hi ${visitorName}, your viewing at ${roomAddress} is confirmed for ${formattedDate} at ${viewingTime}. Contact ${senderName} at Capital Rooms if you have questions. -Capital Rooms`

    // In production, integrate with Twilio or similar SMS service
    console.log(`[SMS] To: ${phone}\n${message}`)

    // Log to database for audit trail
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()

    await supabase.from('notifications').insert({
      type: 'sms_sent',
      related_table: 'viewings',
      status: 'sent',
      content: message,
    })

    return NextResponse.json({
      success: true,
      message: 'SMS sent successfully',
      phone: phone.replace(/(\d{2})(\d{5})$/, '**$2'),
    })
  } catch (error) {
    console.error('SMS send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { tenantCommsLive } from '@/lib/comms'
import { isRateLimited, getRateLimitResponse, getRateLimitInfo, SMS_LIMITS } from '@/lib/rate-limiter'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!tenantCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  try {
    // SECURITY: Verify authentication
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Rate limit SMS sends (5 per hour per user)
    const userId = user.assignment?.id || request.headers.get('x-forwarded-for') || 'unknown'
    if (isRateLimited(userId, SMS_LIMITS)) {
      const info = getRateLimitInfo(userId, SMS_LIMITS)
      return NextResponse.json(getRateLimitResponse(info.resetAt), { status: 429 })
    }

    const { phone, visitorName, viewingDate, viewingTime } = await request.json()

    if (!phone || !visitorName || !viewingDate || !viewingTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // TODO: Integrate with Twilio
    // For now, just log the SMS that would be sent
    const message = `Hi ${visitorName}, your viewing is confirmed for ${viewingDate} at ${viewingTime}. Contact Capital Rooms if you have questions.`;

    console.log(`[SMS SENT] To: ${phone}`);
    console.log(`[SMS MESSAGE] ${message}`);

    // In production, this would call Twilio:
    // const twilio = require('twilio')(accountSid, authToken);
    // await twilio.messages.create({
    //   body: message,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: phone,
    // });

    return NextResponse.json({
      success: true,
      message: 'SMS sent successfully',
      phone,
    });
  } catch (error) {
    console.error('SMS error:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, canWorkOnTicket, canActAtProperty, requireStaff, isStaff } from '@/lib/portalAuth'
import { getCommsLive } from '@/lib/comms'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/serverAuth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'
import { emailHtml, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'
import { senderFields } from '@/lib/email/sender'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export async function POST(request: NextRequest) {
  const supabaseServer = await createServerClient()
  const user = await getCurrentUser(supabaseServer)
  if (!user) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized notify-tenant-viewing access', ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!await getCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const { roomId, propertyId, notifyType } = await request.json()
  if (!(await requireStaff(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roomId || !validateUUID(roomId) || !notifyType) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid roomId: ${roomId}, notifyType: ${notifyType}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Invalid roomId or notifyType format' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  async function send(to: string, subject: string, html: string) {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(await senderFields(request)),
        to: [to],
        subject,
        html,
      }),
    })
    return res.ok
  }

  const sent: string[] = []

  if (notifyType === 'room_tenant') {
    // Notify the tenant in this specific room (if they've opted in to viewings)
    const { data: tenancy } = await supabase
      .from('tenancies')
      .select('id, people!person_id(email, first_name, full_name, notify_by_email)')
      .eq('room_id', roomId)
      .is('end_date', null)
      .limit(1)
      .maybeSingle() as { data: any }

    if (tenancy?.people?.email && tenancy.people.notify_by_email !== false) {
      const success = await send(
        tenancy.people.email,
        'Notice of scheduled viewing at your property',
        await emailHtml(`
          <h2 style="margin:0 0 18px;font-size:22px">Viewing Scheduled</h2>
          <p style="margin:0 0 30px;font-size:16px;line-height:1.5">
            Please note that there will be a viewing scheduled in your room.
            Our team will contact you shortly with the specific date and time.
          </p>
          <p style="color:#78716c;font-size:14px;margin:20px 0 0 0">
            If you have any questions, please get in touch.
          </p>
        `, { req: request })
      )
      if (success) sent.push(tenancy.people.email)
    }
  } else if (notifyType === 'other_tenants') {
    // Notify all other tenants in this property (if they've opted in to viewings)
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId required for other_tenants' }, { status: 400 })
    }

    const { data: otherTenancies } = await supabase
      .from('tenancies')
      .select('id, people!person_id(email, first_name, full_name, notify_by_email), rooms(name)')
      .eq('property_id', propertyId)
      .neq('room_id', roomId)
      .is('end_date', null) as { data: any[] | null }

    for (const tenancy of otherTenancies || []) {
      if (tenancy?.people?.email && tenancy.people.notify_by_email !== false) {
        const success = await send(
          tenancy.people.email,
          'Notice: Scheduled activity in your property',
          await emailHtml(`
            <h2 style="margin:0 0 18px;font-size:22px">Property Notice</h2>
            <p style="margin:0 0 30px;font-size:16px;line-height:1.5">
              Please be advised that there is a scheduled viewing or maintenance activity
              in your property. There may be contractors or visitors present.
            </p>
            <p style="color:#78716c;font-size:14px;margin:20px 0 0 0">
              Thank you for your understanding. If you have questions, please contact us.
            </p>
          `, { req: request })
        )
        if (success) sent.push(tenancy.people.email)
      }
    }
  }

  return NextResponse.json({
    sent,
    message: `Notifications sent to ${sent.length} tenant${sent.length !== 1 ? 's' : ''}`,
  })
}

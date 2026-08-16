import { NextRequest, NextResponse } from 'next/server'
import { tenantCommsLive } from '@/lib/comms'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <onboarding@resend.dev>'
const LOGO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/maintenance-photos/brand/logo.png`
const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://192.168.1.125:3000'

export async function POST(request: NextRequest) {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!tenantCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized notify-tenant-viewing access', ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const { roomId, propertyId, notifyType } = await request.json()
  if (!roomId || !validateUUID(roomId) || !notifyType) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid roomId: ${roomId}, notifyType: ${notifyType}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Invalid roomId or notifyType format' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const shell = (inner: string) => `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c1917">
      <a href="${PORTAL_URL}">
        <img src="${LOGO_URL}" alt="Capital Rooms" style="height:64px;width:auto;margin-bottom:20px" />
      </a>
      ${inner}
      <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e7e5e4">
        <p style="margin:0;color:#a8a29e;font-size:13px">
          Capital Rooms — Property Management
        </p>
      </div>
    </div>`

  async function send(to: string, subject: string, html: string) {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
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
      .select('*, people(email, name), opt_in_viewings')
      .eq('room_id', roomId)
      .is('end_date', null)
      .single()
      .catch(() => ({ data: null }))

    if (tenancy?.people?.email && tenancy?.opt_in_viewings) {
      const success = await send(
        tenancy.people.email,
        'Notice of scheduled viewing at your property',
        shell(`
          <h2 style="margin:0 0 18px;font-size:22px">Viewing Scheduled</h2>
          <p style="margin:0 0 30px;font-size:16px;line-height:1.5">
            Please note that there will be a viewing scheduled in your room.
            Our team will contact you shortly with the specific date and time.
          </p>
          <p style="color:#78716c;font-size:14px;margin:20px 0 0 0">
            If you have any questions, please get in touch.
          </p>
        `)
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
      .select('*, people(email, name), rooms(name), opt_in_viewings')
      .eq('property_id', propertyId)
      .neq('room_id', roomId)
      .is('end_date', null)
      .catch(() => ({ data: [] }))

    for (const tenancy of otherTenancies || []) {
      if (tenancy?.people?.email && tenancy?.opt_in_viewings) {
        const success = await send(
          tenancy.people.email,
          'Notice: Scheduled activity in your property',
          shell(`
            <h2 style="margin:0 0 18px;font-size:22px">Property Notice</h2>
            <p style="margin:0 0 30px;font-size:16px;line-height:1.5">
              Please be advised that there is a scheduled viewing or maintenance activity
              in your property. There may be contractors or visitors present.
            </p>
            <p style="color:#78716c;font-size:14px;margin:20px 0 0 0">
              Thank you for your understanding. If you have questions, please contact us.
            </p>
          `)
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

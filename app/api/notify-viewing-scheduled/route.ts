import { NextRequest, NextResponse } from 'next/server'
import { getCommsLive } from '@/lib/comms'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'
import { emailHtml, FROM, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'
import twilio from 'twilio'
import { getTemplate, render } from '@/lib/messageTemplate'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

async function sendConfirmationSms(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  phone: string,
  viewingId: string,
  contextText: string,
  smsBody: string
) {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from) return
  try {
    const client = twilio(sid, token)
    await client.messages.create({ to: phone, from, body: smsBody })
    // Log so the inbound webhook can match the reply
    await supabase.from('sms_confirmations').insert({
      phone,
      type: 'viewing',
      related_id: viewingId,
      context_text: contextText,
    })
  } catch (e) {
    console.warn('Viewing confirmation SMS failed:', e)
  }
}

export async function POST(request: NextRequest) {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!await getCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  // Step 1: Verify authentication
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({
      userId: 'unknown',
      action: 'security_unauthorized_access',
      details: 'Unauthorized attempt to access notify-viewing-scheduled endpoint',
      ipAddress: getClientIp(request.headers),
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Step 2: Verify authorization (lettings/admin only)
  if (!['lettings', 'administrator'].includes(user.assignment?.role)) {
    await logAudit({
      userId: user.id,
      action: 'security_forbidden_access',
      details: `Role '${user.assignment?.role}' attempted to trigger viewing notifications`,
      ipAddress: getClientIp(request.headers),
    })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const { viewingId } = await request.json()

  // Step 3: Validate input
  if (!viewingId || !validateUUID(viewingId)) {
    await logAudit({
      userId: user.id,
      action: 'security_invalid_input',
      details: `Invalid viewingId provided: ${viewingId}`,
      ipAddress: getClientIp(request.headers),
    })
    return NextResponse.json({ error: 'Invalid viewingId format' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch viewing with room and property info
  const { data: viewing, error } = await supabase
    .from('viewings')
    .select('*, rooms(name, property_id, properties(id, name, address))')
    .eq('id', viewingId)
    .single()

  if (error || !viewing) {
    return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })
  }

  const roomName = viewing.rooms?.name || 'A property'
  const propertyName = (viewing.rooms as any)?.properties?.name || 'Capital Rooms'
  const propertyAddress = (viewing.rooms as any)?.properties?.address || ''
  const propertyId = (viewing.rooms as any)?.properties?.id
  const roomId = viewing.rooms?.id

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
  const when = `${new Date(viewing.viewing_date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })} at ${viewing.viewing_slot}`

  const visitorFirstName = viewing.visitor_name?.split(' ')[0] || 'there'
  const propertyNameAddress = `${propertyName}${propertyAddress ? `, ${propertyAddress}` : ''}`
  const visitorEmailSuffix = viewing.visitor_email ? ` (${viewing.visitor_email})` : ''

  const [tplViewing] = await Promise.all([getTemplate('viewing-all-recipients')])

  const viewingVars = {
    room_name: roomName,
    property_name: propertyName,
    property_name_address: propertyNameAddress,
    when,
    visitor_name: viewing.visitor_name ?? '',
    visitor_first_name: visitorFirstName,
    visitor_email_suffix: visitorEmailSuffix,
    address: propertyAddress || propertyName,
  }

  // Send to admin
  const admin = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (admin) {
    const adminSubject = tplViewing
      ? render(tplViewing.subject_line, viewingVars)
      : `Viewing scheduled — ${roomName} at ${propertyName}`
    const adminBody = tplViewing
      ? render(tplViewing.template_text, viewingVars)
      : `
        <h2 style="margin:0 0 18px;font-size:22px">Viewing scheduled</h2>
        <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${roomName}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">When</td>
              <td style="padding:6px 0;font-weight:600">${when}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Where</td>
              <td style="padding:6px 0">${propertyNameAddress}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Visitor</td>
              <td style="padding:6px 0">${viewing.visitor_name}${visitorEmailSuffix}</td></tr>
        </table>
        ${viewing.feedback ? `<p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px;color:#78716c">Notes: ${viewing.feedback}</p>` : ''}
      `
    await send(admin, adminSubject, emailHtml(adminBody))
    sent.push(admin)
  }

  // SMS confirmation to the applicant (if they have a phone number)
  if (viewing.visitor_phone) {
    const contextText = `Viewing — ${roomName} at ${propertyNameAddress} on ${when}`
    const smsTpl = await getTemplate('viewing-confirmation-sms')
    const smsBody = smsTpl
      ? render(smsTpl.template_text, viewingVars)
      : `Hi ${visitorFirstName}, your viewing of ${roomName} at ${propertyAddress || propertyName} is confirmed for ${when}. Reply Y to confirm you're coming, or N if you're running late. — Capital Rms`
    await sendConfirmationSms(supabase, viewing.visitor_phone, viewingId, contextText, smsBody)
  }

  const tenantTpl = await getTemplate('appointment-viewing-tenants')

  function buildTenantViewingEmail(tenantName: string, roomOrProperty: string): string {
    const tenantVars = { ...viewingVars, tenant_name: tenantName, room_or_at_property: roomOrProperty }
    if (tenantTpl) return emailHtml(render(tenantTpl.template_text, tenantVars))
    return emailHtml(`
      <h2 style="margin:0 0 18px;font-size:22px">Viewing Scheduled</h2>
      <p style="margin:0 0 12px;font-size:16px">Hi ${tenantName},</p>
      <p style="margin:0 0 20px;line-height:1.6">A viewing has been booked ${roomOrProperty}.</p>
      <div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:100px">When</td>
              <td style="padding:6px 0;font-weight:600">${when}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Room</td>
              <td style="padding:6px 0;font-weight:600">${roomName}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Property</td>
              <td style="padding:6px 0">${propertyName}</td></tr>
        </table>
      </div>
      <p style="margin:0;color:#78716c;font-size:14px">Please keep your shared areas tidy during this time. Thank you!</p>
    `)
  }

  // Send to tenant IN this room: "A viewing has been booked on your room"
  if (roomId) {
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select('person_id, people(full_name, first_name, last_name, email), opt_in_viewings')
      .eq('room_id', roomId)
      .is('end_date', null)
      .single()

    if (tenancies?.people?.email && tenancies?.opt_in_viewings) {
      const tenantName = (tenancies.people as any).first_name || 'Tenant'
      const roomSubject = tenantTpl
        ? render(tenantTpl.subject_line, { ...viewingVars, tenant_name: tenantName, room_or_at_property: 'on your room' })
        : `A viewing has been booked on your room — ${roomName}`
      await send(tenancies.people.email, roomSubject, buildTenantViewingEmail(tenantName, 'on your room'))
      sent.push(tenancies.people.email)
    }
  }

  // Send to all OTHER tenants in the property
  if (propertyId) {
    const { data: allTenancies } = await supabase
      .from('tenancies')
      .select('person_id, room_id, people(full_name, first_name, last_name, email), opt_in_viewings')
      .eq('property_id', propertyId)
      .neq('room_id', roomId)
      .is('end_date', null)

    for (const tenancy of allTenancies ?? []) {
      if (tenancy.people?.email && tenancy.opt_in_viewings) {
        const tenantName = (tenancy.people as any).first_name || 'Tenant'
        const otherSubject = tenantTpl
          ? render(tenantTpl.subject_line, { ...viewingVars, tenant_name: tenantName, room_or_at_property: 'at your property' })
          : `A viewing is booked at the house — ${propertyName}`
        await send(tenancy.people.email, otherSubject, buildTenantViewingEmail(tenantName, 'at your property'))
        sent.push(tenancy.people.email)
      }
    }
  }

  // Step 4: Log the action
  await logAudit({
    userId: user.id,
    action: 'create',
    table: 'notifications',
    recordId: viewingId,
    details: `Sent viewing notifications to ${sent.length} recipients for viewing ${viewingId}`,
    ipAddress: getClientIp(request.headers),
  })

  return NextResponse.json({ sent, message: 'Viewing scheduled and tenant notifications sent' })
}

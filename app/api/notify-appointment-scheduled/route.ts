import { NextRequest, NextResponse } from 'next/server'
import { getCommsLive } from '@/lib/comms'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'
import { emailHtml, FROM, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'
import { getTemplate, render } from '@/lib/messageTemplate'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

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
      details: 'Unauthorized attempt to access notify-appointment-scheduled endpoint',
      ipAddress: getClientIp(request.headers),
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Step 2: Verify authorization (admin only)
  if (!['administrator', 'admin'].includes(user.assignment?.role)) {
    await logAudit({
      userId: user.id,
      action: 'security_forbidden_access',
      details: `Role '${user.assignment?.role}' attempted to trigger appointment notifications`,
      ipAddress: getClientIp(request.headers),
    })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const { appointmentId } = await request.json()

  // Step 3: Validate input
  if (!appointmentId || !validateUUID(appointmentId)) {
    await logAudit({
      userId: user.id,
      action: 'security_invalid_input',
      details: `Invalid appointmentId provided: ${appointmentId}`,
      ipAddress: getClientIp(request.headers),
    })
    return NextResponse.json({ error: 'Invalid appointmentId format' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch appointment with property and room info
  const { data: appointment, error } = await supabase
    .from('property_appointments')
    .select(`
      *,
      properties:property_id(id, name, address),
      rooms:room_id(id, name)
    `)
    .eq('id', appointmentId)
    .single()

  if (error || !appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  const propertyName = (appointment.properties as any)?.name || 'Capital Rooms'
  const propertyAddress = (appointment.properties as any)?.address || ''
  const propertyId = (appointment.properties as any)?.id
  const roomName = (appointment.rooms as any)?.name || null
  const roomId = appointment.room_id

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
  const appointmentDate = new Date(appointment.appointment_date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const when = `${appointmentDate} at ${appointment.appointment_time}`
  const propertyNameAddress = `${propertyName}${propertyAddress ? `, ${propertyAddress}` : ''}`

  // Load tenant viewing template once — used for both room tenant and other tenants
  const tenantTpl = await getTemplate('appointment-viewing-tenants')

  function buildViewingEmail(tenantName: string, roomOrAtProperty: string): string {
    const vars = { tenant_name: tenantName, when, room_name: roomName ?? '', property_name: propertyName, property_name_address: propertyNameAddress, room_or_at_property: roomOrAtProperty }
    if (tenantTpl) return emailHtml(render(tenantTpl.template_text, vars))
    return emailHtml(`
      <h2 style="margin:0 0 18px;font-size:22px">Viewing Scheduled</h2>
      <p style="margin:0 0 12px;font-size:16px">Hi ${tenantName},</p>
      <p style="margin:0 0 20px;line-height:1.6">A viewing has been booked ${roomOrAtProperty}.</p>
      <div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:100px">When</td>
              <td style="padding:6px 0;font-weight:600">${when}</td></tr>
          ${roomName ? `<tr><td style="padding:6px 0;color:#78716c">Room</td>
              <td style="padding:6px 0;font-weight:600">${roomName}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#78716c">Property</td>
              <td style="padding:6px 0">${propertyName}</td></tr>
        </table>
      </div>
      <p style="margin:0;color:#78716c;font-size:14px">Please keep shared areas tidy during this time. Thank you!</p>
    `)
  }

  // Only send tenant notifications for viewing appointments
  if (appointment.notify_tenants && appointment.appointment_type === 'viewing') {
    // If a specific room was selected
    if (roomId && roomName) {
      // Send to tenant IN this room: "A viewing has been booked on your room"
      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('person_id, people(full_name, first_name, last_name, email), opt_in_viewings')
        .eq('room_id', roomId)
        .is('end_date', null)
        .single()

      if (tenancies && (tenancies as any).people?.email && tenancies?.opt_in_viewings) {
        const tenantName = (tenancies as any).people.first_name || (tenancies as any).people.name || 'Tenant'
        const roomSubject = tenantTpl
          ? render(tenantTpl.subject_line, { tenant_name: tenantName, when, room_name: roomName, property_name: propertyName, property_name_address: propertyNameAddress, room_or_at_property: 'on your room' })
          : `A viewing has been booked for your room — ${roomName}`
        await send(
          (tenancies as any).people.email,
          roomSubject,
          buildViewingEmail(tenantName, 'on your room')
        )
        sent.push(tenancies.people.email)
      }

      // Send to all OTHER tenants in the property: "A viewing is booked at the house"
      const { data: allTenancies } = await supabase
        .from('tenancies')
        .select('person_id, room_id, people(full_name, first_name, last_name, email), opt_in_viewings')
        .eq('property_id', propertyId)
        .neq('room_id', roomId)
        .is('end_date', null)

      if (allTenancies && allTenancies.length > 0) {
        for (const tenancy of allTenancies) {
          if ((tenancy as any).people?.email && tenancy.opt_in_viewings) {
            const tenantName = (tenancy as any).people.first_name || (tenancy as any).people.name || 'Tenant'
            const otherSubject = tenantTpl
              ? render(tenantTpl.subject_line, { tenant_name: tenantName, when, room_name: roomName ?? '', property_name: propertyName, property_name_address: propertyNameAddress, room_or_at_property: 'at your property' })
              : `A viewing is booked at the house — ${propertyName}`
            await send(
              (tenancy as any).people.email,
              otherSubject,
              buildViewingEmail(tenantName, 'at your property')
            )
            sent.push(tenancy.people.email)
          }
        }
      }
    } else {
      // No specific room selected — notify all tenants in the property
      const { data: allTenancies } = await supabase
        .from('tenancies')
        .select('person_id, people(full_name, first_name, last_name, email), opt_in_viewings')
        .eq('property_id', propertyId)
        .is('end_date', null)

      if (allTenancies && allTenancies.length > 0) {
        for (const tenancy of allTenancies) {
          if ((tenancy as any).people?.email && tenancy.opt_in_viewings) {
            const tenantName = (tenancy as any).people.first_name || (tenancy as any).people.name || 'Tenant'
            const allSubject = tenantTpl
              ? render(tenantTpl.subject_line, { tenant_name: tenantName, when, room_name: '', property_name: propertyName, property_name_address: propertyNameAddress, room_or_at_property: 'at your property' })
              : `A viewing is booked at the house — ${propertyName}`
            await send(
              (tenancy as any).people.email,
              allSubject,
              buildViewingEmail(tenantName, 'at your property')
            )
            sent.push(tenancy.people.email)
          }
        }
      }
    }
  }

  // Step 4: Log the action
  await logAudit({
    userId: user.id,
    action: 'create',
    table: 'notifications',
    recordId: appointmentId,
    details: `Sent appointment notifications to ${sent.length} recipients for appointment ${appointmentId}`,
    ipAddress: getClientIp(request.headers),
  })

  return NextResponse.json({ sent, message: 'Appointment scheduled and notifications sent' })
}

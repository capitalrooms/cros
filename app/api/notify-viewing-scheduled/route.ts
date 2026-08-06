import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <onboarding@resend.dev>'
const LOGO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/maintenance-photos/brand/logo.png`
const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://192.168.1.125:3000'

export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const { viewingId } = await request.json()
  if (!viewingId) {
    return NextResponse.json({ error: 'viewingId required' }, { status: 400 })
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
  const when = `${new Date(viewing.viewing_date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })} at ${viewing.viewing_slot}`

  // Send to admin
  const admin = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (admin) {
    await send(
      admin,
      `Viewing scheduled — ${roomName} at ${propertyName}`,
      shell(`
        <h2 style="margin:0 0 18px;font-size:22px">Viewing scheduled</h2>
        <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${roomName}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">When</td>
              <td style="padding:6px 0;font-weight:600">${when}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Where</td>
              <td style="padding:6px 0">${propertyName}${propertyAddress ? `, ${propertyAddress}` : ''}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Visitor</td>
              <td style="padding:6px 0">${viewing.visitor_name}${viewing.visitor_email ? ` (${viewing.visitor_email})` : ''}</td></tr>
        </table>

        ${viewing.feedback ? `<p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px;color:#78716c">Notes: ${viewing.feedback}</p>` : ''}
      `)
    )
    sent.push(admin)
  }

  // Send to tenant IN this room: "A viewing has been booked on your room"
  // Check if tenant has opted into viewing notifications
  if (roomId) {
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select('person_id, people(full_name, email), opt_in_viewings')
      .eq('room_id', roomId)
      .is('end_date', null)
      .single()

    if (tenancies?.people?.email && tenancies?.opt_in_viewings) {
      const tenantName = tenancies.people.full_name || 'Tenant'
      await send(
        tenancies.people.email,
        `A viewing has been booked on your room — ${roomName}`,
        shell(`
          <h2 style="margin:0 0 18px;font-size:22px">Viewing Scheduled</h2>
          <p style="margin:0 0 12px;font-size:16px">Hi ${tenantName},</p>
          <p style="margin:0 0 20px;line-height:1.6">A viewing has been booked on your room.</p>

          <div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600">Viewing Details:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#78716c;width:100px">When</td>
                  <td style="padding:6px 0;font-weight:600">${when}</td></tr>
              <tr><td style="padding:6px 0;color:#78716c">Room</td>
                  <td style="padding:6px 0;font-weight:600">${roomName}</td></tr>
              <tr><td style="padding:6px 0;color:#78716c">Property</td>
                  <td style="padding:6px 0">${propertyName}</td></tr>
            </table>
          </div>

          <p style="margin:0;color:#78716c;font-size:14px">If you have any questions, please contact us.</p>
        `)
      )
      sent.push(tenancies.people.email)
    }
  }

  // Send to all OTHER tenants in the property: "A viewing is booked at the house"
  // Check if they've opted into viewing notifications
  if (propertyId) {
    const { data: allTenancies } = await supabase
      .from('tenancies')
      .select('person_id, room_id, people(full_name, email), opt_in_viewings')
      .eq('property_id', propertyId)
      .neq('room_id', roomId) // Exclude the room with the viewing
      .is('end_date', null)

    if (allTenancies && allTenancies.length > 0) {
      for (const tenancy of allTenancies) {
        // Only send if tenant has opted into viewing notifications
        if (tenancy.people?.email && tenancy.opt_in_viewings) {
          const tenantName = tenancy.people.full_name || 'Tenant'
          await send(
            tenancy.people.email,
            `A viewing is booked at the house — ${propertyName}`,
            shell(`
              <h2 style="margin:0 0 18px;font-size:22px">Viewing Scheduled at Your Property</h2>
              <p style="margin:0 0 12px;font-size:16px">Hi ${tenantName},</p>
              <p style="margin:0 0 20px;line-height:1.6">Please note that a viewing has been booked at your property.</p>

              <div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0">
                <p style="margin:0 0 12px;font-size:14px;font-weight:600">Viewing Details:</p>
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
          )
          sent.push(tenancy.people.email)
        }
      }
    }
  }

  return NextResponse.json({ sent, message: 'Viewing scheduled and tenant notifications sent' })
}

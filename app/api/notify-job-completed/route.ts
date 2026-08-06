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

  const { ticketId } = await request.json()
  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: ticket, error } = await supabase
    .from('maintenance_tickets')
    .select('*, properties(name, address), rooms(name, id)')
    .eq('id', ticketId)
    .single()

  if (error || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const property = ticket.properties as any
  const room = ticket.rooms as any
  const where = [property?.name, property?.address].filter(Boolean).join(', ')
  const admin = process.env.NEXT_PUBLIC_ADMIN_EMAIL

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
  const category = (ticket.category ?? 'maintenance').replace(/-/g, ' ')

  // Send to admin
  if (admin) {
    await send(
      admin,
      `Repair completed — ${category} at ${property?.name}`,
      shell(`
        <h2 style="margin:0 0 18px;font-size:22px">Repair completed</h2>
        <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${category}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">Where</td>
              <td style="padding:6px 0">${where}${room?.name ? ` — ${room.name}` : ''}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Status</td>
              <td style="padding:6px 0"><strong>Completed</strong></td></tr>
        </table>

        <p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px;color:#78716c">
          The contractor has marked this job complete. Check the portal for photos and notes.
        </p>`)
    )
    sent.push(admin)
  }

  // Send to tenant IN this room IF they've opted into maintenance notifications
  if (room?.id) {
    const { data: tenancy } = await supabase
      .from('tenancies')
      .select('person_id, people(full_name, email), opt_in_maintenance')
      .eq('room_id', room.id)
      .is('end_date', null)
      .single()

    if (tenancy?.people?.email && tenancy?.opt_in_maintenance) {
      const tenantName = tenancy.people.full_name || 'Tenant'
      await send(
        tenancy.people.email,
        `Your repair is complete — ${category}`,
        shell(`
          <h2 style="margin:0 0 18px;font-size:22px">Repair Completed</h2>
          <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${category}</p>

          <p style="margin:0 0 20px;line-height:1.6">Hi ${tenantName},</p>
          <p style="margin:0 0 20px;line-height:1.6">
            The repair in your room has been completed. If you notice any issues, please let us know.
          </p>

          <div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#78716c;width:100px">What</td>
                  <td style="padding:6px 0;font-weight:600">${category}</td></tr>
              <tr><td style="padding:6px 0;color:#78716c">Where</td>
                  <td style="padding:6px 0;font-weight:600">${room?.name}</td></tr>
            </table>
          </div>

          <p style="margin:0;color:#78716c;font-size:14px">If you have any questions, please contact us.</p>
        `)
      )
      sent.push(tenancy.people.email)
    }
  }

  // Send to all OTHER tenants in the property IF they've opted into maintenance notifications
  if (property?.id) {
    const { data: otherTenancies } = await supabase
      .from('tenancies')
      .select('person_id, room_id, people(full_name, email), opt_in_maintenance')
      .eq('property_id', property.id)
      .neq('room_id', room?.id) // Exclude the room with the repair
      .is('end_date', null)

    if (otherTenancies && otherTenancies.length > 0) {
      for (const tenancy of otherTenancies) {
        if (tenancy.people?.email && tenancy.opt_in_maintenance) {
          const tenantName = tenancy.people.full_name || 'Tenant'
          await send(
            tenancy.people.email,
            `Maintenance completed at your property — ${category}`,
            shell(`
              <h2 style="margin:0 0 18px;font-size:22px">Maintenance Completed</h2>
              <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${category}</p>

              <p style="margin:0 0 12px;font-size:16px">Hi ${tenantName},</p>
              <p style="margin:0 0 20px;line-height:1.6">
                Maintenance work has been completed at your property.
              </p>

              <div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0">
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                  <tr><td style="padding:6px 0;color:#78716c;width:100px">What</td>
                      <td style="padding:6px 0;font-weight:600">${category}</td></tr>
                  <tr><td style="padding:6px 0;color:#78716c">Where</td>
                      <td style="padding:6px 0">${room?.name || 'Property'}</td></tr>
                </table>
              </div>

              <p style="margin:0;color:#78716c;font-size:14px">Thank you for your patience.</p>
            `)
          )
          sent.push(tenancy.people.email)
        }
      }
    }
  }

  return NextResponse.json({ sent, message: 'Job completion notifications sent' })
}

import { NextRequest, NextResponse } from 'next/server'
import { getCommsLive } from '@/lib/comms'
import { createClient } from '@supabase/supabase-js'
import { buildVisitICS } from '@/lib/calendar'
import { formatBooking } from '@/lib/booking'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'
import { emailHtml, FROM, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// Resend's shared sender — works with no domain set up. Swap for
// bookings@capitalrooms.co.uk once the domain is verified in Resend.

// Publicly hosted, because Gmail strips `data:` URIs in <img> tags — an inlined
// logo simply does not render.


/**
 * A clean, professional heading derived from category + location.
 * Deliberately NOT the tenant's own words: raw titles like "I spilt coffee on the
 * wall" read badly in a landlord-facing email and expose the tenant's grammar.
 * Their description still appears in the body for admin and contractors.
 */
function jobHeading(
  category: string | null,
  propertyName: string | null,
  roomOrLocation: string | null
) {
  const cat = (category ?? 'General').replace(/-/g, ' ')
  const nice = cat.charAt(0).toUpperCase() + cat.slice(1)
  // Full property first — a room number alone is meaningless across a portfolio.
  const place = [propertyName, roomOrLocation].filter(Boolean).join(', ')
  return place ? `${nice} repair — ${place}` : `${nice} repair`
}

export async function POST(request: NextRequest) {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!await getCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized notify-booking access', ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const { ticketId } = await request.json()
  if (!ticketId || !validateUUID(ticketId)) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid ticketId: ${ticketId}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Invalid ticketId format' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: ticket, error } = await supabase
    .from('maintenance_tickets')
    .select('*, properties(name, address), rooms(name)')
    .eq('id', ticketId)
    .single()

  if (error || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }
  if (!ticket.booked_date || !ticket.booked_slot) {
    return NextResponse.json({ error: 'Ticket has no booking' }, { status: 400 })
  }

  const when = formatBooking(ticket.booked_date, ticket.booked_slot)
  const property = ticket.properties as any
  const room = ticket.rooms as any
  const where = [property?.name, property?.address].filter(Boolean).join(', ')

  const ics = buildVisitICS({
    ticketId: ticket.id,
    title: ticket.title,
    date: ticket.booked_date,
    slot: ticket.booked_slot,
    propertyName: property?.name ?? '',
    propertyAddress: property?.address ?? '',
    roomName: room?.name,
  })
  const icsBase64 = Buffer.from(ics).toString('base64')

  const admin = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const sent: string[] = []
  const failed: { to: string; error: string }[] = []

  const heading = jobHeading(ticket.category, property?.name, room?.name ?? ticket.location)

  // Who is attending — admin sees this, the landlord never does.
  const { data: contractor } = ticket.contractor_id
    ? await supabase
        .from('people')
        .select('full_name, first_name, last_name, email, phone')
        .eq('id', ticket.contractor_id)
        .maybeSingle()
    : { data: null }

  const attending = contractor
    ? `${contractor.name ?? contractor.email}${contractor.phone ? ` · ${contractor.phone}` : ''}`
    : 'Not yet assigned'

  async function send(to: string, subject: string, html: string, attachIcs: boolean) {
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
        ...(attachIcs && {
          attachments: [{ filename: 'repair-visit.ics', content: icsBase64 }],
        }),
      }),
    })
    if (res.ok) sent.push(to)
    else failed.push({ to, error: await res.text() })
  }

  // Admin — full detail plus the calendar invite.
  if (admin) {
    await send(
      admin,
      `Repair booked — ${heading} — ${when}`,
      emailHtml(`
        <h2 style="margin:0 0 18px;font-size:22px">Repair booked</h2>
        <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${heading}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">When</td>
              <td style="padding:6px 0;font-weight:600">${when}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Attending</td>
              <td style="padding:6px 0;font-weight:600">${attending}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Where</td>
              <td style="padding:6px 0">${where}${room?.name ? ` — ${room.name}` : ''}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Priority</td>
              <td style="padding:6px 0">${ticket.priority}</td></tr>
        </table>

        <p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px">
          <span style="color:#78716c">Reported by tenant:</span><br>${ticket.title}
        </p>
        <p style="color:#78716c;font-size:13px">Add the attached invite to your calendar.</p>`),
      true
    )
  }

  // Contractor — their own copy with the calendar invite, so the job lands in
  // whatever diary they already use and they never need to open the portal.
  if (contractor?.email) {
    await send(
      contractor.email,
      `Job confirmed — ${heading} — ${when}`,
      emailHtml(`
        <h2 style="margin:0 0 18px;font-size:22px">Job confirmed</h2>
        <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${heading}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">When</td>
              <td style="padding:6px 0;font-weight:600">${when}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Address</td>
              <td style="padding:6px 0;font-weight:600">${where}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Where in the property</td>
              <td style="padding:6px 0">${room?.name || ticket.location || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Priority</td>
              <td style="padding:6px 0">${ticket.priority}</td></tr>
        </table>

        <p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px">
          <span style="color:#78716c">Reported by tenant:</span><br>${ticket.title}<br>
          <span style="color:#78716c">${ticket.description ?? ''}</span>
        </p>

        <p style="margin-top:16px">
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}"
             style="color:#1c1917;font-weight:600">Get directions →</a>
        </p>

        <p style="color:#78716c;font-size:13px">
          The calendar invite attached will add this to your diary.
        </p>`),
      true
    )
  }

  // Landlord — opted in only, and NEVER told who the contractor is.
  const { data: landlords } = await supabase
    .from('people')
    .select('email')
    .eq('role', 'landlord')
    .eq('property_id', ticket.property_id)
    .eq('notify_by_email', true)

  for (const landlord of landlords ?? []) {
    await send(
      landlord.email,
      `Repair scheduled at ${property?.name ?? 'your property'}`,
      emailHtml(`
        <h2 style="margin:0 0 18px;font-size:22px">A repair has been scheduled</h2>
        <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${heading}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">Property</td>
              <td style="padding:6px 0;font-weight:600">${where}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Scheduled</td>
              <td style="padding:6px 0;font-weight:600">${when}</td></tr>
        </table>

        <p style="margin-top:20px">
          <strong>Capital Rooms has responded and arranged for this to be repaired.</strong>
        </p>
        <p style="color:#78716c;font-size:13px">
          Capital Rooms is managing this on your behalf — nothing is needed from you.
        </p>`),
      false
    )
  }

  return NextResponse.json({ sent, failed })
}

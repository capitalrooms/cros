import { NextRequest, NextResponse } from 'next/server'
import { tenantCommsLive } from '@/lib/comms'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <onboarding@resend.dev>'
const LOGO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/maintenance-photos/brand/logo.png`
const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://192.168.1.125:3002'

function jobHeading(
  category: string | null,
  propertyName: string | null,
  roomOrLocation: string | null
) {
  const cat = (category ?? 'General').replace(/-/g, ' ')
  const nice = cat.charAt(0).toUpperCase() + cat.slice(1)
  const place = [propertyName, roomOrLocation].filter(Boolean).join(', ')
  return place ? `${nice} repair — ${place}` : `${nice} repair`
}

export async function POST(request: NextRequest) {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!tenantCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized notify-job-raised access', ipAddress: getClientIp(request.headers) })
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
    .select('*, properties(name, address), rooms(name), people(email)')
    .eq('id', ticketId)
    .single()

  if (error || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const property = ticket.properties as any
  const room = ticket.rooms as any
  const reporter = ticket.people as any
  const where = [property?.name, property?.address].filter(Boolean).join(', ')
  const admin = process.env.NEXT_PUBLIC_ADMIN_EMAIL

  const shell = (inner: string) => `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c1917">
      <a href="${PORTAL_URL}">
        <img src="${LOGO_URL}" alt="Capital Rooms" style="height:64px;width:auto;margin-bottom:20px" />
      </a>
      ${inner}
      <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e7e5e4">
        <a href="${PORTAL_URL}/tenant"
           style="display:inline-block;background:#1c1917;color:#ffffff;font-size:15px;font-weight:600;
                  padding:13px 24px;border-radius:8px;text-decoration:none">
          View your requests
        </a>
        <p style="margin-top:14px;color:#a8a29e;font-size:13px">
          Track this repair and get updates as it progresses.
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

  const heading = jobHeading(ticket.category, property?.name, room?.name ?? ticket.location)
  const sent: string[] = []

  // Tenant — confirmation that we received their request
  // Always send this to the reporter (transactional), regardless of opt-in
  // because they initiated the contact
  if (reporter?.email) {
    const success = await send(
      reporter.email,
      `Request received — ${heading}`,
      shell(`
        <h2 style="margin:0 0 18px;font-size:22px">We received your request</h2>
        <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${heading}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">What</td>
              <td style="padding:6px 0;font-weight:600">${ticket.title}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Where</td>
              <td style="padding:6px 0">${where}${room?.name ? ` — ${room.name}` : ''}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Priority</td>
              <td style="padding:6px 0">${ticket.priority}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Status</td>
              <td style="padding:6px 0"><strong>Awaiting review</strong></td></tr>
        </table>

        <p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px;color:#78716c">
          Your request has been submitted and is now waiting for our team to review and schedule.
          You'll get an email as soon as a time is arranged.
        </p>`)
    )
    if (success) sent.push(reporter.email)
  }

  // Admin — notified that a new job has been raised
  if (admin) {
    await send(
      admin,
      `New request — ${heading}`,
      shell(`
        <h2 style="margin:0 0 18px;font-size:22px">New maintenance request</h2>
        <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">${heading}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">Reported by</td>
              <td style="padding:6px 0;font-weight:600">${reporter?.email || 'Unknown'}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Where</td>
              <td style="padding:6px 0">${where}${room?.name ? ` — ${room.name}` : ''}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Priority</td>
              <td style="padding:6px 0">${ticket.priority}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Description</td>
              <td style="padding:6px 0">${ticket.description ?? '—'}</td></tr>
        </table>

        <p style="margin-top:20px">
          <strong>Action needed:</strong> Review and approve this request, then assign to a contractor.
        </p>`)
    )
    sent.push(admin)
  }

  return NextResponse.json({ sent })
}

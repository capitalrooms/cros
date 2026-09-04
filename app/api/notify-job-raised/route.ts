import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'
import twilio from 'twilio'
import { emailHtml, FROM, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'
import { getTemplate, render } from '@/lib/messageTemplate'

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from) return // SMS not configured yet — skip silently
  try {
    const client = twilio(sid, token)
    await client.messages.create({ to, from, body })
  } catch (e) {
    console.warn('SMS failed:', e)
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

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
    .select(`
      *,
      properties(name, address),
      rooms(name),
      people(email),
      contractor:people!contractor_id(id, first_name, last_name, full_name, email, phone)
    `)
    .eq('id', ticketId)
    .single()

  if (error || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const property = ticket.properties as any
  const room = ticket.rooms as any
  const reporter = ticket.people as any
  const contractor = ticket.contractor as any
  const where = [property?.name, property?.address].filter(Boolean).join(', ')
  const admin = process.env.NEXT_PUBLIC_ADMIN_EMAIL

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

  // Load DB templates (falls back to hardcoded if not yet migrated)
  const [tplTenant, tplAdmin, tplContractor] = await Promise.all([
    getTemplate('maintenance-tenant-receipt'),
    getTemplate('maintenance-admin-alert'),
    getTemplate('maintenance-contractor-assignment'),
  ])

  const vars = {
    heading,
    ticket_title: ticket.title,
    where: `${where}${room?.name ? ` — ${room.name}` : ''}`,
    priority: ticket.priority ?? '',
    reporter_email: reporter?.email || 'Unknown',
    description: ticket.description ?? '—',
    property_name: property?.name || '—',
    property_address: property?.address || '—',
    room_name: room?.name || '',
    portal_url: PORTAL_URL,
  }

  // Tenant — confirmation that we received their request
  if (reporter?.email) {
    const subject = tplTenant ? render(tplTenant.subject_line, vars) : `Request received — ${heading}`
    const body = tplTenant ? render(tplTenant.template_text, vars) : `
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
        </p>`
    const success = await send(reporter.email, subject, emailHtml(body))
    if (success) sent.push(reporter.email)
  }

  // Admin — notified that a new job has been raised
  if (admin) {
    const subject = tplAdmin ? render(tplAdmin.subject_line, vars) : `New request — ${heading}`
    const body = tplAdmin ? render(tplAdmin.template_text, vars) : `
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
        </p>`
    await send(admin, subject, emailHtml(body))
    sent.push(admin)
  }

  // Contractor — notify them of the new job assignment
  if (contractor?.email) {
    const contractorName = contractor.first_name
      ? `${contractor.first_name}${contractor.last_name ? ' ' + contractor.last_name : ''}`
      : contractor.full_name || 'there'
    const contractorVars = { ...vars, contractor_name: contractorName }
    const subject = tplContractor ? render(tplContractor.subject_line, contractorVars) : `New job assigned — ${heading}`
    const body = tplContractor ? render(tplContractor.template_text, contractorVars) : `
        <h2 style="margin:0 0 8px;font-size:22px">Hi ${contractorName}, you've been assigned a job</h2>
        <p style="margin:0 0 24px;font-size:18px;font-weight:600;line-height:1.5">${heading}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#78716c;width:110px">Job</td>
              <td style="padding:6px 0;font-weight:600">${ticket.title}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Property</td>
              <td style="padding:6px 0">${property?.name || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Address</td>
              <td style="padding:6px 0">${property?.address || '—'}</td></tr>
          ${room?.name ? `<tr><td style="padding:6px 0;color:#78716c">Room</td><td style="padding:6px 0">${room.name}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#78716c">Priority</td>
              <td style="padding:6px 0">${ticket.priority}</td></tr>
          ${ticket.description ? `<tr><td style="padding:6px 0;color:#78716c">Details</td><td style="padding:6px 0">${ticket.description}</td></tr>` : ''}
        </table>
        <p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px;color:#78716c">
          Please log in to the contractor portal to confirm you've received this job and book a date to attend.
        </p>`
    await send(contractor.email, subject, emailHtml(body))
    sent.push(contractor.email)

    // SMS — send if contractor has a phone number and Twilio is configured
    const contractorPhone = (contractor as any).phone
    if (contractorPhone) {
      const address = property?.address || property?.name || 'the property'
      const smsBody = `Hi ${contractorName}, new job from Capital Rooms: ${ticket.title} at ${address}. Reply Y to confirm you'll attend, or N if you have a scheduling issue. Portal: ${PORTAL_URL}/contractor/jobs — Capital Rms`
      await sendSms(contractorPhone, smsBody)
      // Log for Y/N reply matching
      try {
        const supa = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        await supa.from('sms_confirmations').insert({
          phone: contractorPhone,
          type: 'contractor_job',
          related_id: ticketId,
          context_text: `Job: ${ticket.title} at ${address}`,
        })
      } catch (e) {
        console.warn('sms_confirmations insert failed:', e)
      }
    }
  }

  return NextResponse.json({ sent })
}

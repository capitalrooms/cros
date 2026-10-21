import { NextRequest, NextResponse } from 'next/server'
import { deliverEmail } from '@/lib/sendEmail'
import { hiName } from '@/lib/people'
import { requireSignedIn, canWorkOnTicket, canActAtProperty, requireStaff, isStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/serverAuth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'
import { tellContractor } from '@/lib/contractorContact'
import { emailHtml, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'
import { getTemplate, render } from '@/lib/messageTemplate'
import { sendServerPush } from '@/lib/serverPush'
import { getCommsLive } from '@/lib/comms'
import { repairTarget } from '@/lib/repairs/targets'



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
  if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
  {
    const caller = await requireSignedIn(request)
    const { data: t } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).from('maintenance_tickets').select('property_id').eq('id', ticketId).maybeSingle()
    if (!t?.property_id || !(isStaff(caller) || (await canActAtProperty(caller, t.property_id)))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ticketId || !validateUUID(ticketId)) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid ticketId: ${ticketId}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Invalid ticketId format' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: ticket, error } = await supabase
    .from('maintenance_tickets')
    .select(`
      *,
      properties(name, address),
      rooms(name)
    `)
    .eq('id', ticketId)
    .single()

  if (error || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const property = ticket.properties as any
  const room = ticket.rooms as any
  // No foreign keys from maintenance_tickets to people — look up reporter and contractor directly
  const personById = async (id: string | null | undefined) => id
    ? (await supabase.from('people').select('*').eq('id', id).maybeSingle()).data as any
    : null
  const reporter = await personById((ticket as any).reporter_id)
  const contractor = await personById((ticket as any).contractor_id)
  const where = [property?.name, property?.address].filter(Boolean).join(', ')
  const admin = process.env.NEXT_PUBLIC_ADMIN_EMAIL

  async function send(to: string, subject: string, html: string) {
    const res = await deliverEmail({
        to: [to],
        subject,
        html,
      }, { req: request })
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
    repair_promise: (() => { const t = repairTarget(ticket as any); return t.tier === 'emergency' ? '' : t.message })(),   // {repair_promise} for saved templates
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

  // Tenant — confirmation that we received their request (an automatic tenant message: paused while tenant
  // messages are off — the office and contractor alerts below still go; 21 Oct 2026 audit)
  if (reporter?.email && (reporter.role !== 'tenant' || await getCommsLive())) {
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
          ${(() => { const t = repairTarget(ticket as any); return t.tier === 'emergency' ? '' : t.message })()}
          You'll get an email as soon as a time is arranged.
        </p>`
    const success = await send(reporter.email, subject, await emailHtml(body, { req: request }))
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
    await send(admin, subject, await emailHtml(body, { req: request }))
    sent.push(admin)
  }

  // Contractor — the new job, the way they've asked to hear from us (text / app / email, lib/contractorContact).
  // Texts come from CAPITAL RMS, so they confirm and book from the link, never by replying.
  if (contractor) {
    const contractorName = hiName(contractor)   // lib/people — the one greeting rule
    const contractorVars = { ...vars, contractor_name: contractorName }
    const subject = tplContractor ? render(tplContractor.subject_line, contractorVars, contractor) : `New job assigned — ${heading}`
    const body = tplContractor ? render(tplContractor.template_text, contractorVars, contractor) : `
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
          Please open the job to confirm you've received it and book a date to attend: <a href="${PORTAL_URL}/contractor/jobs">${PORTAL_URL}/contractor/jobs</a>
        </p>`
    const firstLine = String(property?.name || property?.address || 'the property').split('\n')[0]
    const out = await tellContractor(contractor, contractor.id, {
      text: `CAPITAL ROOMS: new job for you — ${heading}. Please open it to confirm and book a date: ${PORTAL_URL}/contractor/jobs`,
      title: '🔧 New job from Capital Rooms', body: heading.slice(0, 120) || firstLine,
      url: '/contractor/jobs', link: `${PORTAL_URL}/contractor/jobs`, tag: `job-${ticketId}`,
      emailSubject: subject, emailBodyHtml: body,
    })
    sent.push(`contractor${out.via.length ? ` (${out.via.join(', ')})` : ` (not reached: ${out.error})`}`)
  }

  // Push notification to admin — fire-and-forget, never blocks the response
  // Targets administrator role only; tenants are NOT affected
  const pushBody = [
    ticket.category ? ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1).replace(/-/g, ' ') : 'General',
    property?.name || property?.address || '',
    room?.name || ticket.location || '',
  ].filter(Boolean).join(' — ')
  sendServerPush({
    role: 'administrator',
    title: '🔧 New maintenance ticket',
    body: pushBody || ticket.title || 'A new ticket has been raised',
    url: '/admin/maintenance',
    tag: `ticket-${ticketId}`,
  })

  return NextResponse.json({ sent })
}

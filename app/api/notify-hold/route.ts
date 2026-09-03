import { NextRequest, NextResponse } from 'next/server'
import { getCommsLive } from '@/lib/comms'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID } from '@/lib/validation'
import { emailHtml, FROM, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * Tells the tenant their job has been held for batching.
 *
 * Holding silently is what generates chasing messages — the tenant assumes
 * they've been ignored. Saying it plainly, and framing it as less disruption
 * for them, turns a delay into a considered decision.
 */
export async function POST(request: NextRequest) {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!await getCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized notify-hold access', ipAddress: getClientIp(request.headers) })
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

  const { data: ticket } = await supabase
    .from('maintenance_tickets')
    .select('*, properties(name), rooms(name)')
    .eq('id', ticketId)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const { data: reporter } = await supabase
    .from('people')
    .select('email, full_name, first_name, last_name')
    .eq('id', ticket.reporter_id)
    .maybeSingle()

  if (!reporter?.email) {
    return NextResponse.json({ error: 'No reporter email' }, { status: 400 })
  }

  const category = (ticket.category ?? 'maintenance').replace(/-/g, ' ')

  const html = emailHtml(`
      <h2 style="margin:0 0 14px;font-size:20px;color:#1c1917;font-weight:700;">Thanks for reporting this</h2>
      <p style="margin:0 0 20px;font-size:16px;font-weight:600;color:#1c1917;line-height:1.4;">
        ${category.charAt(0).toUpperCase() + category.slice(1)} —
        ${(ticket.rooms as any)?.name ?? ticket.location ?? ''}
      </p>
      <p style="font-size:15px;line-height:1.6;color:#1c1917;margin:0 0 12px;">
        We've logged this. It's a smaller job that can sensibly be done at the same
        time as other work, so we're holding it until there's more to do at your
        property — that way you're disrupted once rather than several times.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#1c1917;margin:0 0 12px;">
        <strong>You'll be given a date and arrival time as soon as it's booked in.</strong>
      </p>
      <p style="font-size:14px;color:#78716c;margin:0 0 24px;">
        If this becomes urgent in the meantime, report it again and tell us it's got worse.
      </p>
      <a href="${PORTAL_URL}/tenant"
         style="display:inline-block;background:#1c1917;color:#ffffff;font-size:14px;font-weight:600;
                padding:12px 22px;border-radius:8px;text-decoration:none;">
        Open dashboard
      </a>`)

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [reporter.email],
      subject: `We've logged your ${category} report`,
      html,
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: 502 })
  }
  return NextResponse.json({ sent: reporter.email })
}

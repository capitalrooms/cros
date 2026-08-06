import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <onboarding@resend.dev>'
const LOGO_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/maintenance-photos/brand/logo.png`
const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://192.168.1.125:3000'

/**
 * Tells the tenant their job has been held for batching.
 *
 * Holding silently is what generates chasing messages — the tenant assumes
 * they've been ignored. Saying it plainly, and framing it as less disruption
 * for them, turns a delay into a considered decision.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const { ticketId } = await request.json()
  if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 })

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
    .select('email, full_name')
    .eq('id', ticket.reporter_id)
    .maybeSingle()

  if (!reporter?.email) {
    return NextResponse.json({ error: 'No reporter email' }, { status: 400 })
  }

  const category = (ticket.category ?? 'maintenance').replace(/-/g, ' ')

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c1917">
      <a href="${PORTAL_URL}">
        <img src="${LOGO_URL}" alt="Capital Rooms" style="height:64px;width:auto;margin-bottom:20px" />
      </a>

      <h2 style="margin:0 0 18px;font-size:22px">Thanks for reporting this</h2>
      <p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">
        ${category.charAt(0).toUpperCase() + category.slice(1)} —
        ${(ticket.rooms as any)?.name ?? ticket.location ?? ''}
      </p>

      <p style="font-size:15px;line-height:1.6">
        We've logged this. It's a smaller job that can sensibly be done at the same
        time as other work, so we're holding it until there's more to do at your
        property — that way you're disrupted once rather than several times.
      </p>
      <p style="font-size:15px;line-height:1.6">
        <strong>You'll be given a date and arrival time as soon as it's booked in.</strong>
      </p>
      <p style="font-size:14px;color:#78716c">
        If this becomes urgent in the meantime, report it again and tell us it's got worse.
      </p>

      <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e7e5e4">
        <a href="${PORTAL_URL}"
           style="display:inline-block;background:#1c1917;color:#ffffff;font-size:15px;font-weight:600;
                  padding:13px 24px;border-radius:8px;text-decoration:none">
          Open dashboard
        </a>
      </div>
    </div>`

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

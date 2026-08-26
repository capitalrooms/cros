import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { buildIcs } from '@/lib/ics'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <onboarding@resend.dev>'

/**
 * Emails a staff member a calendar invite (.ics attachment) for something they
 * just booked, so it lands in their own Gmail / calendar outside CROS.
 * This is the staff member inviting THEMSELVES — not tenant/applicant comms —
 * so it isn't gated by the tenant-comms kill switch.
 *
 * If RESEND_API_KEY isn't configured it no-ops gracefully (like the SMS offer),
 * so the UI can always call it without erroring.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['lettings', 'administrator', 'admin'].includes(user.assignment?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { to, title, description, location, date, time, durationMinutes } = body || {}

  // Default the recipient to the logged-in staff member's own email.
  const recipient = (to || user.email || '').trim()
  if (!recipient) return NextResponse.json({ error: 'No recipient email' }, { status: 400 })
  if (!title || !date) return NextResponse.json({ error: 'title and date are required' }, { status: 400 })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Not an error — mirror the SMS offer's graceful degradation.
    return NextResponse.json({ sent: false, reason: 'email_not_configured' })
  }

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@capitalrooms.cros`
  const ics = buildIcs({ uid, title, description, location, date, time, durationMinutes })
  const icsBase64 = Buffer.from(ics, 'utf8').toString('base64')

  const when = `${new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${time ? ` at ${time}` : ''}`
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px">
      <h2 style="margin:0 0 8px">${title}</h2>
      <p style="color:#444;margin:0 0 4px">${when}</p>
      ${location ? `<p style="color:#666;margin:0 0 12px">📍 ${location}</p>` : ''}
      ${description ? `<p style="color:#444">${description}</p>` : ''}
      <p style="color:#888;font-size:13px;margin-top:16px">Open the attached invite to add this to your calendar.</p>
    </div>`

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [recipient],
        subject: `📅 ${title} — ${when}`,
        html,
        attachments: [{ filename: 'invite.ics', content: icsBase64 }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json({ sent: false, error: `Email failed: ${detail.slice(0, 200)}` }, { status: 502 })
    }
    return NextResponse.json({ sent: true, to: recipient })
  } catch (err) {
    return NextResponse.json({ sent: false, error: err instanceof Error ? err.message : 'Send failed' }, { status: 500 })
  }
}

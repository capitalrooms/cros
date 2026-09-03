/**
 * Twilio inbound SMS webhook.
 *
 * Twilio POSTs here whenever someone replies to our number.
 * We look up the most recent pending sms_confirmations row for that phone,
 * interpret Y / N, update the DB, reply with a TwiML message, and
 * ping the admin/agent via email.
 *
 * Configure in Twilio Console:
 *   Phone Numbers → +447700162018 → Messaging → Webhook URL:
 *   https://cros-sigma.vercel.app/api/webhooks/twilio-inbound
 *   Method: HTTP POST
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { emailHtml, FROM } from '@/lib/emailTemplate'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const PORTAL_URL = 'https://cros-sigma.vercel.app'
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'harry@capitalrooms.co.uk'

// Return TwiML so Twilio sends a reply SMS back to the user
function twiml(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message}</Message>
</Response>`
  return new NextResponse(xml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

async function notifyAdmin(subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [ADMIN_EMAIL], subject, html }),
  })
}

export async function POST(request: NextRequest) {
  // Twilio sends form-encoded body
  const body = await request.text()
  const params = new URLSearchParams(body)

  const from   = params.get('From') ?? ''   // e.g. +447760999668
  const rawMsg = (params.get('Body') ?? '').trim()
  const reply  = rawMsg.toUpperCase().charAt(0) // 'Y', 'N', or other

  if (!from) return twiml('Sorry, we could not process your reply.')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find the most recent pending confirmation for this phone number
  const { data: conf } = await supabase
    .from('sms_confirmations')
    .select('*')
    .eq('phone', from)
    .is('response', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conf) {
    // No pending confirmation — might be a stale or unsolicited reply
    return twiml('Hi! We don\'t have a pending request linked to your number. If you need help please call us. — Capital Rooms')
  }

  const isViewing    = conf.type === 'viewing'
  const isContractor = conf.type === 'contractor_job'
  const context      = conf.context_text ?? 'your appointment'

  // Update the DB
  await supabase
    .from('sms_confirmations')
    .update({
      response:      reply === 'Y' ? 'Y' : reply === 'N' ? 'N' : 'other',
      response_raw:  rawMsg,
      responded_at:  new Date().toISOString(),
    })
    .eq('id', conf.id)

  // --- Y: confirmed ---
  if (reply === 'Y') {
    await supabase
      .from('sms_confirmations')
      .update({ agent_notified: true })
      .eq('id', conf.id)

    // Notify admin
    const subject = isViewing
      ? `Viewing confirmed — applicant replied Y`
      : `Contractor confirmed — replied Y`

    await notifyAdmin(
      subject,
      emailHtml(`
        <h2 style="font-size:19px;color:#1c1917;font-weight:700;margin:0 0 8px;">Confirmed ✅</h2>
        <p style="font-size:15px;color:#1c1917;margin:0 0 20px;">${context}</p>
        <p style="font-size:14px;color:#78716c;margin:0 0 20px;">
          ${isViewing ? 'The applicant' : 'The contractor'} replied <strong>Y</strong> — they are on their way.
        </p>
        <a href="${PORTAL_URL}/${isViewing ? 'lettings' : 'admin/maintenance'}"
           style="display:inline-block;background:#1c1917;color:#fff;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;text-decoration:none;">
          View in portal →
        </a>`)
    )

    if (isViewing) {
      return twiml(`Great — we'll see you there! If anything changes, please call us. — Capital Rms`)
    } else {
      return twiml(`Confirmed — see you at the property. If you have any issues getting access please call us. — Capital Rms`)
    }
  }

  // --- N: running late / can't make it ---
  if (reply === 'N') {
    await supabase
      .from('sms_confirmations')
      .update({ agent_notified: true })
      .eq('id', conf.id)

    const subject = isViewing
      ? `Viewing — applicant replied N (running late / issue)`
      : `Contractor — replied N (running late / issue)`

    await notifyAdmin(
      subject,
      emailHtml(`
        <h2 style="font-size:19px;color:#1c1917;font-weight:700;margin:0 0 8px;">Running late or issue ⚠️</h2>
        <p style="font-size:15px;color:#1c1917;margin:0 0 20px;">${context}</p>
        <p style="font-size:14px;color:#78716c;margin:0 0 20px;">
          ${isViewing ? 'The applicant' : 'The contractor'} replied <strong>N</strong>.
          They may be running late or need to reschedule — please give them a call.
        </p>
        <a href="${PORTAL_URL}/${isViewing ? 'lettings' : 'admin/maintenance'}"
           style="display:inline-block;background:#d97706;color:#fff;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;text-decoration:none;">
          View in portal →
        </a>`)
    )

    if (isViewing) {
      return twiml(`No problem — our team has been notified. Please give us a call if you need to reschedule. — Capital Rms`)
    } else {
      return twiml(`Understood — we've let the team know. Please call us or reply with your ETA if you're on your way. — Capital Rms`)
    }
  }

  // --- Anything else (ETA, question, random text) ---
  // Pass to admin as a note — we can't auto-handle it
  await notifyAdmin(
    `SMS reply from ${from} — needs attention`,
    emailHtml(`
      <h2 style="font-size:19px;color:#1c1917;font-weight:700;margin:0 0 8px;">SMS reply — needs attention</h2>
      <p style="font-size:15px;color:#1c1917;margin:0 0 8px;">${context}</p>
      <p style="font-size:14px;color:#78716c;margin:0 0 4px;">From: <strong>${from}</strong></p>
      <p style="font-size:14px;color:#1c1917;background:#f5f4f2;padding:12px;border-radius:6px;margin:0 0 20px;">"${rawMsg}"</p>
      <p style="font-size:13px;color:#78716c;">This couldn't be handled automatically — please call or reply to them directly.</p>`)
  )

  return twiml(`Thanks for your message — our team will be in touch shortly. If urgent please call us. — Capital Rms`)
}

/**
 * POST /api/lettings/notify-applicant
 *
 * Quick Notify for the person coming to a viewing — "running 10 minutes late", "the viewing has moved" —
 * by text and/or email, from the signed-in lettings or office user. Used by the lettings home (app/lettings).
 *
 * Body: { viewing_id, message, sms?: boolean, email?: boolean }
 * → { smsSent, emailSent, smsError?, emailError? } — each channel reports on its own, so a missing phone
 *   number doesn't stop the email going.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { requireStaff } from '@/lib/portalAuth'
import { getNewTenantCommsLive } from '@/lib/comms'
import { getSmsSignOff } from '@/lib/auth'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "07700 900123" / "+44 (0)7700…" → "+447700900123"; anything else is passed through for Twilio to judge
function toE164(raw: string): string {
  const s = raw.replace(/[^\d+]/g, '').replace(/^\+44\(?0\)?/, '+44').replace(/^0044/, '+44')
  if (s.startsWith('+')) return s
  if (s.startsWith('44')) return `+${s}`
  if (s.startsWith('0')) return `+44${s.slice(1)}`
  return s
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const message = String(b.message ?? '').trim()
  const wantSms = b.sms !== false
  const wantEmail = b.email !== false
  if (!b.viewing_id) return NextResponse.json({ error: 'Choose the viewing' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Write a message' }, { status: 400 })
  if (message.length > 1000) return NextResponse.json({ error: 'Keep the message under 1,000 characters' }, { status: 400 })
  if (!wantSms && !wantEmail) return NextResponse.json({ error: 'Choose text or email' }, { status: 400 })
  // the person coming to a viewing isn't a tenant yet — allowed while tenant messages are paused
  if (!(await getNewTenantCommsLive())) return NextResponse.json({ error: 'Messages are paused at the moment (comms switch is off)' }, { status: 503 })

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: v } = await svc.from('viewings')
    .select('visitor_name, visitor_email, visitor_phone, properties(name, address)')
    .eq('id', b.viewing_id).maybeSingle() as { data: any }
  if (!v) return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })

  const first = String(v.visitor_name || '').trim().split(/\s+/)[0] || 'there'
  const out: { smsSent: boolean; emailSent: boolean; smsError?: string; emailError?: string } = { smsSent: false, emailSent: false }

  if (wantSms) {
    const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER
    if (!v.visitor_phone) out.smsError = 'No phone number on this viewing'
    else if (!sid || !token || !from) out.smsError = 'Text messages are not set up'
    else {
      try {
        const signOff = await getSmsSignOff(caller.email)
        await twilio(sid, token).messages.create({ body: `Hi ${first}, ${message} -${signOff}`, from, to: toE164(v.visitor_phone) })
        out.smsSent = true
      } catch (e) {
        out.smsError = e instanceof Error ? e.message : 'Text failed'
      }
    }
  }

  if (wantEmail) {
    if (!v.visitor_email) out.emailError = 'No email address on this viewing'
    else {
      const place = v.properties?.address || v.properties?.name || ''
      const { ok, error } = await sendEmail(v.visitor_email, `Your viewing${place ? ` at ${place}` : ''}`, messageHtml(`Hi ${first},\n\n${message}`), { req })
      if (ok) out.emailSent = true
      else out.emailError = error ?? 'Email failed'
    }
  }

  const status = out.smsSent || out.emailSent ? 200 : 422
  return NextResponse.json(out, { status })
}

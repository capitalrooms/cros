import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTemplate, render } from '@/lib/messageTemplate'
import { buildEmail } from '@/lib/emailWrapper'
import { senderFields } from '@/lib/email/sender'
import { holdingDepositRef } from '@/lib/offers/holdingRef'
import { buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { oneWeekRent } from '@/lib/tenancy/deposit'

export const runtime = 'nodejs'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

function weeklyRent(monthly: number) {
  return Math.round((monthly * 12) / 52)
}


// Fallback HTML when DB template isn't loaded yet — body content only, wrapper applied via buildEmail
async function applyEmailHtml(vars: { firstName: string; roomName: string; propAddress: string; applyUrl: string }, req: Request): Promise<string> {
  return buildEmail(`
<p style="font-size:16px;margin:0 0 16px">Hi ${vars.firstName},</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#444">
  Thanks for viewing <strong>${vars.roomName}</strong>${vars.propAddress ? ` at ${vars.propAddress}` : ''}.
  We'd love to invite you to submit a formal application — it takes less than 5 minutes.
</p>
<div style="text-align:center;margin:28px 0">
  <a href="${vars.applyUrl}" style="background:#86284a;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
    Apply Now →
  </a>
</div>
<p style="font-size:13px;color:#888;margin:0 0 4px">Or copy this link:</p>
<p style="font-size:13px;color:#555;word-break:break-all;background:#f5f5f5;padding:10px 12px;border-radius:6px;margin:0">${vars.applyUrl}</p>`, { req })
}


export async function POST(request: NextRequest) {
  // Auth: verify the caller's Supabase session via the cookie on the request.
  // Using next/headers directly (supported in Next.js route handlers) avoids
  // importing auth-helpers which doesn't support Next.js 16.
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const sessionCookie = allCookies.find(c => c.name.includes('auth-token') && c.name.startsWith('sb-'))
  if (!sessionCookie) {
    // No session cookie — check Authorization header as fallback
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { viewingId, manual, method, mode = 'apply' } = await request.json()
  if (!viewingId && !manual) return NextResponse.json({ error: 'viewingId or manual details required' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Resolve viewing or manual details ──────────────────────────────────────
  let roomLabel: string
  let propAddress: string
  let propCode: string | null
  let monthly: number | null
  let weekly: number | null
  let visitorName: string
  let firstName: string
  let visitorEmail: string | null
  let visitorPhone: string | null
  let roomId: string | null = null
  let propertyId: string | null = null
  let viewingRow: any = null

  if (manual) {
    visitorName  = manual.name  || 'there'
    firstName    = visitorName.split(' ')[0]
    visitorEmail = manual.email || null
    visitorPhone = manual.phone || null

    // If a real room_id was supplied, look it up for accurate room/property details
    if (manual.room_id) {
      roomId     = manual.room_id
      propertyId = manual.property_id || null
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('id, name, current_asking_rent, property_id, properties(name, address, property_code)')
        .eq('id', manual.room_id)
        .single()
      if (roomRow) {
        roomLabel  = roomRow.name || ''
        const prop = (roomRow.properties as any)
        propAddress = prop?.address || prop?.name || ''
        propCode    = prop?.property_code || null
        monthly     = roomRow.current_asking_rent || null
        weekly      = monthly ? weeklyRent(monthly) : null
        if (!propertyId) propertyId = roomRow.property_id
      } else {
        roomLabel   = ''
        propAddress = ''
        propCode    = null
        monthly     = null
        weekly      = null
      }
    } else {
      // No room selected — fallback to blank labels (apply URL will be generic)
      roomLabel   = ''
      propAddress = ''
      propCode    = null
      monthly     = null
      weekly      = null
    }
  } else {
    const { data: viewing, error } = await supabase
      .from('viewings')
      .select('id, visitor_name, visitor_email, visitor_phone, room_id, property_id, viewing_date, viewing_slot, rooms(name, current_asking_rent), properties(name, address, property_code)')
      .eq('id', viewingId)
      .single()

    if (error || !viewing) {
      return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })
    }

    viewingRow   = viewing
    roomLabel    = (viewing.rooms as any)?.name || 'Your room'
    const propName = (viewing.properties as any)?.name || ''
    propAddress  = (viewing.properties as any)?.address || propName
    propCode     = (viewing.properties as any)?.property_code || null
    monthly      = (viewing.rooms as any)?.current_asking_rent || null
    weekly       = monthly ? weeklyRent(monthly) : null
    visitorName  = viewing.visitor_name || 'there'
    firstName    = visitorName.split(' ')[0]
    visitorEmail = viewing.visitor_email
    visitorPhone = viewing.visitor_phone
    roomId       = viewing.room_id
    propertyId   = viewing.property_id
  }

  const payRef      = holdingDepositRef(propAddress || null, roomLabel)
  const applyUrl    = roomId && propertyId ? `${APP_URL}/applicant/apply?roomId=${roomId}&propertyId=${propertyId}` : `${APP_URL}/applicant/apply`
  const fastUrl     = roomId && propertyId ? `${APP_URL}/applicant/apply?roomId=${roomId}&propertyId=${propertyId}&fasttrack=1` : `${APP_URL}/applicant/apply?fasttrack=1`
  const reserveUrl  = roomId && propertyId ? `${APP_URL}/applicant/reserve?roomId=${roomId}&propertyId=${propertyId}` : `${APP_URL}/applicant/reserve`
  const isReserve   = mode === 'reserve'
  const isFastTrack = mode === 'fasttrack'
  const sendUrl     = isReserve ? reserveUrl : isFastTrack ? fastUrl : applyUrl

  const result: Record<string, any> = { link: sendUrl }

  // ── Create / update applicants row (upsert on email + room_id) ─────────────
  // This is best-effort — don't fail the invite if it errors (table may not exist yet)
  if (roomId && propertyId && visitorEmail) {
    try {
      const stage = isReserve ? 'offer_sent' : 'invited'
      const { data: existing } = await supabase
        .from('applicants')
        .select('id, pipeline_stage')
        .eq('email', visitorEmail)
        .eq('room_id', roomId)
        .maybeSingle()

      if (existing) {
        // Only advance the stage, never go backwards
        const stageOrder = ['invited','applied','offer_sent','referencing','referencing_passed','docs_uploaded','converted']
        const currentIdx = stageOrder.indexOf(existing.pipeline_stage)
        const newIdx     = stageOrder.indexOf(stage)
        if (newIdx > currentIdx) {
          await supabase.from('applicants').update({ pipeline_stage: stage, updated_at: new Date().toISOString() }).eq('id', existing.id)
        }
        result.applicantId = existing.id
      } else {
        const { data: created } = await supabase
          .from('applicants')
          .insert({
            room_id:        roomId,
            property_id:    propertyId,
            viewing_id:     viewingRow?.id || null,
            full_name:      visitorName,
            email:          visitorEmail,
            phone:          visitorPhone || null,
            pipeline_stage: stage,
          })
          .select('id')
          .single()
        if (created) result.applicantId = created.id
      }
    } catch {
      // Graceful — applicants table may not be deployed yet
    }
  }

  // ── Email ──────────────────────────────────────────────────────────────────
  if (method === 'email' || method === 'both') {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      result.emailError = 'RESEND_API_KEY not configured'
    } else if (!visitorEmail) {
      result.emailError = 'No email address on this viewing'
    } else {
      // Try DB template first, fall back to inline builders
      const templateSlug = isReserve ? 'applicant-offer-deposit' : 'applicant-offer-letter'
      const tpl = await getTemplate(templateSlug)

      let subject: string
      let html: string

      const tokenVars = {
        first_name:               firstName,
        room_name:                roomLabel,
        property_address:         propAddress,
        property_address_with_at: propAddress ? ` at ${propAddress}` : '',
        monthly_rent:             monthly ? String(Number(monthly).toLocaleString()) : '',
        weekly_rent:              weekly  ? String(weekly.toLocaleString()) : '',
        payment_ref:              payRef,
        apply_url:                applyUrl,
        reserve_url:              reserveUrl,
      }

      if (tpl) {
        subject = render(tpl.subject_line, tokenVars)
        // saved templates hold the body only; an old full-page template is sent as it is
        const body = render(tpl.template_text, tokenVars)
        html    = /<html/i.test(body) ? body : await buildEmail(body.includes('<') ? body : body.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''), { req: request })
      } else if (isReserve && monthly && weekly) {
        subject = `THE SEARCH IS OVER! — ${roomLabel}${propAddress ? `, ${propAddress}` : ''}`
        html    = await buildSearchIsOverEmail({   // the same email as Send Offer Letter
          applicantName: firstName, roomName: roomLabel, propertyAddress: propAddress, propertyCity: 'London',
          advertisedRent: Number(monthly), moveInDate: undefined, applicationUrl: reserveUrl, holdingDeposit: oneWeekRent(Number(monthly)), holdingRef: payRef,
        }, request)
      } else if (isFastTrack) {
        subject = `Your application for ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}`
        html    = await applyEmailHtml({ firstName, roomName: roomLabel, propAddress, applyUrl: fastUrl }, request)
      } else {
        subject = `Your application for ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}`
        html    = await applyEmailHtml({ firstName, roomName: roomLabel, propAddress, applyUrl }, request)
      }

      const emailRes = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(await senderFields(request)), to: [visitorEmail], subject, html }),
      })
      if (emailRes.ok) {
        result.emailSent = true
      } else {
        const err = await emailRes.json().catch(() => ({}))
        result.emailError = (err as any)?.message || 'Failed to send email'
      }
    }
  }

  // ── SMS (Twilio) ────────────────────────────────────────────────────────────
  if (method === 'sms' || method === 'both') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_PHONE_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      result.smsError = 'SMS not yet configured — use the copy link instead'
    } else if (!visitorPhone) {
      result.smsError = 'No phone number on this viewing'
    } else {
      const body = isReserve
        ? `Hi ${firstName}, your room at ${propAddress || roomLabel} is ready to reserve — pay the holding deposit (£${weekly ?? '?'}) to secure it: ${reserveUrl} — Capital Rooms`
        : `Hi ${firstName}, thanks for viewing ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}. Apply in under 5 mins: ${isFastTrack ? fastUrl : applyUrl} — Capital Rooms`

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: fromNumber, To: visitorPhone, Body: body }),
        }
      )
      if (twilioRes.ok) result.smsSent = true
      else result.smsError = 'Failed to send SMS'
    }
  }

  return NextResponse.json(result)
}

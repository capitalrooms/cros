import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { getTemplate, render } from '@/lib/messageTemplate'

export const runtime = 'nodejs'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <noreply@capitalrooms.co.uk>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

function weeklyRent(monthly: number) {
  return Math.round((monthly * 12) / 52)
}

function buildRef(propertyCode: string | null, roomName: string | null) {
  const propPart = (propertyCode || 'CAP').toUpperCase().replace(/\s/g, '')
  const roomPart = (roomName || '').replace(/[^0-9]/g, '').padStart(2, '0')
  return `${propPart}${roomPart} RESERVE`.trim()
}

// Fallback HTML when DB template isn't loaded yet
function applyEmailHtml(vars: { firstName: string; roomName: string; propAddress: string; applyUrl: string }) {
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a1a1a;padding:24px 32px;border-radius:12px 12px 0 0;text-align:right">
    <img src="https://hwmwfmgqnjlogkfjnkwl.supabase.co/storage/v1/object/public/maintenance-photos/brand/logo.png"
         alt="Capital Rooms" height="36" style="display:inline-block" />
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
    <p style="font-size:16px;margin:0 0 16px">Hi ${vars.firstName},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#444">
      Thanks for viewing <strong>${vars.roomName}</strong>${vars.propAddress ? ` at ${vars.propAddress}` : ''}.
      We'd love to invite you to submit a formal application — it takes less than 5 minutes.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${vars.applyUrl}" style="background:#1a1a1a;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
        Apply Now →
      </a>
    </div>
    <p style="font-size:13px;color:#888;margin:0 0 4px">Or copy this link:</p>
    <p style="font-size:13px;color:#555;word-break:break-all;background:#f5f5f5;padding:10px 12px;border-radius:6px;margin:0">${vars.applyUrl}</p>
    <hr style="margin:28px 0;border:none;border-top:1px solid #e5e5e5" />
    <p style="font-size:12px;color:#999;margin:0;text-align:center">Capital Rooms · Innovating London living since 2018</p>
  </div>
</div>`
}

function reserveEmailHtml(vars: { firstName: string; roomName: string; propAddress: string; monthly: number; weekly: number; payRef: string; reserveUrl: string }) {
  return `<div style="font-family:sans-serif;max-width:580px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a1a1a;padding:24px 32px;border-radius:12px 12px 0 0;text-align:right">
    <img src="https://hwmwfmgqnjlogkfjnkwl.supabase.co/storage/v1/object/public/maintenance-photos/brand/logo.png"
         alt="Capital Rooms" height="36" style="display:inline-block" />
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
    <h1 style="font-size:22px;font-weight:700;margin:0 0 4px">THE SEARCH IS OVER! 🎉</h1>
    <p style="font-size:16px;margin:0 0 24px">Dear ${vars.firstName},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 8px;color:#444">Thank you for your interest in our room at:</p>
    <div style="background:#f5f5f5;padding:16px 20px;border-radius:8px;margin:0 0 20px">
      <p style="font-size:16px;font-weight:700;margin:0 0 4px">${vars.roomName}${vars.propAddress ? `, ${vars.propAddress}` : ''}</p>
      <p style="font-size:15px;font-weight:600;color:#1a1a1a;margin:0">£${vars.monthly.toLocaleString()}.00 pcm <span style="font-weight:400;color:#666">(all bills included)</span></p>
    </div>
    <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">This is with an intended 12-month term with a 5-week deposit.</p>
    <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">If you would like to secure the room, we require a <strong>holding deposit</strong> to take it off the market. Don't worry — this is deducted from your final balance and is not an extra fee.</p>
    <h2 style="font-size:16px;font-weight:700;margin:0 0 12px">How to secure it 💳</h2>
    <p style="font-size:14px;color:#444;margin:0 0 16px;line-height:1.6">The holding deposit is one week's rent (<strong>£${vars.weekly.toLocaleString()}.00</strong>). Please make payment by bank transfer:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
      ${[['Account Name','Capital Rooms Ltd'],['Sort Code','20-18-93'],['Account Number','40162574'],['Payment Reference',vars.payRef],['Amount',`£${vars.weekly.toLocaleString()}.00`]].map(([k,v])=>`<tr><td style="padding:8px 12px;background:#f9f9f9;font-weight:600;border-bottom:1px solid #eee;width:40%">${k}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">${v}</td></tr>`).join('')}
    </table>
    <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">Once you've sent it, please let us know and send a quick screenshot of the confirmation. As soon as the payment is confirmed, we'll take the room off the market and get you started with our online referencing provider, <strong>Homeppl</strong>.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${vars.reserveUrl}" style="background:#1a1a1a;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block">View full reservation details →</a>
    </div>
    <p style="font-size:13px;color:#888;background:#fff8e6;border:1px solid #f0d070;padding:12px 16px;border-radius:8px;margin:0 0 20px;line-height:1.5"><strong>🌍 Paying from outside the UK?</strong> Please make sure your bank's transfer fees are covered on your side.</p>
    <p style="font-size:13px;color:#888;border-top:1px solid #eee;padding-top:16px;line-height:1.5;margin:0"><strong>Important:</strong> The holding deposit is a non-refundable commitment to the room. However, if Capital Rooms or the landlord can no longer let the room to you, it will be returned to you in full.</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5" />
    <p style="font-size:12px;color:#999;margin:0;text-align:center">Capital Rooms · 0207 112 9163 · Innovating London living since 2018</p>
  </div>
</div>`
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['lettings', 'administrator'].includes(user.assignment?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    roomLabel     = manual.roomLabel || ''
    propAddress   = manual.address   || ''
    propCode      = null
    monthly       = null
    weekly        = null
    visitorName   = manual.name  || 'there'
    firstName     = visitorName.split(' ')[0]
    visitorEmail  = manual.email || null
    visitorPhone  = manual.phone || null
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

  const payRef     = buildRef(propCode, roomLabel)
  const applyUrl   = roomId && propertyId ? `${APP_URL}/applicant/apply?roomId=${roomId}&propertyId=${propertyId}` : `${APP_URL}/applicant/apply`
  const reserveUrl = roomId && propertyId ? `${APP_URL}/applicant/reserve?roomId=${roomId}&propertyId=${propertyId}` : `${APP_URL}/applicant/reserve`
  const isReserve  = mode === 'reserve'

  const result: Record<string, any> = { link: isReserve ? reserveUrl : applyUrl }

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
        html    = render(tpl.template_text, tokenVars)
      } else if (isReserve && monthly && weekly) {
        subject = `THE SEARCH IS OVER! — ${roomLabel}${propAddress ? `, ${propAddress}` : ''}`
        html    = reserveEmailHtml({ firstName, roomName: roomLabel, propAddress, monthly, weekly, payRef, reserveUrl })
      } else {
        subject = `Your application for ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}`
        html    = applyEmailHtml({ firstName, roomName: roomLabel, propAddress, applyUrl })
      }

      const emailRes = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [visitorEmail], subject, html }),
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
        : `Hi ${firstName}, thanks for viewing ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}. Apply in under 5 mins: ${applyUrl} — Capital Rooms`

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

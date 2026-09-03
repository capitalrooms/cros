import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { emailHtml, FROM, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'

export const runtime = 'nodejs'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

const ACCOUNT_NAME = 'Capital Rooms Ltd'
const SORT_CODE = '20-18-93'
const ACCOUNT_NUMBER = '40162574'

function weeklyRent(monthly: number) {
  return Math.round((monthly * 12) / 52)
}

function buildRef(propertyCode: string | null, roomName: string | null) {
  const propPart = (propertyCode || 'CAP').toUpperCase().replace(/\s/g, '')
  const roomPart = (roomName || '').replace(/[^0-9]/g, '').padStart(2, '0')
  return `${propPart}${roomPart} RESERVE`.trim()
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

  if (manual) {
    // Manual entry — no viewing record
    roomLabel = manual.roomLabel || ''
    propAddress = manual.address || ''
    propCode = null
    monthly = null
    weekly = null
    visitorName = manual.name || 'there'
    firstName = visitorName.split(' ')[0]
    visitorEmail = manual.email || null
    visitorPhone = manual.phone || null
  } else {
    // Fetch viewing with room + property details
    const { data: viewing, error } = await supabase
      .from('viewings')
      .select('id, visitor_name, visitor_email, visitor_phone, room_id, property_id, viewing_date, viewing_slot, rooms(name, current_asking_rent), properties(name, address, property_code)')
      .eq('id', viewingId)
      .single()

    if (error || !viewing) {
      return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })
    }

    roomLabel = (viewing.rooms as any)?.name || 'Your room'
    const propName = (viewing.properties as any)?.name || ''
    propAddress = (viewing.properties as any)?.address || propName
    propCode = (viewing.properties as any)?.property_code || null
    monthly = (viewing.rooms as any)?.current_asking_rent || null
    weekly = monthly ? weeklyRent(monthly) : null
    visitorName = viewing.visitor_name || 'there'
    firstName = visitorName.split(' ')[0]
    visitorEmail = viewing.visitor_email
    visitorPhone = viewing.visitor_phone
    roomId = viewing.room_id
    propertyId = viewing.property_id
  }

  const payRef = buildRef(propCode, roomLabel)

  const applyUrl = roomId && propertyId
    ? `${APP_URL}/applicant/apply?roomId=${roomId}&propertyId=${propertyId}`
    : `${APP_URL}/applicant/apply`
  const reserveUrl = roomId && propertyId
    ? `${APP_URL}/applicant/reserve?roomId=${roomId}&propertyId=${propertyId}`
    : `${APP_URL}/applicant/reserve`

  // Always return the link so the UI can offer copy-to-clipboard
  const result: Record<string, any> = { link: mode === 'reserve' ? reserveUrl : applyUrl }

  // ── Email ──────────────────────────────────────────────────────────────────
  if (method === 'email' || method === 'both') {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      result.emailError = 'RESEND_API_KEY not configured'
    } else if (!viewing.visitor_email) {
      result.emailError = 'No email address on this viewing'
    } else {
      const isReserve = mode === 'reserve'
      const subject = isReserve
        ? `THE SEARCH IS OVER! — ${roomLabel}${propAddress ? `, ${propAddress}` : ''}`
        : `Your application for ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}`

      const html = isReserve ? `
        <div style="font-family:sans-serif;max-width:580px;margin:0 auto;color:#1a1a1a">
          <div style="background:#1a1a1a;padding:24px 32px;border-radius:12px 12px 0 0;text-align:right">
            <img src="https://hwmwfmgqnjlogkfjnkwl.supabase.co/storage/v1/object/public/maintenance-photos/brand/logo.png"
                 alt="Capital Rooms" height="36" style="display:inline-block" />
          </div>
          <div style="background:#ffffff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <h1 style="font-size:22px;font-weight:700;margin:0 0 4px">THE SEARCH IS OVER! 🎉</h1>
            <p style="font-size:16px;margin:0 0 24px">Dear ${firstName},</p>
            <p style="font-size:15px;line-height:1.6;margin:0 0 8px;color:#444">
              Thank you for your interest in our room at:
            </p>
            <div style="background:#f5f5f5;padding:16px 20px;border-radius:8px;margin:0 0 20px">
              <p style="font-size:16px;font-weight:700;margin:0 0 4px">${roomLabel}${propAddress ? `, ${propAddress}` : ''}</p>
              ${monthly ? `<p style="font-size:15px;font-weight:600;color:#1a1a1a;margin:0">£${Number(monthly).toLocaleString()}.00 pcm <span style="font-weight:400;color:#666">(all bills included)</span></p>` : ''}
            </div>
            <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">
              This is with an intended 12-month term with a 5-week deposit.
            </p>
            <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">
              If you would like to secure the room, we require a <strong>holding deposit</strong> to take it
              off the market. Don't worry — this is deducted from your final balance and is not an extra fee.
            </p>
            <h2 style="font-size:16px;font-weight:700;margin:0 0 12px">How to secure it 💳</h2>
            <p style="font-size:14px;color:#444;margin:0 0 16px;line-height:1.6">
              The holding deposit is one week's rent${weekly ? ` (<strong>£${weekly.toLocaleString()}.00</strong>)` : ''}.
              Please make payment by bank transfer:
            </p>
            <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
              ${[
                ['Account Name', ACCOUNT_NAME],
                ['Sort Code', SORT_CODE],
                ['Account Number', ACCOUNT_NUMBER],
                ['Payment Reference', payRef],
                weekly ? ['Amount', `£${weekly.toLocaleString()}.00`] : null,
              ].filter(Boolean).map(([k, v]) => `
                <tr>
                  <td style="padding:8px 12px;background:#f9f9f9;font-weight:600;border-bottom:1px solid #eee;width:40%">${k}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">${v}</td>
                </tr>
              `).join('')}
            </table>
            <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">
              Once you've sent it, please let us know and send a quick screenshot of the confirmation if you can.
              As soon as the payment is confirmed, we'll take the room off the market and get you started
              with our online referencing provider, <strong>Homeppl</strong>.
            </p>
            <div style="text-align:center;margin:24px 0">
              <a href="${reserveUrl}"
                 style="background:#1a1a1a;color:#ffffff;padding:14px 32px;border-radius:8px;
                        text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
                View full reservation details →
              </a>
            </div>
            <p style="font-size:13px;color:#888;background:#fff8e6;border:1px solid #f0d070;padding:12px 16px;border-radius:8px;margin:0 0 20px;line-height:1.5">
              <strong>🌍 Paying from outside the UK?</strong> Please make sure your bank's transfer fees are covered on your side.
            </p>
            <p style="font-size:13px;color:#888;border-top:1px solid #eee;padding-top:16px;line-height:1.5;margin:0">
              <strong>Important:</strong> The holding deposit is a non-refundable commitment to the room.
              However, if Capital Rooms or the landlord can no longer let the room to you, it will be returned to you in full.
            </p>
            <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5" />
            <p style="font-size:12px;color:#999;margin:0;text-align:center">
              Capital Rooms · 0207 112 9163 · Innovating London living since 2018
            </p>
          </div>
        </div>
      ` : `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
          <div style="background:#1a1a1a;padding:24px 32px;border-radius:12px 12px 0 0;text-align:right">
            <img src="https://hwmwfmgqnjlogkfjnkwl.supabase.co/storage/v1/object/public/maintenance-photos/brand/logo.png"
                 alt="Capital Rooms" height="36" style="display:inline-block" />
          </div>
          <div style="background:#ffffff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <p style="font-size:16px;margin:0 0 16px">Hi ${firstName},</p>
            <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#444">
              Thanks for viewing <strong>${roomLabel}</strong>${propAddress ? ` at ${propAddress}` : ''}.
              We'd love to invite you to submit a formal application — it takes less than 5 minutes.
            </p>
            <div style="text-align:center;margin:28px 0">
              <a href="${applyUrl}"
                 style="background:#1a1a1a;color:#ffffff;padding:14px 32px;border-radius:8px;
                        text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
                Apply Now →
              </a>
            </div>
            <p style="font-size:13px;color:#888;margin:0 0 4px">Or copy this link:</p>
            <p style="font-size:13px;color:#555;word-break:break-all;background:#f5f5f5;
                      padding:10px 12px;border-radius:6px;margin:0">${applyUrl}</p>
            <hr style="margin:28px 0;border:none;border-top:1px solid #e5e5e5" />
            <p style="font-size:12px;color:#999;margin:0;text-align:center">
              Capital Rooms · Innovating London living since 2018
            </p>
          </div>
        </div>
      `

      const emailRes = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: FROM, to: [viewing.visitor_email], subject, html }),
      })

      if (emailRes.ok) {
        result.emailSent = true
      } else {
        const err = await emailRes.json()
        result.emailError = err?.message || 'Failed to send email'
      }
    }
  }

  // ── SMS (Twilio) ────────────────────────────────────────────────────────────
  if (method === 'sms' || method === 'both') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_PHONE_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      result.smsError = 'SMS not yet configured — use the copy link instead'
    } else if (!viewing.visitor_phone) {
      result.smsError = 'No phone number on this viewing'
    } else {
      const body = `Hi ${firstName}, thanks for viewing ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}. Apply in under 5 mins: ${applyUrl} — Capital Rooms`
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: fromNumber, To: viewing.visitor_phone, Body: body }),
        }
      )
      if (twilioRes.ok) {
        result.smsSent = true
      } else {
        result.smsError = 'Failed to send SMS'
      }
    }
  }

  return NextResponse.json(result)
}

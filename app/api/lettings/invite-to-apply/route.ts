import { NextRequest, NextResponse } from 'next/server'
import { sendSms, smsConfigured } from '@/lib/sms'
import { deliverEmail } from '@/lib/sendEmail'
import { personFromText } from '@/lib/people'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { getTemplate, render } from '@/lib/messageTemplate'
import { buildEmail } from '@/lib/emailWrapper'

import { holdingDepositRef } from '@/lib/offers/holdingRef'
import { buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { oneWeekRent } from '@/lib/tenancy/deposit'
import { isWholeLet, oneLine, placeLabel } from '@/lib/lettings/letWording'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

export const runtime = 'nodejs'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

function weeklyRent(monthly: number) {
  return Math.round((monthly * 12) / 52)
}


// Fallback HTML when DB template isn't loaded yet — body content only, wrapper applied via buildEmail
async function applyEmailHtml(vars: { firstName: string; roomName: string; propAddress: string; applyUrl: string; whole?: boolean }, req: Request): Promise<string> {
  return buildEmail(`
<p style="font-size:16px;margin:0 0 16px">Hi ${vars.firstName},</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#444">
  Thanks for viewing ${vars.whole ? `<strong>${vars.propAddress || 'the property'}</strong>` : `<strong>${vars.roomName}</strong>${vars.propAddress ? ` at ${vars.propAddress}` : ''}`}.
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


// GET — what the Invite to Apply page offers: recent viewings, every property and its rooms. Served from here (the
// page used to read the database itself, and on a phone whose sign-in was still waking up it got nothing back — an
// empty property list, so no invite could be sent; 14 Oct 2026). Addresses come back on one line.
export async function GET(request: NextRequest) {
  if (!(await requireStaff(request))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
  const [v, p, r] = await Promise.all([
    supabase.from('viewings')
      .select('id, visitor_name, visitor_email, visitor_phone, viewing_date, viewing_slot, room_id, property_id, rooms(name, is_let_only), properties(name, address, property_type)')
      .gte('viewing_date', since).order('viewing_date', { ascending: false }),
    supabase.from('properties').select('id, name, address, property_type, is_demo'),
    supabase.from('rooms').select('id, name, property_id, is_let_only, current_asking_rent').order('name'),
  ])
  const err = v.error || p.error || r.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  const viewings = (v.data ?? []).map((x: any) => ({ ...x, properties: x.properties ? { ...x.properties, name: oneLine(x.properties.name), address: oneLine(x.properties.address), whole: isWholeLet(x.properties.property_type, x.rooms?.name) } : null }))
  const properties = sortPropertiesNumerically(((p.data ?? []) as any[]).filter(x => !x.is_demo).map(x => ({ id: x.id, name: oneLine(x.name), address: oneLine(x.address), whole: isWholeLet(x.property_type) })))
  return NextResponse.json({ viewings, properties, rooms: r.data ?? [] })
}

export async function POST(request: NextRequest) {
  // a real office sign-in (audit 12 Oct 2026: it only checked that some "Bearer …" header was present, so anyone
  // could send invites by email and text from CROS)
  if (!(await requireStaff(request))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

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
  let whole = false

  if (manual) {
    // the page sends title / first / surname (manual.name was always empty, so emails said "Hi there")
    visitorName  = manual.name || [manual.salutation, manual.first_name, manual.last_name].filter(Boolean).join(' ') || 'there'
    firstName    = String(manual.first_name || '').trim() || visitorName.replace(/^(mr|mrs|ms|miss|mx|dr|prof|rev)\.?\s+/i, '').split(' ')[0]   // "Hi Harry", not "Hi Mr"
    visitorEmail = manual.email || null
    visitorPhone = manual.phone || null

    // If a real room_id was supplied, look it up for accurate room/property details
    if (manual.room_id) {
      roomId     = manual.room_id
      propertyId = manual.property_id || null
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('id, name, current_asking_rent, property_id, properties(name, address, property_code, property_type)')
        .eq('id', manual.room_id)
        .single()
      if (roomRow) {
        roomLabel  = roomRow.name || ''
        const prop = (roomRow.properties as any)
        propAddress = oneLine(prop?.address || prop?.name)
        propCode    = prop?.property_code || null
        whole       = isWholeLet(prop?.property_type, roomRow.name)
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
      .select('id, visitor_name, visitor_email, visitor_phone, room_id, property_id, viewing_date, viewing_slot, rooms(name, current_asking_rent), properties(name, address, property_code, property_type)')
      .eq('id', viewingId)
      .single()

    if (error || !viewing) {
      return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })
    }

    viewingRow   = viewing
    roomLabel    = (viewing.rooms as any)?.name || 'Your room'
    const propName = (viewing.properties as any)?.name || ''
    propAddress  = oneLine((viewing.properties as any)?.address || propName)
    whole        = isWholeLet((viewing.properties as any)?.property_type, (viewing.rooms as any)?.name)
    propCode     = (viewing.properties as any)?.property_code || null
    monthly      = (viewing.rooms as any)?.current_asking_rent || null
    weekly       = monthly ? weeklyRent(monthly) : null
    visitorName  = viewing.visitor_name || 'there'
    firstName    = visitorName.replace(/^(mr|mrs|ms|miss|mx|dr|prof|rev)\.?\s+/i, '').split(' ')[0]   // "Hi Harry", not "Hi Mr"
    visitorEmail = viewing.visitor_email
    visitorPhone = viewing.visitor_phone
    roomId       = viewing.room_id
    propertyId   = viewing.property_id
  }

  // the application page needs the room and property — never send a link it can't open
  if (!roomId || !propertyId) {
    return NextResponse.json({ error: manual ? 'Pick the room for this invite.' : 'This viewing has no room recorded — set the room on the viewing (or use “Other” and pick it), then send.' }, { status: 400 })
  }

  const payRef      = holdingDepositRef(propAddress || null, roomLabel)
  // first name for the page's greeting ("Hi Harry, ready to lock it down?") — never a title, never "there"
  const greetName   = String(visitorName || firstName || '').trim().replace(/^(mr|mrs|ms|miss|mx|dr|prof|rev)\.?\s+/i, '').split(/\s+/)[0] ?? ''
  const nameQ       = greetName && greetName.toLowerCase() !== 'there' ? `&name=${encodeURIComponent(greetName)}` : ''
  let applyUrl    = roomId && propertyId ? `${APP_URL}/applicant/apply?roomId=${roomId}&propertyId=${propertyId}${nameQ}` : `${APP_URL}/applicant/apply`
  let fastUrl     = roomId && propertyId ? `${APP_URL}/applicant/apply?roomId=${roomId}&propertyId=${propertyId}&fasttrack=1${nameQ}` : `${APP_URL}/applicant/apply?fasttrack=1`
  let reserveUrl  = roomId && propertyId ? `${APP_URL}/applicant/reserve?roomId=${roomId}&propertyId=${propertyId}${nameQ}` : `${APP_URL}/applicant/reserve`
  const isReserve   = mode === 'reserve'
  const isFastTrack = mode === 'fasttrack'
  let sendUrl       = isReserve ? reserveUrl : isFastTrack ? fastUrl : applyUrl

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
            ...(manual?.first_name ? { salutation: String(manual.salutation || '').slice(0, 10) || null, first_name: String(manual.first_name).slice(0, 80), last_name: String(manual.last_name || '').slice(0, 80) || null } : {}),
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

  // the links name the application, so the form and reserve page show the rent agreed with them
  if (result.applicantId) {
    const aq = `&a=${result.applicantId}`
    applyUrl += aq; fastUrl += aq; reserveUrl += aq
    sendUrl = isReserve ? reserveUrl : isFastTrack ? fastUrl : applyUrl
    result.link = sendUrl
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
      // a whole house or flat never gets the room wording: its own saved template ("…-whole") if there is one,
      // otherwise the built-in emails with property words (lib/lettings/letWording)
      const templateSlug = (isReserve ? 'applicant-offer-deposit' : 'applicant-offer-letter') + (whole ? '-whole' : '')
      const tpl = await getTemplate(templateSlug)
      const place = placeLabel(whole, roomLabel, propAddress)

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
        subject = render(tpl.subject_line, tokenVars, visitorName !== 'there' ? personFromText(visitorName) : null)
        // saved templates hold the body only; an old full-page template is sent as it is
        const body = render(tpl.template_text, tokenVars, visitorName !== 'there' ? personFromText(visitorName) : null)
        html    = /<html/i.test(body) ? body : await buildEmail(body.includes('<') ? body : body.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''), { req: request })
      } else if (isReserve && monthly && weekly) {
        subject = `THE SEARCH IS OVER! — ${place}`
        html    = await buildSearchIsOverEmail({   // the same email as Send Offer Letter
          applicantName: firstName, roomName: roomLabel, propertyAddress: propAddress, propertyCity: 'London',
          advertisedRent: Number(monthly), moveInDate: undefined, applicationUrl: reserveUrl, holdingDeposit: oneWeekRent(Number(monthly)), holdingRef: payRef, whole,
        }, request)
      } else if (isFastTrack) {
        subject = whole ? `Your application for ${place}` : `Your application for ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}`
        html    = await applyEmailHtml({ firstName, roomName: roomLabel, propAddress, applyUrl: fastUrl, whole }, request)
      } else {
        subject = whole ? `Your application for ${place}` : `Your application for ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}`
        html    = await applyEmailHtml({ firstName, roomName: roomLabel, propAddress, applyUrl, whole }, request)
      }

      const emailRes = await deliverEmail({ to: [visitorEmail], subject: oneLine(subject), html }, { req: request })
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
    // lib/sms — the right sender number (this used TWILIO_PHONE_NUMBER, which the text service rejects), +44 numbers,
    // and the office is told if it fails
    if (!smsConfigured()) {
      result.smsError = 'SMS not yet configured — use the copy link instead'
    } else if (!visitorPhone) {
      result.smsError = 'No phone number on this viewing'
    } else {
      const body = isReserve
        ? `Hi ${firstName}, ${whole ? `${propAddress || 'the property'} is` : `your room at ${propAddress || roomLabel} is`} ready to reserve — pay the holding deposit (£${weekly ?? '?'}) to secure it: ${reserveUrl} — Capital Rooms`
        : `Hi ${firstName}, thanks for viewing ${placeLabel(whole, roomLabel, propAddress) || 'the property'}. Apply in under 5 mins: ${isFastTrack ? fastUrl : applyUrl} — Capital Rooms`

      const sent = await sendSms(visitorPhone, body)
      if (sent.ok) result.smsSent = true
      else result.smsError = `The text didn’t send: ${sent.error}`
    }
  }

  return NextResponse.json(result)
}

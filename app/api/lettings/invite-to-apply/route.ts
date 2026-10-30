import { NextRequest, NextResponse } from 'next/server'
import { sendSms, smsConfigured } from '@/lib/sms'
import { deliverEmail } from '@/lib/sendEmail'
import { personFromText } from '@/lib/people'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { getTemplate, render } from '@/lib/messageTemplate'
import { buildEmail } from '@/lib/emailWrapper'
import { findApplicant, moveToRoom, normEmail } from '@/lib/lettings/applicantRecord'
import { draftReserve, pinReserve, cleanRent } from '@/lib/lettings/reserveEmail'

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
  <a href="${vars.applyUrl}" style="background:#1b1a18;color:#ffffff;padding:14px 32px;border-radius:24px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
    Apply now
  </a>
</div>
`, { req })
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

  const reqBody = await request.json()
  const { viewingId, method, mode = 'apply' } = reqBody
  let { manual } = reqBody
  // 23 Oct 2026: one panel sends from Invite to apply AND from an applicant's own record (components/InviteApplicant),
  // with a preview first and the rent you confirm. applicantId = start from their record.
  const preview = reqBody.preview === true
  const typedRent = cleanRent(reqBody.rent)
  if (reqBody.applicantId) {
    const { data: ap } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .from('applicants').select('full_name, salutation, first_name, last_name, email, phone, room_id, property_id').eq('id', reqBody.applicantId).maybeSingle()
    if (!ap) return NextResponse.json({ error: 'Applicant not found' }, { status: 404 })
    manual = { name: (ap as any).full_name, salutation: (ap as any).salutation, first_name: (ap as any).first_name, last_name: (ap as any).last_name, email: (ap as any).email, phone: (ap as any).phone, room_id: (ap as any).room_id, property_id: (ap as any).property_id }
  }
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

  // the rent you confirmed on the screen beats the advert (the asking rent is only the starting suggestion)
  const askingRent = monthly
  if (typedRent) { monthly = typedRent; weekly = weeklyRent(typedRent) }

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
  if (preview) {
    // nothing is saved for a preview — just whether they already have a record
    const ex = visitorEmail ? await findApplicant(supabase, visitorEmail) : null
    if (ex) result.applicantId = ex.id
  } else if (roomId && propertyId && visitorEmail) {
    try {
      const stage = isReserve ? 'offer_sent' : 'invited'
      // one applicant per email (lib/lettings/applicantRecord) — the same person invited to another room keeps one record
      const existing = await findApplicant(supabase, visitorEmail)
      if (existing) await moveToRoom(supabase, existing, roomId, propertyId)

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
            email:          normEmail(visitorEmail),
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

  // ── The email and the text: built the same way for a preview and for sending ─────────────
  const place = placeLabel(whole, roomLabel, propAddress)
  let subject = '', html = '', smsBody = ''
  // Reserve only: the one reserve email (lib/lettings/reserveEmail) — the same one Applicants → Reserve sends
  const reserveDraft = isReserve && result.applicantId ? await draftReserve(supabase, result.applicantId, typedRent ?? monthly, request) : null
  if (reserveDraft && !('error' in reserveDraft)) {
    subject = reserveDraft.subject; html = reserveDraft.html; smsBody = reserveDraft.sms
    monthly = reserveDraft.rent; weekly = reserveDraft.deposit
    result.pinned = reserveDraft.pinned; result.earlier = reserveDraft.earlier
  } else if (isReserve) {
    if (monthly && weekly) {
      subject = `Your offer has been accepted — secure ${whole ? 'the property' : roomLabel || 'the room'} now`
      html = await buildSearchIsOverEmail({
        applicantName: firstName, roomName: roomLabel, propertyAddress: propAddress, propertyCity: 'London',
        advertisedRent: Number(monthly), applicationUrl: reserveUrl, holdingDeposit: oneWeekRent(Number(monthly)), holdingRef: payRef, whole,
      }, request)
    }
    smsBody = `Hi ${firstName}, ${whole ? `${propAddress || 'the property'} is` : `your room at ${propAddress || roomLabel} is`} ready to reserve — pay the holding deposit (£${weekly ?? '?'}) to secure it: ${reserveUrl} — Capital Rooms`
  } else {
    // Make an offer / Fast-track: the application form (a saved template wins when there is one)
    const tpl = await getTemplate('applicant-offer-letter' + (whole ? '-whole' : ''))
    const tokenVars = {
      first_name: firstName, room_name: roomLabel, property_address: propAddress, property_address_with_at: propAddress ? ` at ${propAddress}` : '',
      monthly_rent: monthly ? String(Number(monthly).toLocaleString()) : '', weekly_rent: weekly ? String(weekly.toLocaleString()) : '',
      payment_ref: payRef, apply_url: isFastTrack ? fastUrl : applyUrl, reserve_url: reserveUrl,
    }
    if (tpl) {
      subject = render(tpl.subject_line, tokenVars, visitorName !== 'there' ? personFromText(visitorName) : null)
      const b = render(tpl.template_text, tokenVars, visitorName !== 'there' ? personFromText(visitorName) : null)
      html = /<html/i.test(b) ? b : await buildEmail(b.includes('<') ? b : b.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''), { req: request })
    } else {
      subject = whole ? `Your application for ${place}` : `Your application for ${roomLabel}${propAddress ? ` at ${propAddress}` : ''}`
      html = await applyEmailHtml({ firstName, roomName: roomLabel, propAddress, applyUrl: isFastTrack ? fastUrl : applyUrl, whole }, request)
    }
    smsBody = `Hi ${firstName}, thanks for viewing ${place || 'the property'}. Apply in under 5 mins: ${isFastTrack ? fastUrl : applyUrl} — Capital Rooms`
  }
  subject = oneLine(subject)

  // colleagues who can be copied in (office staff on a capitalrooms.co.uk address) — 23 Oct 2026
  const { data: officeRows } = await supabase.from('people').select('first_name, last_name, email, role').in('role', ['administrator', 'admin', 'lettings']).ilike('email', '%@capitalrooms.co.uk').not('email', 'ilike', '%+%')
  const office = ((officeRows ?? []) as any[]).map(o => ({ name: [o.first_name, o.last_name].filter(Boolean).join(' ') || o.email.split('@')[0], email: String(o.email).toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const cc = (Array.isArray(reqBody.cc) ? reqBody.cc : []).map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => office.some(o => o.email === e) && e !== String(visitorEmail ?? '').toLowerCase())

  if (preview) {
    return NextResponse.json({ preview: true, office, to: visitorEmail, phone: visitorPhone, subject, html, sms: smsBody, rent: monthly, deposit: weekly, asking: askingRent, pinned: result.pinned ?? null, earlier: result.earlier ?? null, existingApplicant: !!result.applicantId })
  }
  if (isReserve && !monthly) return NextResponse.json({ ...result, error: 'Enter the monthly rent that’s been agreed — the holding deposit is one week of it.' }, { status: 400 })

  // ── Email ──────────────────────────────────────────────────────────────────
  if (method === 'email' || method === 'both') {
    if (!process.env.RESEND_API_KEY) result.emailError = 'RESEND_API_KEY not configured'
    else if (!visitorEmail) result.emailError = 'No email address recorded'
    else {
      const emailRes = await deliverEmail({ to: [visitorEmail], ...(cc.length ? { cc } : {}), subject, html }, { req: request })
      if (emailRes.ok) { result.emailSent = true; result.cc = cc }
      else { const err = await emailRes.json().catch(() => ({})); result.emailError = (err as any)?.message || 'Failed to send email' }
    }
  }

  // ── SMS (Twilio) ── lib/sms: the right sender number, +44 numbers, the office told if it fails
  if (method === 'sms' || method === 'both') {
    if (!smsConfigured()) result.smsError = 'SMS not yet configured — use the copy link instead'
    else if (!visitorPhone) result.smsError = 'No phone number recorded'
    else {
      const sent = await sendSms(visitorPhone, smsBody)
      if (sent.ok) result.smsSent = true
      else result.smsError = `The text didn’t send: ${sent.error}`
    }
  }

  // reserve: the rent quoted is pinned on their offer (the reserve page and the holding deposit use it)
  if (isReserve && result.applicantId && monthly && (result.emailSent || result.smsSent)) await pinReserve(supabase, result.applicantId, Number(monthly))
  // fast-track with a rent you changed: pinned too, so the deposit step after their form uses it (stage unchanged)
  else if (isFastTrack && typedRent && typedRent !== askingRent && result.applicantId && (result.emailSent || result.smsSent)) await pinReserve(supabase, result.applicantId, typedRent, { stage: false })
  result.rent = monthly

  return NextResponse.json(result)
}

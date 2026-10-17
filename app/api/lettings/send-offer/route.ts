import { createServiceClient } from '@/lib/supabase'
import { deliverEmail } from '@/lib/sendEmail'
import { hiName, personFromText } from '@/lib/people'
import { getCurrentUser } from '@/lib/serverAuth'
import { buildOfferLetterEmail, buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { getTemplate, render } from '@/lib/messageTemplate'
import { randomBytes } from 'crypto'

import { holdingDepositRef } from '@/lib/offers/holdingRef'
import { oneWeekRent } from '@/lib/tenancy/deposit'
import { buildEmail } from '@/lib/emailWrapper'
import { isWholeLet, oneLine, placeLabel } from '@/lib/lettings/letWording'


// saved message templates hold the body only — give them the house email (an old full-page one is sent as is)
async function wrapTemplate(body: string, req: Request) {
  if (/<html/i.test(body)) return body
  return buildEmail(body.includes('<') ? body : body.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''), { req })
}

const weeklyRent = (monthly: number) => oneWeekRent(monthly)   // monthly × 12 ÷ 52, to the penny


export async function POST(request: Request) {
  // Auth guard — service client bypasses RLS so we enforce permissions here
  const user = await getCurrentUser()
  const role = (user?.assignment as any)?.role || ''
  if (!user || !['administrator', 'admin', 'lettings'].includes(role)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  try {
    const data = await request.json()

    if (!data.applicantEmail) {
      return Response.json({ error: 'Missing required field: applicantEmail' }, { status: 400 })
    }

    // Every offer names a real room: the application page can't open without one (an offer typed in by hand for an
    // unlisted property sent a link that said "This link isn't complete" — 12 Oct 2026). Add the property as a
    // let-only room first. The old hand-typed branch below is kept but never reached.
    if (data.customMode || !data.roomId || !data.propertyId) {
      return Response.json({ error: 'Pick the room first. If the property isn’t in CROS yet, add it as a let-only room, then send the offer.' }, { status: 400 })
    }

    // ── Custom / unlisted property mode (retired) ────────────────────────────
    if (data.customMode) {
      const monthly = data.advertisedRent || 0
      const weekly  = weeklyRent(monthly)
      const roomName    = data.customRoomDesc || 'Room'
      const propAddress = data.customAddress  || ''
      const firstName   = hiName(personFromText(data.applicantName))
      const moveInDisplay = data.moveInDate || 'To be confirmed'
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
      const applicationUrl = `${appUrl}/applicant/apply?email=${encodeURIComponent(data.applicantEmail)}`

      const templateSlug = data.requestDeposit ? 'applicant-offer-deposit' : 'applicant-offer-letter'
      const tpl = await getTemplate(templateSlug)
      let subject: string; let emailHtml: string

      if (tpl) {
        const tokenVars = {
          first_name: firstName, room_name: roomName, property_address: propAddress,
          property_address_with_at: propAddress ? ` at ${propAddress}` : '',
          monthly_rent: String(monthly.toLocaleString()), weekly_rent: String(weekly.toLocaleString()),
          payment_ref: holdingDepositRef(null, null, data.applicantName), apply_url: applicationUrl, reserve_url: applicationUrl,
        }
        subject   = render(tpl.subject_line, tokenVars, data.applicantName ? personFromText(data.applicantName) : null)
        emailHtml = await wrapTemplate(render(tpl.template_text, tokenVars, data.applicantName ? personFromText(data.applicantName) : null), request)
      } else if (data.requestDeposit) {
        subject = `The search is over — ${roomName}${propAddress ? `, ${propAddress}` : ''}`
        emailHtml = await buildSearchIsOverEmail({
          applicantName: data.applicantName, roomName, propertyAddress: propAddress,
          propertyCity: 'London', advertisedRent: monthly, moveInDate: moveInDisplay,
          applicationUrl, holdingDeposit: weekly, holdingRef: holdingDepositRef(null, null, data.applicantName),
        }, request)
      } else {
        subject = `Your application for ${roomName}${propAddress ? ` at ${propAddress}` : ''}`
        emailHtml = await buildOfferLetterEmail({
          applicantName: data.applicantName, roomName, propertyAddress: propAddress,
          propertyCity: 'London', advertisedRent: monthly, moveInDate: moveInDisplay,
          applicationUrl, holdingDeposit: weekly, holdingRef: holdingDepositRef(null, null, data.applicantName),
        }, request)
      }

      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) return Response.json({ error: 'Email service not configured' }, { status: 500 })
      const emailRes = await deliverEmail({ to: [data.applicantEmail], subject, html: emailHtml }, { req: request })
      if (!emailRes.ok) {
        const err = await emailRes.json().catch(() => ({}))
        return Response.json({ error: `Email failed: ${(err as any)?.message || emailRes.statusText}` }, { status: 502 })
      }
      return Response.json({ success: true, message: `Offer sent to ${data.applicantEmail}` }, { status: 201 })
    }

    // ── Standard mode — room must be in the system ────────────────────────────
    if (!data.roomId || !data.propertyId) {
      return Response.json({ error: 'Missing required fields: roomId, propertyId' }, { status: 400 })
    }

    const { data: roomData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, properties(property_code, property_type)')
      .eq('id', data.roomId)
      .single()

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, name, address')
      .eq('id', data.propertyId)
      .single()

    // the form sends title / first name / surname; applicantName was always empty, so emails said "Hi there"
    if (!data.applicantName) data.applicantName = [data.salutation, data.firstName, data.lastName].filter(Boolean).join(' ').trim() || ''
    const applicationToken = randomBytes(32).toString('hex')
    const tokenExpiresAt = new Date()
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30)

    // Create offer record
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .insert({
        room_id:           data.roomId,
        property_id:       data.propertyId,
        applicant_email:   data.applicantEmail,
        applicant_name:    data.applicantName || null,
        advertised_rent:   data.advertisedRent || null,
        move_in_date:      data.moveInDate || null,
        request_deposit:   data.requestDeposit || false,
        application_token: applicationToken,
        token_expires_at:  tokenExpiresAt.toISOString(),
        sent_by:           data.userId || null,
      })
      .select()

    if (offerError) {
      console.error('Error creating offer:', offerError)
      if (offerError.code === 'PGRST301' || offerError.code === '42501') {
        return Response.json({ error: 'Unauthorized - insufficient permissions' }, { status: 403 })
      }
      return Response.json({ error: 'Failed to create offer' }, { status: 500 })
    }

    const offerId = offer?.[0]?.id
    let applicantId: string | null = null
    let previousStage: string | null = null   // put back if the email fails, so they aren't stuck at "offer sent"
    let offered: { term: string | null; moveIn: string | null } = { term: null, moveIn: null }   // what they put on their application

    // Upsert applicants row linked to this offer (best-effort, table may not be deployed yet)
    try {
      const { data: existing } = await supabase
        .from('applicants')
        .select('id, pipeline_stage, preferred_term, preferred_start_date')
        .eq('email', data.applicantEmail)
        .eq('room_id', data.roomId)
        .maybeSingle()

      const newStage = data.requestDeposit ? 'offer_sent' : 'offer_sent'
      if (existing) {
        applicantId = existing.id
        previousStage = existing.pipeline_stage ?? null
        offered = { term: (existing as any).preferred_term ?? null, moveIn: (existing as any).preferred_start_date ?? null }
        await supabase.from('applicants').update({
          offer_id:       offerId,
          pipeline_stage: newStage,
          updated_at:     new Date().toISOString(),
        }).eq('id', existing.id)
        // Link offer back to applicant
        if (offerId) await supabase.from('offers').update({ applicant_id: existing.id }).eq('id', offerId)
      } else {
        const { data: created } = await supabase
          .from('applicants')
          .insert({
            room_id:        data.roomId,
            property_id:    data.propertyId,
            full_name:      data.applicantName || data.applicantEmail,
            ...(data.firstName ? { salutation: String(data.salutation || '').slice(0, 10) || null, first_name: String(data.firstName).slice(0, 80), last_name: String(data.lastName || '').slice(0, 80) || null } : {}),
            email:          data.applicantEmail,
            pipeline_stage: newStage,
            offer_id:       offerId,
          })
          .select('id')
          .single()
        applicantId = created?.id ?? null
        if (created && offerId) {
          await supabase.from('offers').update({ applicant_id: created.id }).eq('id', offerId)
        }
      }
    } catch {
      // Graceful — applicants table may not be deployed yet
    }

    // Build application URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
    // &a= lets the form show the rent agreed on this offer (a whole home often has no asking rent saved)
    const applicationUrl = `${appUrl}/applicant/apply?token=${applicationToken}&roomId=${data.roomId}&propertyId=${data.propertyId}${applicantId ? `&a=${applicantId}` : ''}`

    // Computed values for template tokens
    const monthly        = data.advertisedRent || 0
    const weekly         = weeklyRent(monthly)
    const propCode       = (roomData?.properties as any)?.property_code || null
    const roomName       = roomData?.name || 'Room'
    const propAddress    = oneLine(propertyData?.address || propertyData?.name)   // some addresses are saved on several lines
    // a whole house or flat: the same offer, property words (lib/lettings/letWording) — never the room template
    const whole          = isWholeLet((roomData?.properties as any)?.property_type, roomName)
    const place          = placeLabel(whole, roomName, propAddress)
    const payRef         = holdingDepositRef(propertyData?.name || propertyData?.address, roomName)
    const firstName      = String(data.firstName || '').trim() || (data.applicantName ? data.applicantName.replace(/^(mr|mrs|ms|miss|mx|dr|prof|rev)\.?\s+/i, '').split(' ')[0] : 'there')
    const moveInDisplay  = data.moveInDate || offered.moveIn || null   // the email leaves it out when nobody has said

    // Try DB template first; fall back to lib/emailTemplates.ts builders
    const templateSlug = (data.requestDeposit ? 'applicant-offer-deposit' : 'applicant-offer-letter') + (whole ? '-whole' : '')
    const tpl = await getTemplate(templateSlug)

    let subject: string
    let emailHtml: string

    if (tpl) {
      const tokenVars = {
        first_name:               firstName,
        room_name:                roomName,
        property_address:         propAddress,
        property_address_with_at: propAddress ? ` at ${propAddress}` : '',
        monthly_rent:             String(monthly.toLocaleString()),
        weekly_rent:              String(weekly.toLocaleString()),
        payment_ref:              payRef,
        apply_url:                applicationUrl,
        reserve_url:              `${appUrl}/applicant/reserve?roomId=${data.roomId}&propertyId=${data.propertyId}${applicantId ? `&a=${applicantId}` : ''}`,
      }
      subject   = render(tpl.subject_line, tokenVars, data.applicantName ? personFromText(data.applicantName) : null)
      emailHtml = await wrapTemplate(render(tpl.template_text, tokenVars, data.applicantName ? personFromText(data.applicantName) : null), request)
    } else if (data.requestDeposit) {
      subject = `The search is over — ${place}`
      emailHtml = await buildSearchIsOverEmail({
        applicantName:   firstName === 'there' ? undefined : firstName,
        roomName,
        propertyAddress: propAddress,
        propertyCity:    'London',
        advertisedRent:  monthly,
        moveInDate:      moveInDisplay,
        term:            offered.term,
        applicationUrl,
        holdingDeposit:  weekly,
        holdingRef:      payRef,
        whole,
      }, request)
    } else {
      subject = whole ? `Your application for ${place}` : `Your application for ${roomName}${propAddress ? ` at ${propAddress}` : ''}`
      emailHtml = await buildOfferLetterEmail({
        applicantName:   firstName === 'there' ? undefined : firstName,
        roomName,
        propertyAddress: propAddress,
        propertyCity:    'London',
        advertisedRent:  monthly,
        moveInDate:      moveInDisplay,
        term:            offered.term,
        applicationUrl,
        holdingDeposit:  weekly,
        holdingRef:      payRef,
        whole,
      }, request)
    }

    // Send via Resend
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'Email service not configured (RESEND_API_KEY missing)' }, { status: 500 })
    }

    const emailRes = await deliverEmail({ to: [data.applicantEmail], subject: oneLine(subject), html: emailHtml }, { req: request })

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}))
      // nothing went out — don't leave an "offer sent" behind (the applicant stays, ready for the next try)
      if (offerId) {
        await supabase.from('applicants').update({ offer_id: null, ...(previousStage ? { pipeline_stage: previousStage } : {}) }).eq('offer_id', offerId)
        await supabase.from('offers').delete().eq('id', offerId)
      }
      return Response.json({ error: `Email failed to send: ${(err as any)?.message || emailRes.statusText}` }, { status: 502 })
    }

    return Response.json({ success: true, offerId, applicationUrl, message: `Offer sent to ${data.applicantEmail}` }, { status: 201 })
  } catch (err) {
    console.error('Error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { createServiceClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { buildOfferLetterEmail, buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { getTemplate, render } from '@/lib/messageTemplate'
import { randomBytes } from 'crypto'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <noreply@capitalrooms.co.uk>'

function weeklyRent(monthly: number) {
  return Math.round((monthly * 12) / 52)
}

function buildRef(propertyCode: string | null, roomName: string | null) {
  const propPart = (propertyCode || 'CAP').toUpperCase().replace(/\s/g, '')
  const roomPart = (roomName || '').replace(/[^0-9]/g, '').padStart(2, '0')
  return `${propPart}${roomPart} RESERVE`.trim()
}

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

    if (!data.roomId || !data.propertyId || !data.applicantEmail) {
      return Response.json({ error: 'Missing required fields: roomId, propertyId, applicantEmail' }, { status: 400 })
    }

    const { data: roomData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, properties(property_code)')
      .eq('id', data.roomId)
      .single()

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, name, address')
      .eq('id', data.propertyId)
      .single()

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

    // Upsert applicants row linked to this offer (best-effort, table may not be deployed yet)
    try {
      const { data: existing } = await supabase
        .from('applicants')
        .select('id, pipeline_stage')
        .eq('email', data.applicantEmail)
        .eq('room_id', data.roomId)
        .maybeSingle()

      const newStage = data.requestDeposit ? 'offer_sent' : 'offer_sent'
      if (existing) {
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
            email:          data.applicantEmail,
            pipeline_stage: newStage,
            offer_id:       offerId,
          })
          .select('id')
          .single()
        if (created && offerId) {
          await supabase.from('offers').update({ applicant_id: created.id }).eq('id', offerId)
        }
      }
    } catch {
      // Graceful — applicants table may not be deployed yet
    }

    // Build application URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
    const applicationUrl = `${appUrl}/applicant/apply?token=${applicationToken}&roomId=${data.roomId}&propertyId=${data.propertyId}`

    // Computed values for template tokens
    const monthly        = data.advertisedRent || 0
    const weekly         = weeklyRent(monthly)
    const propCode       = (roomData?.properties as any)?.property_code || null
    const roomName       = roomData?.name || 'Room'
    const propAddress    = propertyData?.address || propertyData?.name || ''
    const payRef         = buildRef(propCode, roomName)
    const firstName      = data.applicantName ? data.applicantName.split(' ')[0] : 'there'
    const moveInDisplay  = data.moveInDate || 'To be confirmed'

    // Try DB template first; fall back to lib/emailTemplates.ts builders
    const templateSlug = data.requestDeposit ? 'applicant-offer-deposit' : 'applicant-offer-letter'
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
        reserve_url:              `${appUrl}/applicant/reserve?roomId=${data.roomId}&propertyId=${data.propertyId}`,
      }
      subject   = render(tpl.subject_line, tokenVars)
      emailHtml = render(tpl.template_text, tokenVars)
    } else if (data.requestDeposit) {
      subject = `THE SEARCH IS OVER! — ${roomName}${propAddress ? `, ${propAddress}` : ''}`
      emailHtml = await buildSearchIsOverEmail({
        applicantName:   data.applicantName,
        roomName,
        propertyAddress: propAddress,
        propertyCity:    propertyData?.name || 'London',
        advertisedRent:  monthly,
        moveInDate:      moveInDisplay,
        applicationUrl,
        holdingDeposit:  weekly,
      })
    } else {
      subject = `Your application for ${roomName}${propAddress ? ` at ${propAddress}` : ''}`
      emailHtml = await buildOfferLetterEmail({
        applicantName:   data.applicantName,
        roomName,
        propertyAddress: propAddress,
        propertyCity:    propertyData?.name || 'London',
        advertisedRent:  monthly,
        moveInDate:      moveInDisplay,
        applicationUrl,
        holdingDeposit:  weekly,
      })
    }

    // Send via Resend
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'Email service not configured (RESEND_API_KEY missing)' }, { status: 500 })
    }

    const emailRes = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [data.applicantEmail], subject, html: emailHtml }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}))
      return Response.json({ error: `Email failed to send: ${(err as any)?.message || emailRes.statusText}` }, { status: 502 })
    }

    return Response.json({ success: true, offerId, applicationUrl, message: `Offer sent to ${data.applicantEmail}` }, { status: 201 })
  } catch (err) {
    console.error('Error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

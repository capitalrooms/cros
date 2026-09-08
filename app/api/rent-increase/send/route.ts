// POST /api/rent-increase/send
// Stores both PDFs to Supabase Storage, records the notice in rent_increase_notices,
// and emails them to the tenant. Admin-only.
// Does NOT update tenancies.rent_amount — that happens separately when rent takes effect.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getCurrentUser } from '@/lib/auth'
import {
  generateCoverLetter,
  generateForm4A,
  validateEffectiveDate,
  type RentIncreaseData,
} from '@/lib/rent-increase/generatePDF'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = user.assignment?.role
  if (!['administrator', 'admin'].includes(role)) {
    // Lettings cannot send legally binding notices — admin only
    return NextResponse.json({ error: 'Forbidden: only administrators can send rent increase notices' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.tenancyId || !body?.proposedRent || !body?.effectiveDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { tenancyId, proposedRent, effectiveDate, tenantTitle: bodyTitle } = body
  const sb  = serviceClient()
  const today = new Date().toISOString().slice(0, 10)

  // ── Load tenancy data (same as preview route) ─────────────────────────────
  const { data: tenancy, error: tErr } = await sb
    .from('tenancies')
    .select(`
      id, start_date, rent_amount, rent_due_day, person_id, room_id, property_id,
      person:people!tenancies_person_id_fkey(id, full_name, first_name, last_name, email),
      room:rooms!tenancies_room_id_fkey(id, name),
      property:properties!tenancies_property_id_fkey(id, name, address, landlord_id,
        landlord:people!properties_landlord_id_fkey(id, full_name, first_name, last_name, company)
      )
    `)
    .eq('id', tenancyId)
    .maybeSingle()

  if (tErr || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  const person   = tenancy.person   as any
  const room     = tenancy.room     as any
  const property = tenancy.property as any
  const landlord = property?.landlord as any

  // ── Last S13 date ─────────────────────────────────────────────────────────
  const { data: lastNotice } = await sb
    .from('rent_increase_notices')
    .select('effective_date')
    .eq('tenancy_id', tenancyId)
    .neq('outcome', 'withdrawn')
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastS13Date = lastNotice?.effective_date || null

  // ── Validate (re-validate server-side even if preview already checked) ────
  const validation = validateEffectiveDate({
    proposedDate:          effectiveDate,
    serveDate:             today,
    tenancyStartDate:      tenancy.start_date,
    lastS13EffectiveDate:  lastS13Date,
  })
  if (!validation.valid) {
    return NextResponse.json({
      error:             'Invalid effective date — notice not sent',
      validationErrors:  validation.errors,
      earliestValidDate: validation.earliestValidDate,
    }, { status: 422 })
  }

  // ── Build data object ─────────────────────────────────────────────────────
  const nameParts   = (person.full_name || '').trim().split(/\s+/)
  const landlordName = landlord
    ? (landlord.company || landlord.full_name || [landlord.first_name, landlord.last_name].filter(Boolean).join(' ') || 'The Landlord')
    : property.landlord_name || 'The Landlord'

  const pcodeMatch = property.address?.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i)
  const pcodeArea  = pcodeMatch ? pcodeMatch[0].split(' ')[0].replace(/\d.*$/, '') : ''

  const data: RentIncreaseData = {
    tenantTitle:         bodyTitle || 'Mx',
    tenantFullName:      person.full_name || nameParts.join(' '),
    tenantFirstName:     person.first_name || nameParts[0] || person.full_name,
    roomName:            room.name,
    propertyAddress:     property.address,
    propertyPostcode:    pcodeMatch?.[0] || '',
    landlordName,
    tenancyStartDate:    tenancy.start_date,
    currentRent:         Number(tenancy.rent_amount || 0),
    proposedRent:        Number(proposedRent),
    effectiveDate,
    noticeServedDate:    today,
    lastS13Date,
    marketAreaDescription: pcodeArea || undefined,
  }

  // ── Generate PDFs ─────────────────────────────────────────────────────────
  const [coverBuf, formBuf] = await Promise.all([
    generateCoverLetter(data),
    generateForm4A(data),
  ])

  // ── Upload to storage ─────────────────────────────────────────────────────
  const prefix         = `rent-increases/${tenancyId}/${today}`
  const coverPath      = `${prefix}/cover-letter.pdf`
  const form4aPath     = `${prefix}/form-4a.pdf`

  const [upCover, upForm] = await Promise.all([
    sb.storage.from('inbox-docs').upload(coverPath,  coverBuf, { contentType: 'application/pdf', upsert: true }),
    sb.storage.from('inbox-docs').upload(form4aPath, formBuf,  { contentType: 'application/pdf', upsert: true }),
  ])

  if (upCover.error || upForm.error) {
    console.error('Storage upload error', upCover.error, upForm.error)
    // Non-fatal: still record and send even if storage fails
  }

  // ── Record in DB ──────────────────────────────────────────────────────────
  const adminPerson = await sb
    .from('people')
    .select('id')
    .eq('email', user.email || '')
    .maybeSingle()

  const { data: notice, error: dbErr } = await sb
    .from('rent_increase_notices')
    .insert({
      tenancy_id:              tenancyId,
      person_id:               tenancy.person_id,
      property_id:             tenancy.property_id,
      room_id:                 tenancy.room_id,
      old_rent:                Number(tenancy.rent_amount || 0),
      proposed_rent:           Number(proposedRent),
      notice_served_date:      today,
      effective_date:          effectiveDate,
      last_s13_effective_date: lastS13Date,
      cover_letter_path:       upCover.error ? null : coverPath,
      form4a_path:             upForm.error  ? null : form4aPath,
      outcome:                 'pending',
      created_by:              adminPerson?.data?.id || null,
    })
    .select('id')
    .single()

  if (dbErr || !notice) {
    console.error('DB insert error', dbErr)
    return NextResponse.json({ error: 'Failed to record notice in database', detail: dbErr?.message }, { status: 500 })
  }

  // ── Email to tenant ───────────────────────────────────────────────────────
  const resend = new Resend(process.env.RESEND_API_KEY)

  const effFormatted = new Date(effectiveDate + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  try {
    await resend.emails.send({
      from:    'Capital Rooms <noreply@capitalrooms.co.uk>',
      to:      [person.email],
      subject: `Important: Section 13 rent increase notice — effective ${effFormatted}`,
      attachments: [
        {
          filename: `Section-13-Cover-Letter-${today}.pdf`,
          content:  coverBuf.toString('base64'),
        },
        {
          filename: `Form-4A-Section-13-Notice-${today}.pdf`,
          content:  formBuf.toString('base64'),
        },
      ],
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb">
          <h2 style="color:#111;margin-bottom:4px">Rent increase notice</h2>
          <p style="color:#444;font-size:14px">Dear ${data.tenantFirstName},</p>
          <p style="color:#444;font-size:14px">
            Please find enclosed two documents regarding a proposed change to your rent, effective from
            <strong>${effFormatted}</strong>:
          </p>
          <ol style="color:#444;font-size:14px;padding-left:20px">
            <li style="margin-bottom:8px"><strong>Cover letter</strong> — explains the increase and your options in plain English</li>
            <li><strong>Form 4A</strong> — the statutory Section 13 notice required by law</li>
          </ol>
          <p style="color:#444;font-size:14px">
            Please read both documents carefully. If you have any questions, reply to this email or call us on
            <strong>0207 112 9163</strong>.
          </p>
          <p style="color:#666;font-size:12px;margin-top:24px">Capital Rooms · Third Floor, 86-90 Paul Street, London EC2A 4NE</p>
        </div>
      `,
    })
  } catch (emailErr: any) {
    console.error('Email send failed', emailErr)
    // Don't fail the whole request — notice is already recorded in DB
    return NextResponse.json({
      ok:       true,
      noticeId: notice.id,
      warning:  `Notice recorded but email failed to send: ${emailErr?.message}. Please send manually.`,
    })
  }

  return NextResponse.json({
    ok:       true,
    noticeId: notice.id,
    message:  `Section 13 notice served to ${person.email} — effective ${effFormatted}`,
  })
}

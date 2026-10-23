// POST /api/rent-increase/send
// Stores both PDFs to Supabase Storage, records the notice in rent_increase_notices,
// and emails them to the tenant. Admin-only.
// Does NOT update tenancies.rent_amount — that happens separately when rent takes effect.

import { hasArea } from '@/lib/access/server'
import { NextRequest, NextResponse } from 'next/server'
import { deliverEmail } from '@/lib/sendEmail'
import { createClient } from '@supabase/supabase-js'
import {
  generateCoverLetter,
  generateForm4A,
  validateEffectiveDate,
  type RentIncreaseData,
} from '@/lib/rent-increase/generatePDF'
import { getDeemedServiceDate, getDeemedServiceDescription } from '@/lib/rent-increase/deemedServiceDate'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { landlordFormalNames, dearName, displayName } from '@/lib/people'
import { senderFor } from '@/lib/email/sender'
import { buildEmail } from '@/lib/emailWrapper'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  // ── Auth (Bearer token — works in serverless, no singleton dependency) ────
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = serviceClient()
  const { data: { user: authUser }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerPerson } = await sb
    .from('people')
    .select('role, id, full_name, job_title, direct_phone')
    .eq('email', authUser.email || '')
    .maybeSingle()
  const role = (callerPerson as any)?.role as string | undefined
  // Only administrators can send legally binding Section 13 notices
  if (!role || !(await hasArea('lettings', req.headers))) {
    return NextResponse.json({ error: 'Forbidden: only administrators can send rent increase notices' }, { status: 403 })
  }

  const senderName        = (callerPerson as any)?.full_name    as string | null ?? null
  const senderJobTitle    = (callerPerson as any)?.job_title    as string | null ?? null
  const senderDirectPhone = (callerPerson as any)?.direct_phone as string | null ?? null

  const body = await req.json().catch(() => null)
  if (!body?.tenancyId || body?.proposedRent == null || !body?.effectiveDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { tenancyId, proposedRent, effectiveDate, tenantTitle: bodyTitle, lastS13Date: lastS13DateOverride } = body
  const today = new Date().toISOString().slice(0, 10)

  // ── Deemed service date ───────────────────────────────────────────────────
  const deemedServeDate = getDeemedServiceDate()
  const deemedServeDescription = getDeemedServiceDescription()

  // ── Load tenancy data (same as preview route) ─────────────────────────────
  const { data: tenancy, error: tErr } = await sb
    .from('tenancies')
    .select(`
      id, start_date, end_date, notice_received_date, rent_amount, rent_due_day, person_id, room_id, property_id,
      is_fixed_term, last_rent_change_date, previous_rent_amount,
      person:people!tenancies_person_id_fkey(id, full_name, salutation, first_name, last_name, email), co:people!co_tenant_id(id, full_name, salutation, first_name, last_name, email),
      room:rooms!tenancies_room_id_fkey(id, name),
      property:properties!tenancies_property_id_fkey(id, name, address, landlord_id,
        landlord:people!properties_landlord_id_fkey(*)
      )
    `)
    .eq('id', tenancyId)
    .maybeSingle()

  if (tErr || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  const person   = tenancy.person   as any
  // a joint tenancy: the notice is addressed and sent to both named tenants (Section 13 must reach every tenant)
  const co       = (tenancy as any).co as any
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

  // Use admin-supplied override if present (empty string = "no prior history").
  const lastS13Date = lastS13DateOverride !== undefined
    ? (lastS13DateOverride || null)
    : (lastNotice?.effective_date || null)

  // (Rule 0, the fixed-term block, removed 21 Oct 2026: since the Renters' Rights Act every tenancy is periodic —
  //  no fixed term, so a Section 13 notice is never blocked by one. Harry: "there is no contract length anymore".)

  // ── Validate (re-validate server-side even if preview already checked) ────
  const lastRentChangeDate = (tenancy as any).last_rent_change_date as string | null
  const validation = validateEffectiveDate({
    proposedDate:         effectiveDate,
    serveDate:            deemedServeDate, // 2-month countdown from deemed date
    tenancyStartDate:     tenancy.start_date,
    lastS13EffectiveDate: lastS13Date,
    lastRentChangeDate,
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
    ? (landlord.company || landlordFormalNames(landlord) || 'The Landlord')
    : property.landlord_name || 'The Landlord'

  const pcodeMatch = property.address?.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i)
  // Keep the full district (e.g. "E15", not "E") — the old regex stripped digits
  const pcodeArea  = pcodeMatch ? pcodeMatch[0].split(' ')[0] : ''

  const bizSettings = await fetchPDFBizSettings()

  const data: RentIncreaseData = {
    tenantTitle:         bodyTitle || 'Mx',
    tenantFullName:      (person.full_name || nameParts.join(' ')) + (co ? ` & ${displayName(co)}` : ''),
    tenantFirstName:     person.first_name || nameParts[0] || person.full_name,
    roomName:            room.name,
    propertyAddress:     property.address,
    propertyPostcode:    pcodeMatch?.[0] || '',
    landlordName,
    tenancyStartDate:    tenancy.start_date,
    currentRent:         Number(tenancy.rent_amount || 0),
    proposedRent:        Number(proposedRent),
    effectiveDate,
    noticeServedDate:    deemedServeDate, // legally deemed service date
    lastS13Date,
    marketAreaDescription: pcodeArea || undefined,
    senderName:        senderName        || undefined,
    senderJobTitle:    senderJobTitle    || undefined,
    senderDirectPhone: senderDirectPhone || undefined,
    bizSettings,
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
  // callerPerson.id already fetched during auth above
  const adminPersonId = (callerPerson as any)?.id || null

  const { data: notice, error: dbErr } = await sb
    .from('rent_increase_notices')
    .insert({
      tenancy_id:              tenancyId,
      person_id:               tenancy.person_id,
      property_id:             tenancy.property_id,
      room_id:                 tenancy.room_id,
      old_rent:                Number(tenancy.rent_amount || 0),
      proposed_rent:           Number(proposedRent),
      notice_served_date:      deemedServeDate,
      effective_date:          effectiveDate,
      last_s13_effective_date: lastS13Date,
      cover_letter_path:       upCover.error ? null : coverPath,
      form4a_path:             upForm.error  ? null : form4aPath,
      outcome:                 'pending',
      created_by:              adminPersonId,
    })
    .select('id')
    .single()

  if (dbErr || !notice) {
    console.error('DB insert error', dbErr)
    return NextResponse.json({ error: 'Failed to record notice in database', detail: dbErr?.message }, { status: 500 })
  }

  // ── Email to tenant ───────────────────────────────────────────────────────

  const effFormatted = new Date(effectiveDate + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  try {
    await deliverEmail({
      to:      [person.email, co?.email].filter(Boolean) as string[],
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
      html: await buildEmail(`
          <p>Dear ${dearName({ salutation: person.salutation || bodyTitle || null, first_name: person.first_name, last_name: person.last_name, full_name: person.full_name })}${co ? ` and ${dearName(co)}` : ''},</p>
          <p>Please find enclosed two documents regarding a proposed change to your rent, effective from <strong>${effFormatted}</strong>:</p>
          <ol style="padding-left:20px;">
            <li style="margin-bottom:8px;"><strong>Cover letter</strong> — explains the increase and your options in plain English</li>
            <li><strong>Form 4A</strong> — the statutory Section 13 notice required by law</li>
          </ol>
          <p>Please read both documents carefully. If you have any questions, reply to this email or call us on <strong>0207 112 9163</strong>.</p>`, { sender: await senderFor(req) }),
    }, { req: req })
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
    message:  `Section 13 notice served to ${[person.email, co?.email].filter(Boolean).join(' and ')} — effective ${effFormatted}`,
  })
}

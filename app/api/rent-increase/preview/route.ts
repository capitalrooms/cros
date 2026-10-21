// POST /api/rent-increase/preview
// Generates both PDFs (cover letter + Form 4A) in memory and returns them as
// base64 strings for client-side preview. Does NOT save to storage or DB.
// Auth: Bearer token in Authorization header, validated against Supabase.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  generateCoverLetter,
  generateForm4A,
  validateEffectiveDate,
  type RentIncreaseData,
} from '@/lib/rent-increase/generatePDF'
import { getDeemedServiceDate, getDeemedServiceDescription } from '@/lib/rent-increase/deemedServiceDate'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { landlordFormalNames } from '@/lib/people'

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
    .select('role, full_name, job_title, direct_phone')
    .eq('email', authUser.email || '')
    .maybeSingle()
  const role = (callerPerson as any)?.role as string | undefined
  if (!role || !['administrator', 'admin', 'lettings'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const senderName        = (callerPerson as any)?.full_name    as string | null ?? null
  const senderJobTitle    = (callerPerson as any)?.job_title    as string | null ?? null
  const senderDirectPhone = (callerPerson as any)?.direct_phone as string | null ?? null

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  // proposedRent can be any positive number (even 0 in probe calls — we check for null/undefined)
  if (!body?.tenancyId || body?.proposedRent == null || !body?.effectiveDate) {
    return NextResponse.json({ error: 'Missing required fields: tenancyId, proposedRent, effectiveDate' }, { status: 400 })
  }

  const { tenancyId, proposedRent, effectiveDate, lastS13Date: lastS13DateOverride } = body
  // sb already declared in auth block above

  // ── Load tenancy + tenant + room + property + landlord ───────────────────
  const { data: tenancy, error: tErr } = await sb
    .from('tenancies')
    .select(`
      id, start_date, end_date, notice_received_date, rent_amount, rent_due_day,
      is_fixed_term, last_rent_change_date, previous_rent_amount,
      person:people!tenancies_person_id_fkey(id, full_name, salutation, first_name, last_name, email),
      room:rooms!tenancies_room_id_fkey(id, name),
      property:properties!tenancies_property_id_fkey(id, name, address, landlord_id,
        landlord:people!properties_landlord_id_fkey(*)
      )
    `)
    .eq('id', tenancyId)
    .maybeSingle()

  if (tErr || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found', detail: tErr?.message }, { status: 404 })
  }

  const person   = tenancy.person   as any
  const room     = tenancy.room     as any
  const property = tenancy.property as any
  const landlord = property?.landlord as any

  if (!person || !room || !property) {
    return NextResponse.json({ error: 'Tenancy is missing person, room, or property data' }, { status: 422 })
  }

  // (Rule 0, the fixed-term block, removed 21 Oct 2026: since the Renters' Rights Act every tenancy is periodic —
  //  no fixed term, so a Section 13 notice is never blocked by one. Harry: "there is no contract length anymore".)
  const today = new Date().toISOString().slice(0, 10)

  // ── Last Section 13 effective date ────────────────────────────────────────
  const { data: lastNotice } = await sb
    .from('rent_increase_notices')
    .select('effective_date')
    .eq('tenancy_id', tenancyId)
    .neq('outcome', 'withdrawn')
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Use admin-supplied override if present (empty string means "no prior history").
  // If not in request body (undefined), fall back to DB query result.
  const lastS13Date = lastS13DateOverride !== undefined
    ? (lastS13DateOverride || null)
    : (lastNotice?.effective_date || null)

  // ── Deemed service date ───────────────────────────────────────────────────
  // Email sent before 16:30 on a weekday = served today; otherwise next weekday.
  const deemedServeDate = getDeemedServiceDate()
  const deemedServeDescription = getDeemedServiceDescription()

  // ── Validate effective date ───────────────────────────────────────────────
  const lastRentChangeDate = (tenancy as any).last_rent_change_date as string | null
  const validation = validateEffectiveDate({
    proposedDate:         effectiveDate,
    serveDate:            deemedServeDate, // 2-month countdown from deemed date, not raw send time
    tenancyStartDate:     tenancy.start_date,
    lastS13EffectiveDate: lastS13Date,
    lastRentChangeDate,   // falls back to tenancy start only when null and no s.13 history
  })

  if (!validation.valid) {
    return NextResponse.json({
      error: 'Invalid effective date',
      validationErrors: validation.errors,
      earliestValidDate: validation.earliestValidDate,
      lastS13Date,   // echo so UI can pre-fill field 4.3
    }, { status: 422 })
  }

  // ── Build data object ─────────────────────────────────────────────────────
  const nameParts = (person.full_name || `${person.first_name || ''} ${person.last_name || ''}`).trim().split(/\s+/)
  // Simple title detection from DB; default to "Mr/Ms" heuristic
  const storedTitle = (person as any).title || ''
  const tenantTitle = storedTitle || 'Mx'   // Mx = gender-neutral default; admin can override via UI

  const landlordName = landlord
    ? (landlord.company || landlordFormalNames(landlord) || 'The Landlord')
    : property.landlord_name || 'The Landlord'

  // Derive postcode from property address for market area description
  const pcodeMatch = property.address?.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i)
  // Keep the full district (e.g. "E15", not "E") — the old regex stripped digits
  const pcodeArea  = pcodeMatch ? pcodeMatch[0].split(' ')[0] : ''

  const bizSettings = await fetchPDFBizSettings()

  const data: RentIncreaseData = {
    tenantTitle,
    tenantFullName:   person.full_name || nameParts.join(' '),
    tenantFirstName:  person.first_name || nameParts[0] || person.full_name,
    roomName:         room.name,
    propertyAddress:  property.address,
    propertyPostcode: pcodeMatch?.[0] || '',
    landlordName,
    tenancyStartDate: tenancy.start_date,
    currentRent:      Number(tenancy.rent_amount || 0),
    proposedRent:     Number(proposedRent),
    effectiveDate,
    noticeServedDate: deemedServeDate, // legally deemed service date, not raw send time
    lastS13Date,
    marketAreaDescription: pcodeArea || undefined,
    senderName:        senderName        || undefined,
    senderJobTitle:    senderJobTitle    || undefined,
    senderDirectPhone: senderDirectPhone || undefined,
    bizSettings,
  }

  // ── Generate both PDFs ────────────────────────────────────────────────────
  const [coverBuf, formBuf] = await Promise.all([
    generateCoverLetter(data),
    generateForm4A(data),
  ])

  return NextResponse.json({
    ok:            true,
    coverLetter:   coverBuf.toString('base64'),
    form4A:        formBuf.toString('base64'),
    validation,
    // Echo back computed values for the UI to show
    tenantName:    data.tenantFullName,
    currentRent:   data.currentRent,
    proposedRent:  data.proposedRent,
    effectiveDate,
    landlordName,
    earliestValidDate:       validation.earliestValidDate,
    noticeServedDate:        deemedServeDate,
    noticeServedDescription: deemedServeDescription,
    lastS13Date,            // echo for UI field 4.3 pre-fill
    lastRentChangeDate,
    previousRentAmount: (tenancy as any).previous_rent_amount ?? null,
  })
}

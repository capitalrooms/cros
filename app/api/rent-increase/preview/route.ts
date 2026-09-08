// POST /api/rent-increase/preview
// Generates both PDFs (cover letter + Form 4A) in memory and returns them as
// base64 strings for client-side preview. Does NOT save to storage or DB.
// Admin-only — verified via getCurrentUser().

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
  if (!['administrator', 'admin', 'lettings'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  if (!body?.tenancyId || !body?.proposedRent || !body?.effectiveDate) {
    return NextResponse.json({ error: 'Missing required fields: tenancyId, proposedRent, effectiveDate' }, { status: 400 })
  }

  const { tenancyId, proposedRent, effectiveDate } = body
  const sb = serviceClient()

  // ── Load tenancy + tenant + room + property + landlord ───────────────────
  const { data: tenancy, error: tErr } = await sb
    .from('tenancies')
    .select(`
      id, start_date, end_date, notice_received_date, rent_amount, rent_due_day,
      person:people!tenancies_person_id_fkey(id, full_name, first_name, last_name, email),
      room:rooms!tenancies_room_id_fkey(id, name),
      property:properties!tenancies_property_id_fkey(id, name, address, landlord_id,
        landlord:people!properties_landlord_id_fkey(id, full_name, first_name, last_name, company)
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

  // ── Fixed-term block (Rule 0) ─────────────────────────────────────────────
  // s.13 notices can only be served on assured PERIODIC tenancies.
  // A tenancy with end_date in the future AND no notice_received_date was
  // created as a fixed-term AST and is still within its original term.
  // (If notice was served via "Mark on Notice", both end_date AND
  // notice_received_date are always written together — so notice_received_date
  // being null is the reliable signal that end_date came from tenancy creation.)
  const today = new Date().toISOString().slice(0, 10)
  const tenancyEndDate       = (tenancy as any).end_date as string | null
  const noticeReceivedDate   = (tenancy as any).notice_received_date as string | null
  if (tenancyEndDate && !noticeReceivedDate && tenancyEndDate > today) {
    const fmtFixed = new Date(tenancyEndDate + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    return NextResponse.json({
      error:           'fixed_term_block',
      fixedTermError:  `Section 13 notices cannot be served during the fixed term of an AST. This tenancy's fixed term does not expire until ${fmtFixed}. Once it becomes a periodic tenancy after that date, a Section 13 notice may be served.`,
      fixedTermEndDate: tenancyEndDate,
    }, { status: 422 })
  }

  // ── Last Section 13 effective date ────────────────────────────────────────
  const { data: lastNotice } = await sb
    .from('rent_increase_notices')
    .select('effective_date')
    .eq('tenancy_id', tenancyId)
    .neq('outcome', 'withdrawn')
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastS13Date = lastNotice?.effective_date || null

  // ── Validate effective date ───────────────────────────────────────────────
  const validation = validateEffectiveDate({
    proposedDate:          effectiveDate,
    serveDate:             today,
    tenancyStartDate:      tenancy.start_date,
    lastS13EffectiveDate:  lastS13Date,
  })

  if (!validation.valid) {
    return NextResponse.json({
      error: 'Invalid effective date',
      validationErrors: validation.errors,
      earliestValidDate: validation.earliestValidDate,
    }, { status: 422 })
  }

  // ── Build data object ─────────────────────────────────────────────────────
  const nameParts = (person.full_name || `${person.first_name || ''} ${person.last_name || ''}`).trim().split(/\s+/)
  // Simple title detection from DB; default to "Mr/Ms" heuristic
  const storedTitle = (person as any).title || ''
  const tenantTitle = storedTitle || 'Mx'   // Mx = gender-neutral default; admin can override via UI

  const landlordName = landlord
    ? (landlord.company || landlord.full_name || [landlord.first_name, landlord.last_name].filter(Boolean).join(' ') || 'The Landlord')
    : property.landlord_name || 'The Landlord'

  // Derive postcode from property address for market area description
  const pcodeMatch = property.address?.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i)
  const pcodeArea  = pcodeMatch ? pcodeMatch[0].split(' ')[0].replace(/\d.*$/, '') : ''

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
    noticeServedDate: today,
    lastS13Date,
    marketAreaDescription: pcodeArea || undefined,
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
    earliestValidDate: validation.earliestValidDate,
  })
}

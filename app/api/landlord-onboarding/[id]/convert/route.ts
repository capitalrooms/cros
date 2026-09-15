import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

/**
 * POST /api/landlord-onboarding/[id]/convert
 *
 * Converts a fully-onboarded landlord_onboarding record into a proper
 * `people` row with role = 'landlord', then links the two records together
 * via landlord_onboarding.landlord_people_id.
 *
 * Idempotent: if landlord_people_id is already set, returns the existing
 * people row without creating a duplicate.
 *
 * Handles duplicate emails: if a people row already exists with the same
 * email, it upgrades that row to role='landlord' and links it (rather than
 * creating a duplicate).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // 1. Fetch the onboarding record
  const { data: onb, error: fetchErr } = await svc()
    .from('landlord_onboarding')
    .select('id, full_name, email, phone, entity_type, form_data, landlord_people_id, stage')
    .eq('id', id)
    .single()

  if (fetchErr || !onb) {
    return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 })
  }

  // 2. Idempotency — already converted
  if (onb.landlord_people_id) {
    const { data: existing } = await svc()
      .from('people')
      .select('id, first_name, last_name, full_name, email, phone, role, company')
      .eq('id', onb.landlord_people_id)
      .single()
    return NextResponse.json({ ok: true, alreadyExisted: true, person: existing })
  }

  // 3. Extract fields from form_data
  const fd = (onb.form_data ?? {}) as Record<string, any>

  const isCompany   = onb.entity_type === 'company'
  const firstName   = fd.first_name?.trim() || null
  const lastName    = fd.last_name?.trim()  || null
  const fullName    = firstName && lastName
    ? `${firstName} ${lastName}`
    : firstName ?? lastName ?? onb.full_name?.trim() ?? null
  const companyName = fd.company_name?.trim()  || null
  const companyReg  = fd.company_reg?.trim()   || null
  const homeAddress = fd.address?.trim()       || fd.registered_office?.trim() || null
  const phone       = fd.contact_phone?.trim() || onb.phone?.trim() || null
  const email       = (fd.contact_email?.trim() || onb.email?.trim()).toLowerCase()

  // 4. Check for an existing people row with the same email
  const { data: emailMatch } = await svc()
    .from('people')
    .select('id, role')
    .eq('email', email)
    .maybeSingle()

  let personId: string

  if (emailMatch) {
    // Upgrade existing record to landlord if not already
    const upgrades: Record<string, unknown> = {}
    if (emailMatch.role !== 'landlord') upgrades.role = 'landlord'
    if (firstName)   upgrades.first_name   = firstName
    if (lastName)    upgrades.last_name    = lastName
    if (fullName)    upgrades.full_name    = fullName
    if (phone)       upgrades.phone        = phone
    if (homeAddress) upgrades.home_address = homeAddress
    if (companyName) upgrades.company      = companyName
    if (companyReg)  upgrades.company_number = companyReg
    if (!upgrades.role) upgrades.landlord_comms_enabled = upgrades.landlord_comms_enabled ?? false

    if (Object.keys(upgrades).length > 0) {
      await svc().from('people').update(upgrades).eq('id', emailMatch.id)
    }
    personId = emailMatch.id
  } else {
    // 5. Create a brand new people row
    const { data: newPerson, error: insertErr } = await svc()
      .from('people')
      .insert({
        role:                  'landlord',
        email,
        first_name:            isCompany ? null        : firstName,
        last_name:             isCompany ? null        : lastName,
        full_name:             isCompany ? companyName : fullName,
        company:               companyName,
        company_number:        companyReg,
        phone,
        home_address:          homeAddress,
        landlord_comms_enabled: false,
      })
      .select('id')
      .single()

    if (insertErr || !newPerson) {
      return NextResponse.json(
        { error: insertErr?.message ?? 'Failed to create people record' },
        { status: 500 }
      )
    }
    personId = newPerson.id
  }

  // 6. Link the people.id back to the onboarding record
  const { error: linkErr } = await svc()
    .from('landlord_onboarding')
    .update({ landlord_people_id: personId })
    .eq('id', id)

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 })
  }

  // 7. Fetch and return the full person for the UI
  const { data: person } = await svc()
    .from('people')
    .select('id, first_name, last_name, full_name, email, phone, role, company, company_number, home_address')
    .eq('id', personId)
    .single()

  return NextResponse.json({ ok: true, alreadyExisted: !!emailMatch, person })
}

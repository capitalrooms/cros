import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'

/**
 * POST /api/applicants/[id]/convert
 *
 * Converts an applicant into a tenant (people row).
 * If a people row with the same email already exists, links to it.
 * Otherwise creates a new people row carrying across the applicant's details.
 * Sets applicants.converted_person_id and people.applicant_id.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['lettings','administrator','admin'].includes(user.assignment?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Fetch full applicant record
  const { data: applicant, error: aErr } = await sb
    .from('applicants')
    .select('*, rooms(name, current_asking_rent), properties(name, address)')
    .eq('id', params.id)
    .single()

  if (aErr || !applicant) return NextResponse.json({ error: 'Applicant not found' }, { status: 404 })
  if (applicant.pipeline_stage === 'converted') {
    return NextResponse.json({ error: 'Already converted', personId: applicant.converted_person_id }, { status: 409 })
  }

  // Optional overrides from request body (room_id, move_in_date, rent)
  const body = await req.json().catch(() => ({}))

  // Check if a people row already exists for this email
  const { data: existing } = await sb
    .from('people')
    .select('id')
    .eq('email', applicant.email)
    .maybeSingle()

  let personId: string

  if (existing) {
    // Link the existing person to this applicant
    const { error: updateErr } = await sb
      .from('people')
      .update({ applicant_id: applicant.id, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    personId = existing.id
  } else {
    // Build name parts from full_name
    const nameParts = applicant.full_name.trim().split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName  = nameParts.slice(1).join(' ') || ''

    const { data: created, error: createErr } = await sb
      .from('people')
      .insert({
        email:         applicant.email,
        first_name:    firstName,
        last_name:     lastName,
        full_name:     applicant.full_name,
        phone:         applicant.phone         || null,
        date_of_birth: applicant.date_of_birth || null,
        occupation:    applicant.profession    || null,
        role:          'tenant',
        property_id:   body.property_id || applicant.property_id,
        room_id:       body.room_id     || applicant.room_id,
        applicant_id:  applicant.id,
        using_app:     false,
      })
      .select('id')
      .single()

    if (createErr || !created) return NextResponse.json({ error: createErr?.message || 'Failed to create tenant' }, { status: 500 })
    personId = created.id
  }

  // Mark applicant as converted
  await sb.from('applicants').update({
    pipeline_stage:       'converted',
    converted_person_id:  personId,
    reviewed_at:          new Date().toISOString(),
    updated_at:           new Date().toISOString(),
  }).eq('id', applicant.id)

  return NextResponse.json({
    success: true,
    personId,
    message: `${applicant.full_name} converted to tenant`,
  })
}

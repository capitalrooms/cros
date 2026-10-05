// POST /api/applicant/application { applicantId, email } — "Reopen my application": returns what the applicant sent,
// so the form can be changed and sent again. Only with the email it was sent with (the link alone isn't enough to
// read someone's details), and only while we haven't moved the application on (invited / applied).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f-]{36}$/i
const EDITABLE_STAGES = ['invited', 'applied']

const FIELDS = 'id, room_id, property_id, pipeline_stage, salutation, first_name, middle_name, last_name, email, phone, date_of_birth, current_address, profession, salary, linkedin_url, profession_description, preferred_start_date, preferred_term, bio, interests, sociability, house_preferences, communication_style, room_requirements, room_conditions, rent_offer_type, offered_rent, previous_addresses, guarantor_needed, guarantor_name, guarantor_email, guarantor_phone'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id = String(body.applicantId ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!UUID.test(id) || !email) return NextResponse.json({ error: 'Enter the email you applied with.' }, { status: 400 })

  const { data } = await createServiceClient().from('applicants').select(FIELDS).eq('id', id).maybeSingle()
  // same answer for "no such application" and "wrong email", so the form can't be used to test addresses
  if (!data || String((data as any).email ?? '').trim().toLowerCase() !== email) {
    return NextResponse.json({ error: 'That email doesn’t match the application. Please use the email you applied with.' }, { status: 404 })
  }
  if (!EDITABLE_STAGES.includes(String((data as any).pipeline_stage))) {
    return NextResponse.json({ error: 'We’ve already started working on your application, so it can no longer be changed online.' }, { status: 409 })
  }
  return NextResponse.json({ application: data })
}

import { createClient } from '@supabase/supabase-js'
import { insertNotifications, tryPush } from '@/lib/serverNotify'
import { STAFF_ROLES } from '@/lib/portalAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const data = await request.json()

    if (!data.fullName || !data.email || !data.roomId) {
      return Response.json({ error: 'Missing required fields: fullName, email, roomId' }, { status: 400 })
    }

    const payload = {
      full_name:            data.fullName,
      email:                data.email,
      phone:                data.phone                || null,
      date_of_birth:        data.dateOfBirth          || null,
      current_address:      data.currentAddress       || null,
      profession:           data.profession           || null,
      salary:               data.salary               || null,
      linkedin_url:         data.linkedinUrl          || null,
      profession_description: data.professionDescription || null,
      preferred_start_date: data.preferredStartDate   || null,
      preferred_term:       data.preferredTerm        || null,
      bio:                  data.bio                  || null,
      interests:            data.interests            || null,
      sociability:          data.sociability          || null,
      house_preferences:    data.housePreferences     || null,
      communication_style:  data.communicationStyle   || null,
      room_requirements:    data.roomRequirements     || null,
      room_conditions:      data.roomConditions       || null,
      advertised_rent:      data.advertisedRent       || null,
      rent_offer_type:      data.rentOfferType        || 'asking',
      offered_rent:         data.offeredRent          || null,
      previous_addresses:   data.previousAddresses    || [],
      pipeline_stage:       'applied',
      submitted_at:         new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    }

    // Upsert: match on email + room_id so clicking the link twice doesn't create duplicates
    const { data: existing } = await supabase
      .from('applicants')
      .select('id')
      .eq('email', data.email)
      .eq('room_id', data.roomId)
      .maybeSingle()

    let applicantId: string

    if (existing) {
      // Update the existing row (carries forward viewing_id, offer_id, etc.)
      const { error } = await supabase
        .from('applicants')
        .update(payload)
        .eq('id', existing.id)

      if (error) {
        console.error('Error updating applicant:', error)
        return Response.json({ error: 'Failed to submit application' }, { status: 500 })
      }
      applicantId = existing.id
    } else {
      // New applicant — insert fresh row
      const insertPayload = {
        ...payload,
        room_id:     data.roomId,
        property_id: data.propertyId,
        viewing_id:  data.viewingId || null,
      }
      const { data: created, error } = await supabase
        .from('applicants')
        .insert(insertPayload)
        .select('id')
        .single()

      if (error || !created) {
        console.error('Error inserting applicant:', error)
        return Response.json({ error: 'Failed to submit application' }, { status: 500 })
      }
      applicantId = created.id
    }

    // Tell the office and lettings team — in their notification bell and as a push. Never blocks the application.
    try {
      const { data: room } = await supabase.from('rooms').select('name, properties(name)').eq('id', data.roomId).maybeSingle() as { data: any }
      const { data: staff } = await supabase.from('people').select('id').in('role', STAFF_ROLES)
      const ids = (staff ?? []).map((p: any) => p.id)
      const below = data.rentOfferType === 'below_asking' && data.offeredRent ? ` — offering £${Number(data.offeredRent).toLocaleString('en-GB')} pcm` : ''
      const title = '📝 New offer received'
      const body = `${data.fullName} has applied for ${[room?.name, room?.properties?.name].filter(Boolean).join(', ') || 'a room'}${below}.`
      await insertNotifications(supabase, ids, { title, body, type: 'lettings', link: '/admin/applicants' }, { propertyId: data.propertyId ?? null, roomId: data.roomId })
      await tryPush(ids, title, body, '/admin/applicants')
    } catch (e) {
      console.error('apply: staff notification failed', e)
    }

    return Response.json({ success: true, applicantId, message: 'Application submitted successfully' }, { status: 201 })
  } catch (err) {
    console.error('Error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

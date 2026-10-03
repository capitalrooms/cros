// Let agreed → the incoming tenancy. One way in, shared by the holding deposit (app/api/lettings/holding-deposit)
// and the manual "Create tenancy" from an applicant (app/api/applicants/[id]/convert).
//
// Links (or creates) the person from the applicant, creates the tenancy with its future start date, takes the room
// off the market, carries the applicant's documents across and marks the applicant converted. Idempotent: a second
// call finds the same tenancy. Server-only (service client).

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'
import { fiveWeeksDeposit } from '@/lib/tenancy/deposit'

export interface TenancyOverrides {
  room_id?: string; property_id?: string; start_date?: string; end_date?: string; rent_amount?: number; rent_due_day?: number
  rent_frequency?: string; rent_in_advance?: number; deposit_amount?: number; deposit_held_by?: string
  deposit_scheme_ref?: string; holding_deposit_received?: number; agreement_type?: string; is_periodic?: boolean
  letting_fee_charged?: number | boolean | null; notice_period_months?: number; lease_reference?: string
  payment_reference?: string; office_notes?: string; rent_review_date?: string
}

export interface IncomingResult { personId?: string; tenancyId?: string | null; created?: boolean; alreadyConverted?: boolean; error?: string; status?: number }

export async function logTenancyEvent(sb: SupabaseClient, tenancyId: string, kind: string, note: string, byEmail: string | null) {
  const { error } = await sb.from('tenancy_events').insert({ tenancy_id: tenancyId, kind, note, by_email: byEmail })
  if (error && !/tenancy_events/.test(error.message)) console.warn('tenancy event not logged', error.message)
}

export async function createIncomingTenancy(sb: SupabaseClient, applicantId: string, body: TenancyOverrides, byEmail: string | null): Promise<IncomingResult> {
  const { data: applicant, error: aErr } = await sb
    .from('applicants')
    .select('*, rooms(name, current_asking_rent), properties(name, address)')
    .eq('id', applicantId)
    .single()
  if (aErr || !applicant) return { error: 'Applicant not found', status: 404 }

  // Already converted: hand back the tenancy made then
  if (applicant.pipeline_stage === 'converted' && applicant.converted_person_id) {
    const { data: t } = await sb.from('tenancies').select('id').eq('person_id', applicant.converted_person_id)
      .eq('room_id', applicant.room_id).is('let_cancelled_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return { personId: applicant.converted_person_id, tenancyId: t?.id ?? null, alreadyConverted: true }
  }

  // The person: linked by email if they're already on file, otherwise created from the application
  const { data: existing } = await sb.from('people').select('id').ilike('email', applicant.email).limit(1).maybeSingle()
  let personId: string
  if (existing) {
    // an existing person: fill in any name parts we didn't have, never overwrite ones the office set
    const { data: cur } = await sb.from('people').select('salutation, first_name, middle_name, last_name').eq('id', existing.id).maybeSingle() as { data: any }
    const fill: Record<string, unknown> = {}
    if (!cur?.salutation && applicant.salutation) fill.salutation = applicant.salutation
    if (!cur?.middle_name && applicant.middle_name) fill.middle_name = applicant.middle_name
    if (!cur?.first_name && applicant.first_name) fill.first_name = applicant.first_name
    if (!cur?.last_name && applicant.last_name) fill.last_name = applicant.last_name
    const { error } = await sb.from('people').update({ applicant_id: applicant.id, ...fill, updated_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) return { error: error.message, status: 500 }
    personId = existing.id
  } else {
    // the application gives title / first / middle / surname (migration 206); older ones only a full name
    const nameParts = String(applicant.full_name || '').trim().split(/\s+/)
    const { data: created, error } = await sb.from('people').insert({
      email: applicant.email,
      salutation: applicant.salutation || null,
      first_name: applicant.first_name || nameParts[0] || '',
      middle_name: applicant.middle_name || null,
      last_name: applicant.last_name || nameParts.slice(1).join(' ') || '',
      full_name: applicant.full_name,
      phone: applicant.phone || null,
      date_of_birth: applicant.date_of_birth || null,
      occupation: applicant.profession || null,
      role: 'tenant',
      property_id: body.property_id || applicant.property_id,
      room_id: body.room_id || applicant.room_id,
      applicant_id: applicant.id,
      using_app: false,
    }).select('id').single()
    if (error || !created) return { error: error?.message || 'Failed to create tenant', status: 500 }
    personId = created.id
  }

  // The tenancy (once per person + room)
  const roomId = body.room_id || applicant.room_id
  const propertyId = body.property_id || applicant.property_id
  const today = new Date().toISOString().slice(0, 10)
  const rentAmount = body.rent_amount
    || (applicant.rent_offer_type === 'below_asking' && applicant.offered_rent ? Number(applicant.offered_rent) : null)
    || applicant.advertised_rent || applicant.rooms?.current_asking_rent || null
  let tenancyId: string | null = null
  let created = false
  if (roomId && propertyId) {
    const { data: existingTenancy } = await sb.from('tenancies').select('id')
      .eq('person_id', personId).eq('room_id', roomId).is('notice_received_date', null).is('let_cancelled_at', null)
      .limit(1).maybeSingle()
    if (existingTenancy) tenancyId = existingTenancy.id
    else {
      const { data: room } = await sb.from('rooms').select('name').eq('id', roomId).maybeSingle()
      const { data: prop } = await sb.from('properties').select('name').eq('id', propertyId).maybeSingle()
      const { data: newTenancy, error: tErr } = await sb.from('tenancies').insert({
        person_id: personId,
        room_id: roomId,
        property_id: propertyId,
        applicant_id: applicant.id,
        start_date: body.start_date || applicant.preferred_start_date || today,
        end_date: body.end_date || null,
        rent_amount: rentAmount,
        rent_due_day: body.rent_due_day || 1,
        rent_frequency: body.rent_frequency || 'monthly',
        rent_in_advance: body.rent_in_advance || 1,
        deposit_amount: body.deposit_amount ?? (rentAmount ? fiveWeeksDeposit(Number(rentAmount)) : null),
        deposit_held_by: body.deposit_held_by || 'agent',
        deposit_scheme_ref: body.deposit_scheme_ref || null,
        holding_deposit_received: body.holding_deposit_received ?? null,
        agreement_type: body.agreement_type || 'assured_periodic',
        is_periodic: body.is_periodic ?? true,
        // amount: blank = property's usual fee, 0 = no fee; a number passed through as an override
        letting_fee_charged: typeof body.letting_fee_charged === 'number' ? body.letting_fee_charged : body.letting_fee_charged === false ? 0 : null,
        notice_period_months: body.notice_period_months ?? 2,
        lease_reference: body.lease_reference || null,
        // the bank import matches rent on this reference, so every new tenancy gets one
        payment_reference: body.payment_reference || (prop?.name && room?.name ? buildPaymentRef(prop.name, room.name) : null),
        office_notes: body.office_notes || null,
        rent_review_date: body.rent_review_date || null,
      }).select('id').single()
      if (tErr) return { personId, error: `The tenancy couldn’t be created: ${tErr.message}`, status: 500 }
      tenancyId = newTenancy.id
      created = true
      // let agreed: the room comes off the market
      await sb.from('rooms').update({ status: 'occupied' }).eq('id', roomId)
      await logTenancyEvent(sb, newTenancy.id, 'created', `Let agreed — tenancy created for ${applicant.full_name}`, byEmail)
    }
  }

  // References, Right to Rent and other documents uploaded while applying move across to the tenancy
  if (propertyId && created) {
    const { data: appDocs } = await sb.from('applicant_documents').select('*').eq('applicant_id', applicant.id)
    if (appDocs?.length) {
      const { error } = await sb.from('property_documents').insert(appDocs.map((d: any) => ({
        property_id: propertyId, document_type: d.doc_type, file_name: d.file_name, storage_url: d.storage_url,
        description: d.description || null, visible_to_tenants: false, uploaded_by: personId,
        ...(tenancyId ? { tenancy_id: tenancyId } : {}),
      })))
      if (error) console.warn('incoming tenancy: could not carry applicant docs across', error.message)
    }
  }

  await sb.from('applicants').update({
    pipeline_stage: 'converted', converted_person_id: personId,
    reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', applicant.id)

  return { personId, tenancyId, created }
}

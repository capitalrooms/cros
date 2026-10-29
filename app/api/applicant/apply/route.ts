import { createClient } from '@supabase/supabase-js'
import { placeLabel, isWholeLet } from '@/lib/lettings/letWording'
import { insertNotifications, tryPush } from '@/lib/serverNotify'
import { STAFF_ROLES } from '@/lib/portalAuth'
import { findApplicant, moveToRoom } from '@/lib/lettings/applicantRecord'
import { sendEmail } from '@/lib/sendEmail'

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

    // the rent they're applying at — saved with the application so the reserve email and holding deposit always have
    // it: the form's figure, else the rent on the offer we sent them, else the room's asking rent (15 Oct 2026)
    let appliedRent = Number(data.advertisedRent) > 0 ? Number(data.advertisedRent) : null
    if (!appliedRent && data.roomId && data.email) {
      const { data: o } = await supabase.from('offers').select('advertised_rent').eq('room_id', data.roomId).ilike('applicant_email', String(data.email).trim()).order('created_at', { ascending: false }).limit(1).maybeSingle()
      appliedRent = Number((o as any)?.advertised_rent) > 0 ? Number((o as any).advertised_rent) : null
      if (!appliedRent) {
        const { data: r } = await supabase.from('rooms').select('current_asking_rent').eq('id', data.roomId).maybeSingle()
        appliedRent = Number((r as any)?.current_asking_rent) > 0 ? Number((r as any).current_asking_rent) : null
      }
    }

    const payload = {
      full_name:            data.fullName,
      salutation:           typeof data.salutation === 'string' ? data.salutation.slice(0, 10) || null : null,
      first_name:           typeof data.firstName === 'string' ? data.firstName.slice(0, 80) || null : null,
      middle_name:          typeof data.middleName === 'string' ? data.middleName.slice(0, 120) || null : null,
      last_name:            typeof data.lastName === 'string' ? data.lastName.slice(0, 80) || null : null,
      email:                String(data.email ?? "").trim().toLowerCase(),
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
      advertised_rent:      appliedRent,
      // Renters' Rights Act: no rental bidding — an offer is only kept when it's below the asking rent
      ...(data.rentOfferType === 'below_asking' && Number(data.offeredRent) > 0 && (!appliedRent || Number(data.offeredRent) < Number(appliedRent))
        ? { rent_offer_type: 'below_asking', offered_rent: Number(data.offeredRent) }
        : { rent_offer_type: 'asking', offered_rent: null }),
      previous_addresses:   data.previousAddresses    || [],
      // guarantor (migration 202) — only sent when the applicant answered
      ...(data.guarantorNeeded ? {
        guarantor_needed: ['no', 'yes', 'not_sure'].includes(data.guarantorNeeded) ? data.guarantorNeeded : 'not_sure',
        guarantor_name:   String(data.guarantorName ?? '').trim().slice(0, 160) || null,
        guarantor_email:  String(data.guarantorEmail ?? '').trim().slice(0, 200) || null,
        guarantor_phone:  String(data.guarantorPhone ?? '').trim().slice(0, 40) || null,
      } : {}),
      pipeline_stage:       'applied',
      submitted_at:         new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    }

    // Reopened from the thank-you page: update that application (the email it was opened with must match it).
    // Otherwise upsert on email + room_id so clicking the link twice doesn't create duplicates.
    let existing: { id: string; pipeline_stage: string | null } | null = null
    if (data.editingId) {
      const { data: row } = await supabase.from('applicants').select('id, email, room_id, pipeline_stage').eq('id', data.editingId).maybeSingle()
      const r = row as any
      if (!r || r.room_id !== data.roomId || String(r.email ?? '').trim().toLowerCase() !== String(data.editingEmail ?? '').trim().toLowerCase()) {
        return Response.json({ error: 'We couldn’t match this to your application. Please email management@capitalrooms.co.uk.' }, { status: 403 })
      }
      if (!['invited', 'applied'].includes(String(r.pipeline_stage))) {
        return Response.json({ error: 'We’ve already started working on your application, so it can no longer be changed online. Please email management@capitalrooms.co.uk with any changes.' }, { status: 409 })
      }
      existing = { id: r.id, pipeline_stage: r.pipeline_stage }
    } else {
      // one applicant per email (lib/lettings/applicantRecord) — applying for another room moves their one record to it
      const row = await findApplicant(supabase, data.email)
      if (row) await moveToRoom(supabase, row, data.roomId, data.propertyId)
      existing = row as any
    }
    // never move an application backwards: once it's past "applied" (offer sent, referencing…), keep its stage
    if (existing && !['invited', 'applied', null, ''].includes(existing.pipeline_stage as any)) {
      delete (payload as any).pipeline_stage
      delete (payload as any).submitted_at
    }

    // employer and studies (17 Oct 2026 — university and course were asked but never saved). Kept under
    // applicant_profile.application, alongside what the document scans put there (never overwriting those).
    const application = {
      ...(String(data.company ?? '').trim() ? { company: String(data.company).trim().slice(0, 160) } : {}),
      ...(String(data.incomeDetails ?? '').trim() ? { income_details: String(data.incomeDetails).trim().slice(0, 600) } : {}),
      ...(data.student && typeof data.student === 'object' ? { student: true, university: String(data.student.university ?? '').trim().slice(0, 160) || null, course: String(data.student.course ?? '').trim().slice(0, 160) || null, year: String(data.student.year ?? '').trim().slice(0, 40) || null } : {}),
    }
    const { data: prof } = existing ? await supabase.from('applicants').select('applicant_profile').eq('id', existing.id).maybeSingle() : { data: null }
    ;(payload as any).applicant_profile = { ...(((prof as any)?.applicant_profile ?? {}) as object), application }

    let applicantId: string
    // before migration 202 the guarantor columns don't exist: save without them, keeping the details in the notes
    const withoutGuarantor = (p: Record<string, unknown>) => {
      const { guarantor_needed, guarantor_name, guarantor_email, guarantor_phone, ...rest } = p as any
      const note = guarantor_needed ? `Guarantor: ${guarantor_needed}${guarantor_name ? ` — ${guarantor_name}` : ''}${guarantor_phone ? `, ${guarantor_phone}` : ''}${guarantor_email ? `, ${guarantor_email}` : ''}` : ''
      return note ? { ...rest, admin_notes: note } : rest
    }
    const missingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /guarantor_/.test(e.message ?? ''))

    if (existing) {
      // Update the existing row (carries forward viewing_id, offer_id, etc.)
      let { error } = await supabase
        .from('applicants')
        .update(payload)
        .eq('id', existing.id)
      if (missingColumn(error)) ({ error } = await supabase.from('applicants').update(withoutGuarantor(payload)).eq('id', existing.id))

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
      let { data: created, error } = await supabase
        .from('applicants')
        .insert(insertPayload)
        .select('id')
        .single()
      if (missingColumn(error)) ({ data: created, error } = await supabase.from('applicants').insert(withoutGuarantor(insertPayload)).select('id').single())

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
      const title = existing ? '✏️ Application updated' : 'New offer received'
      const body = `${data.fullName} has ${existing ? 'updated their application' : 'applied'} for ${[isWholeLet(null, room?.name) ? '' : room?.name, room?.properties?.name].filter(Boolean).join(', ') || 'a room'}${below}.`
      await insertNotifications(supabase, ids, { title, body, type: 'lettings', link: '/admin/applicants' }, { propertyId: data.propertyId ?? null, roomId: data.roomId })
      await tryPush(ids, title, body, '/admin/applicants')

      // …and an email, so it never disappears inside CROS (Harry, 23 Oct 2026: "I need to get an email saying they have
      // either completed the offer or completed the offer and reserved the room too"). Reserving sends its own
      // "Holding deposit paid" email (confirm-deposit). Office addresses only — never a test account.
      const { data: office } = await supabase.from('people').select('email').in('role', ['administrator', 'lettings']).ilike('email', '%@capitalrooms.co.uk').not('email', 'ilike', '%+%')
      const to = [...new Set(((office ?? []) as any[]).map(p => String(p.email).toLowerCase()))]
      if (to.length) {
        const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
        const where = [isWholeLet(null, room?.name) ? '' : room?.name, room?.properties?.name].filter(Boolean).join(', ') || 'a room'
        const app = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
        const fast = data.fastTrack === true || (typeof data.offerToken === 'string' && !!(await supabase.from('offers').select('request_deposit').eq('application_token', data.offerToken).maybeSingle()).data?.request_deposit)
        const row = (k: string, v: unknown) => v ? `<tr><td style="padding:4px 0;color:#78716c;width:160px;">${k}</td><td style="padding:4px 0;">${esc(v)}</td></tr>` : ''
        await sendEmail(to, `${existing ? '✏️ Offer updated' : 'New offer'} — ${data.fullName}, ${where}${fast ? ' (fast-track: reserving next)' : ''}`, `
          <p>Hello,</p>
          <p><strong>${esc(data.fullName)}</strong> has ${existing ? 'updated their offer' : 'sent their offer'} for <strong>${esc(where)}</strong>${below ? esc(below) : ''}.</p>
          ${fast ? '<p>This was a <strong>fast-track</strong> invite, so they’re now being taken to pay the holding deposit. You’ll get a second email, “Holding deposit paid”, if they press I’ve paid.</p>' : '<p>Review it in Applicants, then send the reserve email if you accept.</p>'}
          <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:14px;">
            ${row('Email', data.email)}${row('Phone', data.phone)}${row('Move in', data.preferredStartDate)}${row('Plans to stay', data.preferredTerm)}${row('Job', data.profession)}
          </table>
          <p><a href="${app}/admin/applicants" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;">Open Applicants</a></p>`)
      }
    } catch (e) {
      console.error('apply: staff notification failed', e)
    }

    // their link came from an offer that asked for the holding deposit ("the search is over"): the form takes them on
    // to the reserve page, where "I've paid" tells us (23 Oct 2026 — they were left on the review page, paid by
    // transfer, and CROS never knew)
    let reserveNext = false
    if (typeof data.offerToken === 'string' && /^[0-9a-f]{20,128}$/i.test(data.offerToken)) {
      const { data: o } = await supabase.from('offers').select('request_deposit').eq('application_token', data.offerToken).maybeSingle()
      reserveNext = !!(o as any)?.request_deposit
    }
    return Response.json({ success: true, applicantId, reserveNext, message: 'Application submitted successfully' }, { status: 201 })
  } catch (err) {
    console.error('Error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

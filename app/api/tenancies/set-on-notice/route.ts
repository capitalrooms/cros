import { NextResponse } from 'next/server'
import { deliverEmail } from '@/lib/sendEmail'
import { hiName, personFromText } from '@/lib/people'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/portalAuth'
import { alertLettingsRoomUp } from '@/lib/lettings/roomAlert'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { buildEmail } from '@/lib/emailWrapper'
import { getTemplate, render } from '@/lib/messageTemplate'
import { regularCleanerId } from '@/lib/cleaners/regular'
import { moveOutEmail, moveOutFormPdf, prepareMoveOut } from '@/lib/checkout/moveOut'


const ukDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

async function sendEmail(to: string, subject: string, html: string, req: Request) {
  const key = process.env.RESEND_API_KEY
  if (!key) { console.warn('RESEND_API_KEY not set — email skipped'); return false }
  const res = await deliverEmail({ to, subject, html }, { req: req })
  if (!res.ok) { console.error('Resend error:', await res.text()); return false }
  return true
}

export async function POST(request: Request) {
  const caller = await requireStaff(request as any)
  if (!caller) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  // Use service client — this route is called from admin-only pages; service client
  // bypasses RLS and avoids the cookie-auth issue with the browser singleton client.
  const supabase = createServiceClient()

  try {
    const data = await request.json()
    const {
      tenancyId,
      moveOutDate,
      noticeReceivedDate,
      rentDueDay,
      emailTenant,
      tenantEmail,
      tenantName,
      emailCleaner,
      cleanerId,
      cleanerEmail,
      cleanerName,
      notesForLettings,
      roomId,
      propertyId,
      roomName,
      propertyAddress,
      proRataAmount,
      proRataDays,
      dailyRate,
      monthlyRent,
      pendingJobs,
      jobContractorId,
      newAskingRent,
    } = data

    if (!tenancyId || !moveOutDate || !roomId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Update tenancy
    const tenancyUpdate: Record<string, unknown> = {
      end_date: moveOutDate,
    }
    // "on notice" = notice recorded; without this date a notice looked the same as a fixed-term end date
    tenancyUpdate.notice_received_date = noticeReceivedDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    if (rentDueDay)         tenancyUpdate.rent_due_day = rentDueDay

    const { error: tenancyError } = await supabase
      .from('tenancies')
      .update(tenancyUpdate)
      .eq('id', tenancyId)

    if (tenancyError) { console.error('Error updating tenancy:', tenancyError); throw tenancyError }

    // 2. Update room status
    const { error: roomError } = await supabase
      .from('rooms')
      .update({ status: 'on_notice' })
      .eq('id', roomId)

    if (roomError) { console.error('Error updating room:', roomError); throw roomError }
    await alertLettingsRoomUp(supabase, roomId, { availableFrom: moveOutDate, why: 'Notice recorded — ready to market.' })

    // 2b. Update asking rent for remarketing (non-blocking — column may not exist yet)
    if (newAskingRent && !isNaN(Number(newAskingRent)) && Number(newAskingRent) > 0) {
      await supabase
        .from('rooms')
        .update({ current_asking_rent: Number(newAskingRent) })
        .eq('id', roomId)
        .then(({ error }) => { if (error) console.warn('Could not update current_asking_rent (non-blocking):', error.message) })
    }

    // 3. Notes for lettings team
    if (notesForLettings) {
      const { error: notesError } = await supabase
        .from('room_notes')
        .insert([{
          room_id: roomId,
          content: notesForLettings,
          note_type: 'admin_notes',
        }])
      if (notesError) console.error('Error adding room notes:', notesError) // non-blocking
    }

    // 3b. Create maintenance jobs raised at checkout
    if (Array.isArray(pendingJobs) && pendingJobs.length > 0) {
      const jobRows = pendingJobs
        .filter((j: unknown) => typeof j === 'string' && j.trim())
        .map((title: string) => ({
          title: title.trim(),
          description: `Raised at checkout — ${moveOutDate ? `move-out ${moveOutDate}` : 'tenant on notice'}.`,
          category: 'Maintenance',
          priority: 'medium',
          status: 'reported',
          ...(roomId        ? { room_id:       roomId }        : {}),
          ...(propertyId    ? { property_id:   propertyId }    : {}),
          ...(jobContractorId ? { contractor_id: jobContractorId } : {}),
        }))
      const { error: jobsError } = await supabase.from('maintenance_tickets').insert(jobRows)
      if (jobsError) console.error('Error creating checkout jobs:', jobsError) // non-blocking
    }

    // Load the cleaner's checkout template (graceful fallback)
    const cleanerCheckoutTpl = await getTemplate('checkout-cleaner-headsup')

    // 4. The tenant's move-out email, with the fillable move-out form attached (lib/checkout/moveOut, 29 Oct 2026 —
    //    the stored template was one line). A whole home (single let) gets the whole-property version.
    let tenantEmailSent = false
    if (emailTenant && tenantEmail) {
      const m = await prepareMoveOut(supabase, { tenancyId, moveOutDate, tenantName, proRataAmount, proRataDays, roomName, propertyAddress })
      const { subject, html } = moveOutEmail(m)
      const form = await moveOutFormPdf(m).catch(e => { console.error('move-out form failed:', e); return null })
      const res = await deliverEmail({
        to: tenantEmail, subject, html: await buildEmail(html, { req: request }),
        attachments: form ? [{ filename: 'Move-out form.pdf', content: form.toString('base64') }] : undefined,
      }, { req: request })
      tenantEmailSent = res.ok
      if (!res.ok) console.error('Resend error:', await res.text().catch(() => ''))
      if (tenantEmailSent) {
        await supabase.from('tenancies').update({ checkout_confirmation_sent_at: new Date().toISOString() }).eq('id', tenancyId)
      }
    }

    // 5. Always create an assigned_jobs record for admin visibility.
    //    cleaner_id is null when no cleaner picked (admin assigns later from /admin/cleaner-jobs).
    let cleanerEmailSent = false
    if (roomId && propertyId) {
      const daysUntilMoveOut = moveOutDate
        ? Math.ceil((new Date(moveOutDate + 'T12:00:00').getTime() - Date.now()) / 86400000)
        : 99
      const taskType = daysUntilMoveOut <= 3 ? 'asap' : daysUntilMoveOut <= 7 ? 'urgent' : 'normal'
      // one move-out clean per room and move-out — marking on notice again (or changing the date) updates it
      // rather than adding a second (21 Oct 2026: 208 Rotherhithe Street Room 5 had two)
      const ukMoveOut = moveOutDate ? new Date(`${moveOutDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'TBC'
      const job = {
        // the one picked here, else the house's regular cleaner (migration 243); null = unassigned, picked on Cleaning
        cleaner_id: cleanerId || (await regularCleanerId(supabase as any, propertyId)) || null,
        property_id: propertyId,
        room_id: roomId,
        task_type: taskType,
        status: 'pending',
        due_date: moveOutDate || null,
        notes: `Move-out clean — ${roomName || 'room'} — tenant moves out ${ukMoveOut}.`,
      }
      const { data: open } = await supabase.from('assigned_jobs').select('id').eq('room_id', roomId).eq('status', 'pending').ilike('notes', 'Move-out clean%').limit(1).maybeSingle()
      const { error: jobError } = open
        ? await supabase.from('assigned_jobs').update(job).eq('id', (open as any).id)
        : await supabase.from('assigned_jobs').insert(job)
      if (jobError) console.error('Error creating assigned job:', jobError) // non-blocking
    }

    // 5b. Email the cleaner (only when "Notify cleaner" ticked AND a cleaner was picked)
    if (emailCleaner && cleanerId) {
      if (cleanerEmail) {
        const cleanerEmailHtml = await buildEmail(cleanerEmailBody({
          cleanerName: cleanerName || '',
          roomName: roomName || 'Room',
          propertyAddress: propertyAddress || '',
          moveOutDate,
        }), { req: request })
        const cleanerSubject = cleanerCheckoutTpl?.subject_line
          ? render(cleanerCheckoutTpl.subject_line, {
              room_name: roomName || 'Room',
              property_address: propertyAddress || 'property',
              move_out_date: moveOutDate,
              cleaner_name: cleanerName || 'Cleaner',
              clean_date: '',
            })
          : `Move-out coming up — ${roomName || 'Room'} at ${propertyAddress || 'property'}`
        cleanerEmailSent = await sendEmail(cleanerEmail, cleanerSubject, cleanerEmailHtml, request)
      }
    }

    // 6. Audit record
    await supabase
      .from('audit_logs')
      .insert([{
        action: 'tenancy_on_notice',
        table_name: 'tenancies',
        record_id: tenancyId,
        details: JSON.stringify({
          moveOutDate,
          noticeReceivedDate,
          rentDueDay,
          proRataAmount,
          proRataDays,
          dailyRate,
          monthlyRent,
          emailsSent: { tenant: tenantEmailSent, cleaner: cleanerEmailSent },
        }),
      }])
      .then(({ error }) => { if (error) console.error('Audit record error:', error) })

    // the letting file's activity
    await logTenancyEvent(supabase, tenancyId, 'notice',
      `Notice recorded (received ${ukDay(noticeReceivedDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }))}), moving out ${ukDay(moveOutDate)}${tenantEmailSent ? ' · checkout email sent to the tenant' : ' · no email to the tenant'}${cleanerEmailSent ? ' · cleaner told' : ''}`, caller.email)

    return Response.json({
      success: true,
      message: 'Tenancy marked as on notice',
      emailsSent: { tenant: tenantEmailSent, cleaner: cleanerEmailSent },
    })
  } catch (err) {
    console.error('Error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// ── Cleaner notification email body (wrapper applied by buildEmail) ───────────
function cleanerEmailBody(data: {
  cleanerName: string; roomName: string; propertyAddress: string; moveOutDate: string
}): string {
  const moveOutFormatted = new Date(data.moveOutDate + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return `
    <p style="margin:0 0 16px">Hi ${hiName(personFromText(data.cleanerName))},</p>
    <p style="margin:0 0 16px">A room will need cleaning after the current tenant moves out. Details below — please confirm your availability as soon as possible.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
      <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600;width:40%;background:#f9fafb">Room</td>
          <td style="padding:10px 12px;border:1px solid #e5e7eb">${data.roomName}</td></tr>
      <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Property</td>
          <td style="padding:10px 12px;border:1px solid #e5e7eb">${data.propertyAddress}</td></tr>
      <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Tenant moves out</td>
          <td style="padding:10px 12px;border:1px solid #e5e7eb">${moveOutFormatted}</td></tr>
    </table>
    <p style="margin:0">Please reply to this email or contact us directly to confirm your availability.</p>`
}

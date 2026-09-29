import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/portalAuth'
import { buildEmail } from '@/lib/emailWrapper'
import { getTemplate, render } from '@/lib/messageTemplate'
import { senderFields } from '@/lib/email/sender'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

async function sendEmail(to: string, subject: string, html: string, req: Request) {
  const key = process.env.RESEND_API_KEY
  if (!key) { console.warn('RESEND_API_KEY not set — email skipped'); return false }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...(await senderFields(req)), to, subject, html }),
  })
  if (!res.ok) { console.error('Resend error:', await res.text()); return false }
  return true
}

export async function POST(request: Request) {
  if (!(await requireStaff(request as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      checkoutEmailHtml,
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
    tenancyUpdate.notice_received_date = noticeReceivedDate || new Date().toISOString().slice(0, 10)
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

    // Load checkout templates (graceful fallback)
    const [tenantCheckoutTpl, cleanerCheckoutTpl] = await Promise.all([
      getTemplate('checkout-tenant-notice'),
      getTemplate('checkout-cleaner-headsup'),
    ])

    // 4. Send checkout email to tenant
    let tenantEmailSent = false
    if (emailTenant && tenantEmail) {
      const tenantSubject = tenantCheckoutTpl?.subject_line
        ? render(tenantCheckoutTpl.subject_line, { move_out_date: moveOutDate, tenant_name: tenantName || '' })
        : 'Your notice period has been recorded — Capital Rooms'

      // Prefer DB template body (enables admin to edit heading/content via WYSIWYG)
      // Fallback to pre-built checkoutEmailHtml from frontend
      let tenantHtml: string | null = null
      if (tenantCheckoutTpl?.template_text) {
        const moveOutFormatted = new Date(moveOutDate + 'T12:00:00').toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })
        const tplVars: Record<string, string> = {
          heading: 'Sorry To See You Go!',
          tenant_name: tenantName || '',
          move_out_date: moveOutFormatted,
          pro_rata_amount: proRataAmount != null ? `£${proRataAmount}` : '',
        }
        tenantHtml = await buildEmail(render(tenantCheckoutTpl.template_text, tplVars), { req: request })
      } else if (checkoutEmailHtml) {
        // Already fully wrapped by buildCheckoutEmail() on the frontend
        tenantHtml = checkoutEmailHtml
      }

      if (tenantHtml) {
        tenantEmailSent = await sendEmail(tenantEmail, tenantSubject, tenantHtml, request)
        // Mark confirmation email sent
        if (tenantEmailSent) {
          await supabase
            .from('tenancies')
            .update({ checkout_confirmation_sent_at: new Date().toISOString() })
            .eq('id', tenancyId)
        }
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
      const { error: jobError } = await supabase.from('assigned_jobs').insert({
        cleaner_id: cleanerId || null,   // null = unassigned; admin can pick from cleaner-jobs page
        property_id: propertyId,
        room_id: roomId,
        task_type: taskType,
        status: 'pending',
        due_date: moveOutDate || null,
        notes: `Move-out clean — ${roomName || 'room'} — tenant moves out ${moveOutDate || 'TBC'}.`,
      })
      if (jobError) console.error('Error creating assigned job:', jobError) // non-blocking
    }

    // 5b. Email the cleaner (only when "Notify cleaner" ticked AND a cleaner was picked)
    if (emailCleaner && cleanerId) {
      if (cleanerEmail) {
        const cleanerEmailHtml = await buildEmail(cleanerEmailBody({
          cleanerName: cleanerName || 'Cleaner',
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
    <p style="margin:0 0 16px">Hi ${data.cleanerName},</p>
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

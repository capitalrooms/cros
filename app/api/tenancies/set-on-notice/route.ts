import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { buildEmail, FROM } from '@/lib/emailWrapper'
import { getTemplate, render } from '@/lib/messageTemplate'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) { console.warn('RESEND_API_KEY not set — email skipped'); return false }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) { console.error('Resend error:', await res.text()); return false }
  return true
}

export async function POST(request: Request) {
  const supabase = createClient()

  try {
    const user = await getCurrentUser()
    if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

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
      roomName,
      propertyAddress,
      proRataAmount,
      proRataDays,
      dailyRate,
      monthlyRent,
    } = data

    if (!tenancyId || !moveOutDate || !roomId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Update tenancy
    const tenancyUpdate: Record<string, unknown> = {
      status: 'on_notice',
      end_date: moveOutDate,
    }
    if (noticeReceivedDate) tenancyUpdate.notice_received_date = noticeReceivedDate
    if (rentDueDay)         tenancyUpdate.rent_due_day = rentDueDay

    const { error: tenancyError } = await supabase
      .from('tenancies')
      .update(tenancyUpdate)
      .eq('id', tenancyId)

    if (tenancyError) { console.error('Error updating tenancy:', tenancyError); throw tenancyError }

    // 2. Update room status
    const roomUpdate: Record<string, unknown> = { status: 'on_notice' }

    const { error: roomError } = await supabase
      .from('rooms')
      .update(roomUpdate)
      .eq('id', roomId)

    if (roomError) { console.error('Error updating room:', roomError); throw roomError }

    // 3. Notes for lettings team
    if (notesForLettings) {
      const { error: notesError } = await supabase
        .from('room_notes')
        .insert([{
          room_id: roomId,
          content: notesForLettings,
          created_by: user.user.id,
          note_type: 'admin_notes',
        }])
      if (notesError) console.error('Error adding room notes:', notesError) // non-blocking
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
        tenantHtml = await buildEmail(render(tenantCheckoutTpl.template_text, tplVars))
      } else if (checkoutEmailHtml) {
        // Already fully wrapped by buildCheckoutEmail() on the frontend
        tenantHtml = checkoutEmailHtml
      }

      if (tenantHtml) {
        tenantEmailSent = await sendEmail(tenantEmail, tenantSubject, tenantHtml)
        // Mark confirmation email sent
        if (tenantEmailSent) {
          await supabase
            .from('tenancies')
            .update({ checkout_confirmation_sent_at: new Date().toISOString() })
            .eq('id', tenancyId)
        }
      }
    }

    // 5. Send cleaner notification
    let cleanerEmailSent = false
    if (emailCleaner && cleanerId && cleanerEmail) {
      const cleanerEmailHtml = await buildEmail(cleanerEmailBody({
        cleanerName: cleanerName || 'Cleaner',
        roomName: roomName || 'Room',
        propertyAddress: propertyAddress || '',
        moveOutDate,
      }))
      const cleanerSubject = cleanerCheckoutTpl?.subject_line
        ? render(cleanerCheckoutTpl.subject_line, {
            room_name: roomName || 'Room',
            property_address: propertyAddress || 'property',
            move_out_date: moveOutDate,
            cleaner_name: cleanerName || 'Cleaner',
            clean_date: '',
          })
        : `Move-out coming up — ${roomName || 'Room'} at ${propertyAddress || 'property'}`
      cleanerEmailSent = await sendEmail(cleanerEmail, cleanerSubject, cleanerEmailHtml)
    }

    // 6. Audit record
    await supabase
      .from('notifications')
      .insert([{
        type: 'tenancy_on_notice',
        user_id: user.user.id,
        related_table: 'tenancies',
        related_id: tenancyId,
        data: {
          moveOutDate,
          noticeReceivedDate,
          rentDueDay,
          proRataAmount,
          proRataDays,
          dailyRate,
          monthlyRent,
          emailsSent: { tenant: tenantEmailSent, cleaner: cleanerEmailSent },
        },
      }])
      .then(({ error }) => { if (error) console.error('Notification record error:', error) })

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

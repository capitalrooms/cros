import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { FROM } from '@/lib/emailTemplate'
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
      newAskingRent,
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
      daysInMonth,
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

    // 2. Update room status + optional new asking rent
    const roomUpdate: Record<string, unknown> = { status: 'on_notice' }
    if (newAskingRent) roomUpdate.current_asking_rent = newAskingRent

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
    if (emailTenant && tenantEmail && checkoutEmailHtml) {
      const tenantSubject = tenantCheckoutTpl?.subject_line
        ? render(tenantCheckoutTpl.subject_line, { move_out_date: moveOutDate })
        : 'Your notice period has been recorded — Capital Rooms'
      tenantEmailSent = await sendEmail(tenantEmail, tenantSubject, checkoutEmailHtml)

      // Mark confirmation email sent
      if (tenantEmailSent) {
        await supabase
          .from('tenancies')
          .update({ checkout_confirmation_sent_at: new Date().toISOString() })
          .eq('id', tenancyId)
      }
    }

    // 5. Send cleaner notification
    let cleanerEmailSent = false
    if (emailCleaner && cleanerId && cleanerEmail) {
      const cleanerEmailHtml = buildCleanerNotificationEmail({
        cleanerName: cleanerName || 'Cleaner',
        roomName: roomName || 'Room',
        propertyAddress: propertyAddress || '',
        moveOutDate,
        urgency: 'standard',
      })
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
          daysInMonth,
          monthlyRent,
          newAskingRent,
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

// ── Cleaner notification email ────────────────────────────────────────────────
function buildCleanerNotificationEmail(data: {
  cleanerName: string; roomName: string; propertyAddress: string
  moveOutDate: string; urgency: string
}): string {
  const moveOutFormatted = new Date(data.moveOutDate).toLocaleDateString('en-GB', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  })
  return `<!DOCTYPE html><html><head><style>
    body{font-family:Arial,sans-serif;color:#333}
    .container{max-width:600px;margin:0 auto}
    .header{background:#86284a;color:white;padding:20px}
    .content{padding:20px}
    .section{margin:20px 0;padding:15px;background:#f5f5f5;border-radius:4px}
  </style></head><body><div class="container">
    <div class="header"><h2>Cleaning Required — ${data.roomName}</h2></div>
    <div class="content">
      <p>Hi ${data.cleanerName},</p>
      <p>A room will need cleaning after the current tenant moves out.</p>
      <div class="section">
        <h3>Details</h3>
        <p><strong>Room:</strong> ${data.roomName}</p>
        <p><strong>Property:</strong> ${data.propertyAddress}</p>
        <p><strong>Tenant moves out:</strong> ${moveOutFormatted}</p>
      </div>
      <p>Please confirm your availability.</p>
      <p>Best regards,<br/>Capital Rooms</p>
    </div>
  </div></body></html>`
}

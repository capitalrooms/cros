import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { FROM } from '@/lib/emailTemplate'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) { console.warn('RESEND_API_KEY not set — email skipped'); return false }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error:', err)
    return false
  }
  return true
}

export async function POST(request: Request) {
  const supabase = createClient()

  try {
    // Check authorization
    const user = await getCurrentUser()
    if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const data = await request.json()
    const {
      tenancyId,
      moveOutDate,
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
    } = data

    // Validate input
    if (!tenancyId || !moveOutDate || !roomId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Update tenancy to "on_notice" with end_date
    const { error: tenancyError } = await supabase
      .from('tenancies')
      .update({
        status: 'on_notice',
        end_date: moveOutDate,
      })
      .eq('id', tenancyId)

    if (tenancyError) {
      console.error('Error updating tenancy:', tenancyError)
      throw tenancyError
    }

    // 2. Update room to "on_notice" status and new asking rent if provided
    const roomUpdate: any = { status: 'on_notice' }
    if (newAskingRent) {
      roomUpdate.current_asking_rent = newAskingRent
    }

    const { error: roomError } = await supabase
      .from('rooms')
      .update(roomUpdate)
      .eq('id', roomId)

    if (roomError) {
      console.error('Error updating room:', roomError)
      throw roomError
    }

    // 3. Add notes to room if provided
    if (notesForLettings) {
      const { error: notesError } = await supabase
        .from('room_notes')
        .insert([
          {
            room_id: roomId,
            content: notesForLettings,
            created_by: user.user.id,
            note_type: 'admin_notes',
          },
        ])

      if (notesError) {
        console.error('Error adding room notes:', notesError)
        // Don't throw - notes are optional
      }
    }

    // 4. Send checkout email to tenant
    let tenantEmailSent = false
    if (emailTenant && tenantEmail && checkoutEmailHtml) {
      tenantEmailSent = await sendEmail(
        tenantEmail,
        'Your notice period has been recorded — Capital Rooms',
        checkoutEmailHtml,
      )
    }

    // 5. Send notification email to cleaner
    let cleanerEmailSent = false
    if (emailCleaner && cleanerId && cleanerEmail) {
      const cleanerEmailHtml = buildCleanerNotificationEmail({
        cleanerName: cleanerName || 'Cleaner',
        roomName: data.roomName || 'Room',
        propertyAddress: data.propertyAddress || '',
        moveOutDate,
        moveInDate: new Date(moveOutDate).toISOString().split('T')[0],
        urgency: 'standard',
      })
      cleanerEmailSent = await sendEmail(
        cleanerEmail,
        `Move-out coming up — ${data.roomName || 'Room'} at ${data.propertyAddress || 'property'}`,
        cleanerEmailHtml,
      )
    }

    // 6. Create notification record for tracking
    await supabase
      .from('notifications')
      .insert([
        {
          type: 'tenancy_on_notice',
          user_id: user.user.id,
          related_table: 'tenancies',
          related_id: tenancyId,
          data: {
            moveOutDate,
            newAskingRent,
            emailsSent: {
              tenant: tenantEmailSent,
              cleaner: cleanerEmailSent,
            },
          },
        },
      ])
      .then(({ error }) => {
        if (error) console.error('Error creating notification record:', error)
      })

    return Response.json({
      success: true,
      message: 'Tenancy marked as on notice',
      emailsSent: {
        tenant: tenantEmailSent,
        cleaner: cleanerEmailSent,
      },
    })
  } catch (err) {
    console.error('Error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// Simple cleaner notification email template
function buildCleanerNotificationEmail(data: {
  cleanerName: string
  roomName: string
  propertyAddress: string
  moveOutDate: string
  moveInDate: string
  urgency: string
}): string {
  const moveOutFormatted = new Date(data.moveOutDate).toLocaleDateString('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #86284a; color: white; padding: 20px; }
    .content { padding: 20px; }
    .section { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Cleaning Required - ${data.roomName}</h2>
    </div>
    <div class="content">
      <p>Hi ${data.cleanerName},</p>
      <p>A room under our management will need cleaning after the current tenant moves out.</p>

      <div class="section">
        <h3>Cleaning Details</h3>
        <p><strong>Room:</strong> ${data.roomName}</p>
        <p><strong>Property:</strong> ${data.propertyAddress}</p>
        <p><strong>Tenant Moves Out:</strong> ${moveOutFormatted}</p>
        <p><strong>Target Clean Date:</strong> ${new Date(new Date(data.moveOutDate).getTime() + 86400000).toLocaleDateString('en-GB')}</p>
        <p><strong>Urgency:</strong> ${data.urgency === 'standard' ? 'Standard' : 'Urgent'}</p>
      </div>

      <p>Please confirm your availability and let us know your proposed cleaning date.</p>
      <p>Best regards,<br/>Capital Rooms</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

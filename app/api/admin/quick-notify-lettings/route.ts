import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const {
      property_id,
      subject,
      message,
      selector_type,
      viewing_id,
      viewing_period_start,
      viewing_period_end,
      new_arrival_time
    } = await request.json()

    const supabase = createClient()

    // Get current user
    const {
      data: { user }
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get property tenants
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select('person_id, people(email)')
      .eq('property_id', property_id)
      .or('end_date.is.null,status.eq.on_notice')

    if (!tenancies) {
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
    }

    // Get viewing details if needed (for variable substitution)
    let viewingData = null
    if (viewing_id) {
      const { data } = await supabase
        .from('viewings')
        .select('room_id, viewing_date, viewing_slot, visitor_name, rooms(name)')
        .eq('id', viewing_id)
        .single()
      viewingData = data
    }

    // Build recipient list
    const recipients = tenancies
      .filter((t) => (t.people as any)?.email)
      .map((t) => ({
        email: (t.people as any).email,
        person_id: t.person_id
      }))

    // Substitute template variables
    let finalMessage = message
    let finalSubject = subject

    if (viewingData && (selector_type === 'single' || selector_type === 'running_late')) {
      const roomName = (viewingData.rooms as any)?.name || 'Room'
      const dateStr = new Date(viewingData.viewing_date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })

      finalMessage = finalMessage
        .replace(/{{room_name}}/g, roomName)
        .replace(/{{date}}/g, dateStr)
        .replace(/{{time}}/g, viewingData.viewing_slot)
        .replace(/{{new_time}}/g, new_arrival_time || viewingData.viewing_slot)

      finalSubject = finalSubject
        .replace(/{{room_name}}/g, roomName)
        .replace(/{{date}}/g, dateStr)
        .replace(/{{time}}/g, viewingData.viewing_slot)
    }

    if (selector_type === 'period_notice') {
      finalMessage = finalMessage
        .replace(/{{time_period}}/g, `${viewing_period_start}-${viewing_period_end}`)

      finalSubject = finalSubject
        .replace(/{{time_period}}/g, `${viewing_period_start}-${viewing_period_end}`)
    }

    // Send notifications (via notification system)
    const { data: template } = await supabase
      .from('notification_templates')
      .select('id')
      .eq('name', 'Running Late - Select Viewing')
      .single()

    // Create notifications record for each recipient
    for (const recipient of recipients) {
      await supabase.from('notifications').insert({
        person_id: recipient.person_id,
        property_id,
        subject: finalSubject,
        message: finalMessage,
        notification_type: 'lettings',
        sent_via: 'email',
        created_by: user.id
      })
    }

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${recipients.length} tenant(s)`
    })
  } catch (error) {
    console.error('Error sending lettings notification:', error)
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    )
  }
}

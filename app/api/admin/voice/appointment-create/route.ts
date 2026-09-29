import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/adminAuth'
import { AppointmentCreateDetails } from '@/lib/voice/actions/appointmentCreate'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const details = (await req.json()) as AppointmentCreateDetails

  if (!details.title || !details.dateStr || !details.timeStr) {
    return NextResponse.json(
      { error: 'Title, date, and time required' },
      { status: 400 }
    )
  }

  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Parse date/time
    // Handle "tomorrow", "next Monday", etc. by converting to YYYY-MM-DD
    let dateStr = details.dateStr
    if (dateStr.toLowerCase() === 'tomorrow') {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      dateStr = tomorrow.toISOString().split('T')[0]
    } else if (dateStr.match(/^next\s+\w+/i)) {
      // "next Monday" → calculate next occurrence
      const dayName = dateStr.split(' ')[1].toLowerCase()
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const dayIndex = days.indexOf(dayName)
      if (dayIndex >= 0) {
        const today = new Date()
        const currentDay = today.getDay()
        let daysAhead = dayIndex - currentDay
        if (daysAhead <= 0) daysAhead += 7
        const targetDate = new Date(today.setDate(today.getDate() + daysAhead))
        dateStr = targetDate.toISOString().split('T')[0]
      }
    }

    // Parse time: "3:30pm" → "15:30", "3:30" → "15:30", "15:30" → "15:30"
    let timeStr = details.timeStr.toLowerCase()
    if (timeStr.includes('pm') || timeStr.includes('am')) {
      const match = timeStr.match(/(\d+):?(\d{0,2})\s*(am|pm)/)
      if (match) {
        let hour = parseInt(match[1])
        const min = (match[2] || '0').padStart(2, '0')
        const period = match[3]
        if (period === 'pm' && hour !== 12) hour += 12
        if (period === 'am' && hour === 12) hour = 0
        timeStr = `${String(hour).padStart(2, '0')}:${min}`
      }
    } else if (!timeStr.includes(':')) {
      // "3pm" → "15:00"
      const match = timeStr.match(/(\d+)\s*(am|pm)/)
      if (match) {
        let hour = parseInt(match[1])
        const period = match[2]
        if (period === 'pm' && hour !== 12) hour += 12
        if (period === 'am' && hour === 12) hour = 0
        timeStr = `${String(hour).padStart(2, '0')}:00`
      }
    }

    // Validate date format
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    // Validate time format
    if (!timeStr.match(/^\d{2}:\d{2}$/)) {
      return NextResponse.json({ error: 'Invalid time format' }, { status: 400 })
    }

    // If propertyId not provided but propertyName is, look it up
    let propertyId = details.propertyId
    if (!propertyId && details.propertyName) {
      const { data: prop } = await supabase
        .from('properties')
        .select('id')
        .or(`name.ilike.%${details.propertyName}%`)
        .limit(1)
        .single()

      if (!prop) {
        return NextResponse.json(
          { error: `Property not found: ${details.propertyName}` },
          { status: 404 }
        )
      }
      propertyId = prop.id
    }

    if (!propertyId) {
      return NextResponse.json(
        { error: 'Property ID or name required' },
        { status: 400 }
      )
    }

    // Create appointment
    const { data: appt, error: apptErr } = await supabase
      .from('admin_appointments')
      .insert({
        property_id: propertyId,
        room_id: details.roomId || null,
        title: details.title,
        appointment_date: dateStr,
        appointment_time: timeStr,
        appointment_type: details.type || 'viewing',
        description: details.description || null,
      })
      .select('id, title, appointment_date, appointment_time')
      .single()

    if (apptErr) {
      return NextResponse.json({ error: apptErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      appointment: appt,
      message: `Appointment created: ${details.title} on ${dateStr} at ${timeStr}`,
    })
  } catch (e) {
    console.error('Appointment create error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { insertNotifications, activeTenantIds, tryPush } from '@/lib/serverNotify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Notify a property's tenants about a viewing (running late, rescheduled, or a
 * general period notice). Uses the service-role client so it doesn't depend on
 * the caller's session, and writes the real notifications columns via the
 * shared helper.
 */
export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })

  const {
    property_id,
    subject,
    message,
    selector_type,
    viewing_id,
    viewing_period_start,
    viewing_period_end,
    new_arrival_time,
  } = await request.json()

  if (!property_id || !subject || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  })

  try {
    // Optional viewing details for {{...}} substitution.
    let viewingData: any = null
    if (viewing_id) {
      const { data } = await service
        .from('viewings')
        .select('room_id, viewing_date, viewing_slot, visitor_name, rooms(name)')
        .eq('id', viewing_id)
        .maybeSingle()
      viewingData = data
    }

    let finalSubject = subject
    let finalMessage = message

    if (viewingData && (selector_type === 'single' || selector_type === 'running_late')) {
      const roomName = viewingData.rooms?.name || 'Room'
      const dateStr = new Date(viewingData.viewing_date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      const sub = (s: string) =>
        s
          .replace(/{{room_name}}/g, roomName)
          .replace(/{{date}}/g, dateStr)
          .replace(/{{time}}/g, viewingData.viewing_slot || '')
          .replace(/{{new_time}}/g, new_arrival_time || viewingData.viewing_slot || '')
      finalSubject = sub(finalSubject)
      finalMessage = sub(finalMessage)
    }

    if (selector_type === 'period_notice') {
      const period = `${viewing_period_start}-${viewing_period_end}`
      finalSubject = finalSubject.replace(/{{time_period}}/g, period)
      finalMessage = finalMessage.replace(/{{time_period}}/g, period)
    }

    const recipientIds = await activeTenantIds(service, property_id)
    if (recipientIds.length === 0) {
      return NextResponse.json({ success: true, message: 'No current tenants to notify' })
    }

    const { count, error } = await insertNotifications(service, recipientIds, {
      title: finalSubject,
      body: finalMessage,
      type: 'lettings',
      link: '/tenant',
    }, { propertyId: property_id, roomId: viewingData?.room_id || null })
    if (error) return NextResponse.json({ error: `Failed to send notification: ${error}` }, { status: 500 })

    await tryPush(recipientIds, finalSubject, finalMessage, '/tenant')

    return NextResponse.json({ success: true, message: `Notification sent to ${count} tenant(s)` })
  } catch (error) {
    console.error('Error sending lettings notification:', error)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}

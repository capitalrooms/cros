import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const { property_id, subject, message, recipient_type, room_id, person_id } = await req.json()

  if (!property_id || !subject || !message || !recipient_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  try {
    // Get property first
    const { data: property, error: propErr } = await serviceClient
      .from('properties')
      .select('id')
      .eq('id', property_id)
      .single()

    if (propErr || !property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // Get recipients based on type
    let recipientIds: string[] = []

    if (recipient_type === 'all_tenants') {
      // Get all current tenants in property
      const { data: tenancies } = await serviceClient
        .from('tenancies')
        .select('person_id')
        .eq('property_id', property_id)
        .is('end_date', null)

      recipientIds = tenancies?.map(t => t.person_id) || []
    } else if (recipient_type === 'room' && room_id) {
      // Get current tenant in room
      const { data: tenancies } = await serviceClient
        .from('tenancies')
        .select('person_id')
        .eq('room_id', room_id)
        .is('end_date', null)

      recipientIds = tenancies?.map(t => t.person_id) || []
    } else if (recipient_type === 'individual' && person_id) {
      recipientIds = [person_id]
    } else if (recipient_type === 'cleaners') {
      // Get cleaners assigned to property
      const { data: staff } = await serviceClient
        .from('people')
        .select('id')
        .eq('role', 'cleaner')

      recipientIds = staff?.map(s => s.id) || []
    }

    // Create notifications for each recipient
    const notifications = recipientIds.map(recipient_id => ({
      property_id,
      recipient_id,
      notification_type: 'admin_communication',
      title: subject,
      message: message,
      recipient_type: recipient_type,
      status: 'sent'
    }))

    if (notifications.length === 0) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
    }

    const { error: notifErr } = await serviceClient
      .from('notifications')
      .insert(notifications)

    if (notifErr) {
      console.error('Notification error:', notifErr)
      return NextResponse.json({ error: 'Failed to create notifications' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: `Notification sent to ${notifications.length} recipient(s)`
    })
  } catch (error) {
    console.error('Quick notify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

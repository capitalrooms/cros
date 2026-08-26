import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { insertNotifications, activeTenantIds, tryPush } from '@/lib/serverNotify'

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

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  try {
    let recipientIds: string[] = []

    if (recipient_type === 'all_tenants') {
      recipientIds = await activeTenantIds(service, property_id)
    } else if (recipient_type === 'room' && room_id) {
      recipientIds = await activeTenantIds(service, property_id, room_id)
    } else if (recipient_type === 'individual' && person_id) {
      recipientIds = [person_id]
    } else if (recipient_type === 'cleaners') {
      const { data: staff } = await service.from('people').select('id').eq('role', 'cleaner')
      recipientIds = (staff || []).map((s: any) => s.id)
    }

    if (recipientIds.length === 0) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
    }

    const { count, error } = await insertNotifications(service, recipientIds, {
      title: subject,
      body: message,
      type: 'admin',
      link: '/tenant',
    }, { propertyId: property_id, roomId: room_id || null })
    if (error) {
      console.error('Notification insert error:', error)
      return NextResponse.json({ error: `Failed to create notifications: ${error}` }, { status: 500 })
    }

    await tryPush(recipientIds, subject, message, '/tenant')

    return NextResponse.json({ ok: true, message: `Notification sent to ${count} recipient(s)` })
  } catch (error) {
    console.error('Quick notify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

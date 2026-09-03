import { createClient } from '@supabase/supabase-js'
import { insertNotifications, activeTenantIds, tryPush, tryEmailFallback } from '@/lib/serverNotify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cleaner → house notification (running late, issue found, etc.). Uses the
 * service-role client + shared helper so it writes the real notifications
 * columns and doesn't depend on a server-visible session.
 */
export async function POST(request: Request) {
  try {
    const { property_id, subject, message, notification_type } = await request.json()

    if (!property_id || !subject || !message) {
      return Response.json({ error: 'Missing required fields: property_id, subject, message' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })

    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { persistSession: false },
    })

    const recipientIds = await activeTenantIds(service, property_id)
    if (recipientIds.length === 0) {
      return Response.json({ error: 'No active tenants found for this property' }, { status: 404 })
    }

    const { count, error } = await insertNotifications(service, recipientIds, {
      title: subject,
      body: message,
      type: notification_type || 'cleaner',
      link: '/tenant',
    }, { propertyId: property_id })
    if (error) {
      console.error('Error inserting notifications:', error)
      return Response.json({ error: `Failed to send notifications: ${error}` }, { status: 500 })
    }

    await tryPush(recipientIds, subject, message, '/tenant')
    await tryEmailFallback(service, recipientIds, { title: subject, body: message, link: '/tenant' })

    return Response.json({ success: true, message: `Notification sent to ${count} tenant(s)`, tenant_count: count })
  } catch (error) {
    console.error('Error in /api/cleaner/quick-notify:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

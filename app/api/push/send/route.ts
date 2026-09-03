import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase'
import webpush from 'web-push'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateEmail, validateUUID } from '@/lib/validation'
import { getCommsLive } from '@/lib/comms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let configured = false
function configure() {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@capitalrooms.co.uk', pub, priv)
  configured = true
  return true
}

/**
 * Send a push to a target: one person (personId or email), a whole role, or all.
 * Body: { personId?, email?, role?, toAll?, title, body, url?, tag?, actions?, actionUrls? }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized push/send access', ipAddress: getClientIp(req.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!configure()) {
    return NextResponse.json({ error: 'Push not configured (VAPID keys missing)' }, { status: 500 })
  }
  try {
    const { personId, email, role, propertyId, roomId, toAll, title, body, url, tag, actions, actionUrls } =
      await req.json()

    // Validate inputs
    if (personId && !validateUUID(personId)) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid personId: ${personId}`, ipAddress: getClientIp(req.headers) })
      return NextResponse.json({ error: 'Invalid personId format' }, { status: 400 })
    }
    if (email && !validateEmail(email)) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid email: ${email}`, ipAddress: getClientIp(req.headers) })
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
    if (propertyId && !validateUUID(propertyId)) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid propertyId: ${propertyId}`, ipAddress: getClientIp(req.headers) })
      return NextResponse.json({ error: 'Invalid propertyId format' }, { status: 400 })
    }
    if (roomId && !validateUUID(roomId)) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid roomId: ${roomId}`, ipAddress: getClientIp(req.headers) })
      return NextResponse.json({ error: 'Invalid roomId format' }, { status: 400 })
    }

    const supabase = createClient()
    let q = supabase.from('push_subscriptions').select('*')
    if (personId) {
      q = q.eq('person_id', personId)
    } else if (email) {
      q = q.eq('email', email)
    } else if (role) {
      q = q.eq('role', role)
    } else if (propertyId) {
      // Resolve the property's current tenants (optionally one room) → their devices.
      const today = new Date().toISOString().split('T')[0]
      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('person_id, room_id')
        .eq('property_id', propertyId)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
      const ids = (tenancies || [])
        .filter((t: any) => !roomId || t.room_id === roomId)
        .map((t: any) => t.person_id)
        .filter(Boolean)
      if (ids.length === 0) return NextResponse.json({ ok: true, sent: 0, targeted: 0 })
      q = q.in('person_id', ids)
    } else if (!toAll) {
      return NextResponse.json({ error: 'No target specified' }, { status: 400 })
    }

    let { data: subs } = await q

    // Master switch: while tenant comms are paused, never push to tenant devices.
    // Staff devices (contractor/cleaner/admin/lettings) are unaffected.
    if (!await getCommsLive()) {
      const before = (subs || []).length
      subs = (subs || []).filter((s: any) => s.role && s.role !== 'tenant')
      const suppressed = before - subs.length
      if (suppressed > 0 && subs.length === 0) {
        return NextResponse.json({ ok: true, sent: 0, targeted: 0, skipped: 'tenant_comms_paused' })
      }
    }

    const payload = JSON.stringify({
      title: title || 'Capital Rooms',
      body: body || '',
      url: url || '/',
      tag,
      actions,
      actionUrls,
    })

    let sent = 0
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
        sent++
      } catch (err: any) {
        // Subscription gone (unsubscribed / expired) — clean it up.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }
    return NextResponse.json({ ok: true, sent, targeted: (subs || []).length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

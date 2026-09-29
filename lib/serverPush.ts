/**
 * serverPush.ts
 * Fire-and-forget push helper for server-side API routes that need to notify
 * staff/admin without going through the user-auth-gated /api/push/send endpoint.
 *
 * Tenant devices only receive a push while tenant comms are live (the master kill-switch, getCommsLive);
 * staff devices always do. Server code must use this, not fetch('/api/push/send') — that route needs a
 * signed-in user, so server-to-server calls to it were always refused.
 */
import { getCommsLive } from '@/lib/comms'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

let vapidConfigured = false

function configureVapid() {
  if (vapidConfigured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@capitalrooms.co.uk',
    pub,
    priv
  )
  vapidConfigured = true
  return true
}

interface PushOptions {
  /** Target a specific role, e.g. 'administrator' */
  role?: string
  /** Target a specific person by their people.id */
  personId?: string
  /** Target several people by people.id */
  personIds?: string[]
  title: string
  body: string
  /** URL to open when tapped — defaults to /admin */
  url?: string
  tag?: string
  requireInteraction?: boolean
}

/**
 * Send a push notification to all subscribed devices matching the target.
 * Fire-and-forget: swallows errors so callers don't need to await or catch.
 * Cleans up expired/gone subscriptions automatically.
 */
export async function sendServerPush(opts: PushOptions): Promise<number> {
  let sent = 0
  try {
    if (!configureVapid()) {
      console.warn('serverPush: VAPID keys not configured — skipping')
      return sent
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    let q = supabase.from('push_subscriptions').select('*')
    if (opts.role) {
      q = q.eq('role', opts.role)
    } else if (opts.personId) {
      q = q.eq('person_id', opts.personId)
    } else if (opts.personIds?.length) {
      q = q.in('person_id', [...new Set(opts.personIds)])
    } else {
      console.warn('serverPush: no target specified — skipping')
      return sent
    }

    const { data: subs, error } = await q
    if (error) {
      console.warn('serverPush: DB query failed', error.message)
      return sent
    }
    if (!subs || subs.length === 0) return sent
    // kill-switch: while tenant comms are paused only staff devices (subscriptions with a staff role) get pushes
    const live = await getCommsLive()
    const targets = live ? subs : subs.filter((x: any) => x.role && x.role !== 'tenant' && x.role !== 'applicant')

    const payload = JSON.stringify({
      title: opts.title,
      body: opts.body,
      url: opts.url ?? '/admin',
      tag: opts.tag,
      requireInteraction: opts.requireInteraction,
    })

    for (const s of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
        sent++
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          // Subscription expired/unsubscribed — clean it up silently
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', s.endpoint)
        } else {
          console.warn('serverPush: send failed for endpoint', s.endpoint?.slice(0, 40), err?.statusCode)
        }
      }
    }
  } catch (err) {
    console.warn('serverPush: unexpected error', err)
  }
  return sent
}

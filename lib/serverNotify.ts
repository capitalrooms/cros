import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The single correct way to write notifications.
 *
 * The live `notifications` table has exactly these columns:
 *   id, user_id, title, body, type, link, read, created_at, updated_at
 * (migration 016). Several older routes tried to insert `subject`/`message`/
 * `recipient_id`/`property_id`/`status` etc. — none of which exist — so every
 * Quick Notify surface was failing. Route all inserts through here instead.
 *
 * Pass a SERVICE-ROLE client: server-side API routes can't see the caller's
 * session (anon client → auth.getUser() is null → 401), and the table's RLS
 * INSERT policy is service-only anyway.
 */
export interface NotifyContent {
  title: string
  body: string
  /** Short category tag, e.g. 'lettings' | 'cleaner' | 'admin'. */
  type?: string
  /** Where tapping the notification should take the tenant. */
  link?: string
}

export async function insertNotifications(
  service: SupabaseClient,
  recipientPersonIds: string[],
  content: NotifyContent,
  /** Stamps property/room so the Communications Hub can filter + drill down. */
  meta?: { propertyId?: string | null; roomId?: string | null }
): Promise<{ count: number; error: string | null }> {
  const ids = [...new Set(recipientPersonIds.filter(Boolean))]
  if (ids.length === 0) return { count: 0, error: null }

  const rows = ids.map((id) => ({
    user_id: id, // people.id — NOT auth.uid
    title: content.title,
    body: content.body,
    type: content.type || 'admin',
    link: content.link ?? null,
    read: false,
    property_id: meta?.propertyId ?? null,
    room_id: meta?.roomId ?? null,
  }))

  const { error } = await service.from('notifications').insert(rows)
  return { count: error ? 0 : rows.length, error: error?.message ?? null }
}

/**
 * Active-tenant person_ids for a property (or a single room). Tenancies key on
 * `person_id` (NOT tenant_id), and "active" = open-ended or not yet ended.
 */
export async function activeTenantIds(
  service: SupabaseClient,
  propertyId: string,
  roomId?: string | null
): Promise<string[]> {
  const today = new Date().toISOString().split('T')[0]
  let q = service.from('tenancies').select('person_id').eq('property_id', propertyId)
  if (roomId) q = q.eq('room_id', roomId)
  const { data } = await q.or(`end_date.is.null,end_date.gte.${today}`)
  return [...new Set((data || []).map((t: any) => t.person_id).filter(Boolean))]
}

/** Fire-and-forget push to opted-in recipients; never throws. */
export async function tryPush(recipientPersonIds: string[], title: string, body: string, link?: string) {
  const ids = [...new Set(recipientPersonIds.filter(Boolean))]
  if (ids.length === 0) return
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    await fetch(`${base}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: ids, title, body, data: { link } }),
    })
  } catch {
    // Push is best-effort — the in-app notification is the source of truth.
  }
}

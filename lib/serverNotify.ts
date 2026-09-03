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

/**
 * Email fallback for tenants who haven't yet registered a push subscription.
 *
 * Call alongside insertNotifications + tryPush. For each recipient person_id
 * that has no push_subscription row, sends a branded email via Resend with
 * the notification content and a "join the app" footer.
 *
 * Never throws — email is best-effort, same as push.
 */
export async function tryEmailFallback(
  service: SupabaseClient,
  recipientPersonIds: string[],
  content: NotifyContent,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return  // no-op if Resend not configured

  const ids = [...new Set(recipientPersonIds.filter(Boolean))]
  if (ids.length === 0) return

  try {
    // Find which ids have NO push subscription
    const { data: subs } = await service
      .from('push_subscriptions')
      .select('person_id')
      .in('person_id', ids)

    const withPush = new Set((subs ?? []).map((s: any) => s.person_id))
    const withoutPush = ids.filter(id => !withPush.has(id))
    if (withoutPush.length === 0) return

    // Fetch their emails
    const { data: people } = await service
      .from('people')
      .select('id, name, email')
      .in('id', withoutPush)

    const targets = (people ?? []).filter((p: any) => p.email)
    if (targets.length === 0) return

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

    for (const person of targets as { id: string; name: string; email: string }[]) {
      const firstName = person.name?.split(' ')[0] ?? 'there'
      const loginUrl  = `${appUrl}/login?email=${encodeURIComponent(person.email)}`

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f6f4;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f4;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
  <tr><td style="background:#162032;border-radius:8px 8px 0 0;padding:18px 28px">
    <span style="font-size:13px;font-weight:800;color:#fff;letter-spacing:0.06em">
      CAPITAL <span style="color:#C4922A">ROOMS</span>
    </span>
  </td></tr>
  <tr><td style="background:#fff;padding:24px 28px">
    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1a1a1a">Dear ${firstName},</p>
    <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#162032">${content.title}</p>
    <p style="margin:0 0 24px;font-size:14px;color:#2d3240;line-height:1.6">${content.body}</p>
    ${content.link ? `<table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding-bottom:24px">
      <a href="${appUrl}${content.link}" style="display:inline-block;background:#162032;color:#fff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:999px;text-decoration:none">
        View details →
      </a>
    </td></tr></table>` : ''}
    <p style="margin:0 0 4px;font-size:13px;color:#5a6272">Kind regards,</p>
    <p style="margin:0 0 24px;font-size:13px;font-weight:700;color:#1a1a1a">Capital Rooms Management</p>
    <hr style="border:none;border-top:1px solid #e4e2de;margin-bottom:16px">
    <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9f7f4;border-radius:6px;padding:14px;border:1px solid #e4e2de">
      <tr><td>
        <p style="margin:0 0 8px;font-size:12px;color:#5a6272;line-height:1.5">
          Your landlord manages your home through Capital Rooms. Sign in to track repairs,
          upcoming visits, and messages — or add it to your home screen like your other housemates have.
        </p>
        <a href="${loginUrl}" style="font-size:12px;font-weight:700;color:#162032">
          Sign in to Capital Rooms → &nbsp;<span style="color:#9aa0ac;font-weight:400">${person.email}</span>
        </a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#162032;border-radius:0 0 8px 8px;padding:10px 28px">
    <span style="font-size:11px;color:rgba(255,255,255,0.35)">Capital Rooms · management@capitalrooms.co.uk</span>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

      // Fire and forget — don't await individually to avoid slowing the caller
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from:    'Capital Rooms <management@capitalrooms.co.uk>',
          to:      [person.email],
          subject: content.title,
          html,
        }),
      }).catch(() => {})  // never propagate
    }
  } catch {
    // Best-effort — never block the caller
  }
}

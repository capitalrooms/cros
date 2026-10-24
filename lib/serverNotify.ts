import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverEmail } from '@/lib/sendEmail'
import { emailHtml, PORTAL_URL, ctaButton } from './emailTemplate'

const esc = (v: string) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
import { senderFor } from '@/lib/email/sender'
import { dearName } from '@/lib/people'

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
    // property_id / room_id are NOT columns on the notifications table (migration 016).
    // Do not insert them — the insert will hard-error with "column does not exist".
  }))

  const { error } = await service.from('notifications').insert(rows)
  return { count: error ? 0 : rows.length, error: error?.message ?? null }
}

/** Everyone named on a tenancy: the tenant and, on a joint tenancy, the joint tenant (tenancies.co_tenant_id —
 *  jointly and severally liable; both get every tenant message). Pass rows selected with `people!person_id(...)` and
 *  `co:people!co_tenant_id(...)`, or with plain person_id / co_tenant_id. (15 Oct 2026) */
export function tenancyPeople<T = any>(t: any): T[] {
  if (!t) return []
  const out = [t.people ?? t.person ?? null, t.co ?? t.co_tenant ?? null].filter(Boolean) as T[]
  return out
}
export const tenancyPersonIds = (t: any): string[] => [t?.person_id, t?.co_tenant_id].filter(Boolean)
/** One row per person on each tenancy: a joint tenancy gives a second row, a copy with `people` set to the joint
 *  tenant — so a loop that messages `row.people` reaches both. Select `co:people!co_tenant_id(...)` alongside. */
export function expandJoint<R = any>(rows: R[] | null | undefined): R[] {
  return ((rows ?? []) as any[]).flatMap(r => r?.co ? [r, { ...r, people: r.co, person: r.co, person_id: r.co.id ?? r.co_tenant_id }] : [r]) as R[]
}

/**
 * Active-tenant person_ids for a property (or a single room) — joint tenants included. Tenancies key on
 * `person_id` (NOT tenant_id), and "active" = open-ended or not yet ended.
 */
export async function activeTenantIds(
  service: SupabaseClient,
  propertyId: string,
  roomId?: string | null
): Promise<string[]> {
  const today = new Date().toISOString().split('T')[0]

  if (roomId) {
    // Direct query by room — no property join needed
    const { data } = await service
      .from('tenancies')
      .select('person_id, co_tenant_id')
      .eq('room_id', roomId)
      .lte('start_date', today)   // not tenants who haven't moved in yet
      .or(`end_date.is.null,end_date.gte.${today}`)
    return [...new Set((data || []).flatMap(tenancyPersonIds))]
  }

  // tenancies has room_id but NOT property_id, so get room IDs first
  const { data: rooms } = await service
    .from('rooms')
    .select('id')
    .eq('property_id', propertyId)
  const roomIds = (rooms || []).map((r: any) => r.id)
  if (roomIds.length === 0) return []

  const { data } = await service
    .from('tenancies')
    .select('person_id, co_tenant_id')
    .in('room_id', roomIds)
    .lte('start_date', today)   // not tenants who haven't moved in yet
    .or(`end_date.is.null,end_date.gte.${today}`)
  return [...new Set((data || []).flatMap(tenancyPersonIds))]
}

/**
 * Channels the caller explicitly wants to use.
 * 'push_email' = push to those with subscriptions, email to all
 * 'push_only'  = push only (no email at all)
 * 'email_only' = email to all (no push)
 * 'push_email_sms' = push + email + a text to everyone with a mobile (16 Oct 2026 — lettings tell a house about a
 *                    viewing by email AND text)
 */
export type NotifyChannels = 'push_email' | 'push_only' | 'email_only' | 'push_email_sms' | 'email_sms' | 'sms_only' | 'push_sms'

/**
 * Dispatch a notification via the requested channels.
 * Always writes the in-app notification row regardless of channel choice.
 */
export async function dispatchChannels(
  service: SupabaseClient,
  recipientPersonIds: string[],
  content: NotifyContent,
  channels: NotifyChannels = 'push_email',
  /** the request behind a staff mail-out, so it's sent from and signed by that person */
  req?: Request | null,
  /** the office chose to send this (see sendServerPush elected) */
  opts: { elected?: boolean } = {},
): Promise<{ pushCount: number; emailCount: number; smsCount?: number; smsFailed?: string[] }> {
  const ids = [...new Set(recipientPersonIds.filter(Boolean))]
  if (ids.length === 0) return { pushCount: 0, emailCount: 0 }

  let pushCount = 0
  let emailCount = 0
  let sms: { smsCount: number; smsFailed: string[] } | null = null

  if (channels === 'push_email' || channels === 'push_only' || channels === 'push_email_sms' || channels === 'push_sms') {
    pushCount = await tryPush(ids, content.title, content.body, content.link, !!opts.elected) // devices reached
  }

  if (channels === 'push_email' || channels === 'email_only' || channels === 'push_email_sms' || channels === 'email_sms') {
    emailCount = await sendEmailToAll(service, ids, content, req)
  }

  if (channels === 'push_email_sms' || channels === 'email_sms' || channels === 'sms_only' || channels === 'push_sms') sms = await sendSmsToAll(service, ids, content)

  return { pushCount, emailCount, ...(sms ?? {}) }
}

/** A text to everyone with a mobile — "Hi Mr Wang, <message> – Capital Rooms". Failures are reported to the office by
 *  lib/sms; the names of those who couldn't be texted come back so the screen can say so. */
async function sendSmsToAll(service: SupabaseClient, ids: string[], content: NotifyContent): Promise<{ smsCount: number; smsFailed: string[] }> {
  const { sendSms, smsConfigured } = await import('@/lib/sms')
  const { data: people } = await service.from('people').select('id, salutation, first_name, last_name, full_name, phone').in('id', ids)
  const failed: string[] = []
  let count = 0
  for (const p of (people ?? []) as any[]) {
    const who = dearName(p)
    if (!p.phone) { failed.push(`${who} (no mobile)`); continue }
    if (!smsConfigured()) { failed.push(`${who} (texting not set up)`); continue }
    // no emoji in a text — one makes it cost two or three texts
    const r = await sendSms(p.phone, `Hi ${who}, ${content.body.replace(/\p{Extended_Pictographic}\uFE0F?\s*/gu, '').trim()} – Capital Rooms`, { asName: true })
    if (r.ok) count++
    else failed.push(`${who} (${r.error})`)
  }
  return { smsCount: count, smsFailed: failed }
}

/** Send branded email to ALL supplied person ids (not just those without push). */
async function sendEmailToAll(
  service: SupabaseClient,
  ids: string[],
  content: NotifyContent,
  req?: Request | null,
): Promise<number> {
  if (!process.env.RESEND_API_KEY) return 0

  try {
    const sender = await senderFor(req)
    const { data: people } = await service
      .from('people')
      .select('id, full_name, salutation, first_name, last_name, company, email')
      .in('id', ids)

    const targets = (people ?? []).filter((p: any) => p.email)
    if (targets.length === 0) return 0

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || PORTAL_URL

    await Promise.allSettled(targets.map(async (person: any) => {
      const dear = dearName(person)   // "Mr Page" — never a lone first name (lib/people)
      const loginUrl  = `${appUrl}/login?email=${encodeURIComponent(person.email)}`
      // house email: the shared top bar and the sender's signature come from the wrapper
      const html = await emailHtml(`
        <p>Dear ${esc(dear)},</p>
        <p><strong>${esc(content.title)}</strong></p>
        ${esc(content.body).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
        ${content.link ? ctaButton('View details', `${appUrl}${content.link}`) : ''}
        <p style="font-size:12px;color:#78716c;">You can also <a href="${loginUrl}" style="color:#1a1a1a;">sign in to the Capital Rooms app</a> as ${esc(person.email)}.</p>
      `, { sender })
      await deliverEmail({ to: [person.email], subject: content.title, html }, { sender })
    }))

    return targets.length
  } catch {
    return 0
  }
}

/** Fire-and-forget push to opted-in recipients; never throws. */
export async function tryPush(recipientPersonIds: string[], title: string, body: string, link?: string, elected = false): Promise<number> {
  const ids = [...new Set(recipientPersonIds.filter(Boolean))]
  if (ids.length === 0) return 0
  try {
    const { sendServerPush } = await import('@/lib/serverPush')
    return await sendServerPush({ personIds: ids, title, body, url: link, elected })
  } catch {
    // Push is best-effort — the in-app notification is the source of truth.
    return 0
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
      .select('id, salutation, first_name, last_name, full_name, company, email')
      .in('id', withoutPush)

    const targets = (people ?? []).filter((p: any) => p.email)
    if (targets.length === 0) return

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || PORTAL_URL

    for (const person of targets as { id: string; name: string; email: string }[]) {
      const dear = dearName(person as any)
      const loginUrl  = `${appUrl}/login?email=${encodeURIComponent(person.email)}`

      const html = await emailHtml(`
        <p style="margin:0 0 14px;font-size:15px;font-weight:700;">Dear ${esc(dear)},</p>
        <p style="margin:0 0 10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${content.title}</p>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.7;">${content.body}</p>
        ${content.link ? `<p style="margin:0 0 24px;">
          <a href="${appUrl}${content.link}" style="display:inline-block;background:#0a0a0a;color:#FFE000;font-size:13px;font-weight:700;padding:12px 24px;text-decoration:none;letter-spacing:0.04em;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">
            View details →
          </a>
        </p>` : ''}
        <hr style="border:none;border-top:1px solid #ddd;margin:20px 0 16px">
        <p style="margin:0 0 6px;font-size:12px;color:#777;line-height:1.6;">
          Your landlord manages your home through Capital Rooms. Sign in to track repairs,
          upcoming visits, and messages.
        </p>
        <a href="${loginUrl}" style="font-size:12px;font-weight:700;color:#0a0a0a;">
          Sign in → ${person.email}
        </a>
      `)

      // Fire and forget — don't await individually to avoid slowing the caller
      deliverEmail({ to: [person.email], subject: content.title, html }).catch(() => {})  // never propagate
    }
  } catch {
    // Best-effort — never block the caller
  }
}

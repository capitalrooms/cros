// Telling the tenants about their house's cleans (26 Oct 2026, Harry: "as tenants are not using the app it simply sends
// them an email for the cleaning updates for now, e.g. clean booked, clean finished, clean delayed… easily switchable to
// push notifications when we are ready"). One message per event to everyone living at the house now. How it goes is
// one setting on the Cleaning screen — system_settings 'clean_updates': email (default) · app · app_email · off.
// It runs on its own switch, not the paused automatic tenant messages, because Harry asked for these to go now.
import type { SupabaseClient } from '@supabase/supabase-js'
import { activeTenantIds, insertNotifications, dispatchChannels } from '@/lib/serverNotify'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { dearLine } from '@/lib/people'
import { extrasLine } from '@/lib/cleans/deepTasks'

export type CleanUpdate = 'booked' | 'moved' | 'late' | 'arrived' | 'done' | 'cancelled'
export type CleanChannel = 'email' | 'app' | 'app_email' | 'off'
export const CLEAN_CHANNELS: { value: CleanChannel; label: string }[] = [
  { value: 'email', label: 'Email' }, { value: 'app', label: 'App notification' }, { value: 'app_email', label: 'Both' }, { value: 'off', label: 'Off' },
]
const KEY = 'clean_updates'

export async function cleanChannel(s: SupabaseClient): Promise<CleanChannel> {
  const { data } = await s.from('system_settings').select('value').eq('key', KEY).maybeSingle()
  const v = String((data as any)?.value ?? 'email') as CleanChannel
  return CLEAN_CHANNELS.some(c => c.value === v) ? v : 'email'
}
export async function setCleanChannel(s: SupabaseClient, v: CleanChannel) {
  return s.from('system_settings').upsert({ key: KEY, value: v }, { onConflict: 'key' })
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const time = (t: string | null | undefined) => {
  if (!t) return ''
  const [h, m] = String(t).split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}
const when = (date: string, t?: string | null) => `${day(date)}${t ? ` at ${time(t)}` : ''}`

/** The words for each event — the same in the email and the app notification. */
function words(kind: CleanUpdate, house: string, c: { clean_date: string; clean_time: string | null }, extra: { note?: string; nextDate?: string | null; nextTime?: string | null; extras?: string }) {
  switch (kind) {
    case 'booked': return { title: `Clean booked — ${day(c.clean_date)}`, body: `The shared areas at ${house} will be cleaned on ${when(c.clean_date, c.clean_time)}. A tidy kitchen and bathroom help the cleaner do a better job — thank you.` }
    case 'moved': return { title: `Clean moved — ${day(c.clean_date)}`, body: `The clean at ${house} has moved to ${when(c.clean_date, c.clean_time)}.${extra.note ? ` ${extra.note}` : ''}` }
    case 'late': return { title: 'Cleaner running late', body: `Your cleaner is running late today — the clean at ${house} is now expected ${c.clean_time ? `around ${time(c.clean_time)}` : 'later today'}.` }
    case 'arrived': return { title: 'Your cleaner has arrived', body: `Your cleaner has arrived at ${house}.` }
    case 'done': return { title: 'Clean finished', body: `The clean at ${house} is finished.${extra.extras ? ` Extra jobs done today: ${extra.extras}.` : ''}${extra.nextDate ? ` The next one is ${when(extra.nextDate, extra.nextTime)}.` : ''}${extra.note ? `\n\nFrom your cleaner: ${extra.note}` : ''}` }
    case 'cancelled': return { title: 'Clean cancelled', body: `The clean at ${house} on ${when(c.clean_date, c.clean_time)} won’t go ahead.${extra.note ? ` ${extra.note}` : ''} We’ll let you know the next one.` }
  }
}

/** Tell the house's tenants about one clean. Never throws; says what it did. */
export async function tellTenantsAboutClean(s: SupabaseClient, cleanId: string, kind: CleanUpdate, extra: { note?: string } = {}, req?: Request | null)
  : Promise<{ sent: number; channel: CleanChannel; skipped?: string }> {
  const channel = await cleanChannel(s)
  if (channel === 'off') return { sent: 0, channel, skipped: 'tenant updates about cleans are off' }
  const { data: c } = await s.from('cleans').select('id, property_id, clean_date, clean_time, notify_tenants, status, special_jobs, properties(name, address)').eq('id', cleanId).maybeSingle()
  if (!c?.property_id) return { sent: 0, channel, skipped: 'clean not found' }
  if ((c as any).notify_tenants === false) return { sent: 0, channel, skipped: 'this clean is set not to tell the tenants' }
  const house = (c as any).properties?.name || (c as any).properties?.address || 'your house'
  let next: { clean_date: string; clean_time: string | null } | null = null
  if (kind === 'done') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    const { data } = await s.from('cleans').select('clean_date, clean_time').eq('property_id', c.property_id).gt('clean_date', today).neq('id', c.id)
      .not('status', 'in', '("completed","cancelled")').order('clean_date').limit(1).maybeSingle()
    next = data as any
  }
  const msg = words(kind, house, c as any, { note: extra.note, nextDate: next?.clean_date ?? null, nextTime: next?.clean_time ?? null, extras: kind === 'done' ? extrasLine((c as any).special_jobs ?? []) : '' })
  const ids = await activeTenantIds(s, c.property_id, null)
  if (!ids.length) return { sent: 0, channel, skipped: 'nobody lives there now' }

  let sent = 0
  // app: the inbox and a phone notification (arrived goes by app only — an email for it is noise)
  if (channel === 'app' || channel === 'app_email' || kind === 'arrived') {
    await insertNotifications(s, ids, { title: msg.title, body: msg.body, type: 'cleaning', link: '/tenant' }, { propertyId: c.property_id })
    await dispatchChannels(s, ids, { title: msg.title, body: msg.body, link: '/tenant' }, 'push_only', null).catch(() => null)
    sent = ids.length
  }
  if ((channel === 'email' || channel === 'app_email') && kind !== 'arrived') {
    const { data: people } = await s.from('people').select('id, email, salutation, first_name, last_name, full_name, notify_by_email').in('id', ids)
    for (const p of (people ?? []) as any[]) {
      if (!p.email || p.notify_by_email === false || /\.invalid$/i.test(p.email)) continue
      const html = await buildEmail(`<p>${dearLine(p)}</p><p>${msg.body.replace(/\n/g, '<br>')}</p>`, { signature: false })
      const r = await deliverEmail({ to: [p.email], subject: `${msg.title} — ${house}`, html }, { req: req ?? null }).catch(() => null)
      if (r?.ok) sent++
    }
  }
  return { sent, channel }
}

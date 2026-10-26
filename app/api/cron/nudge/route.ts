import { NextResponse } from 'next/server'
import { sendServerPush } from '@/lib/serverPush'
import { pendingLicenceIds } from '@/lib/compliance/hmoLicence'
import { createServiceClient } from '@/lib/supabase'
import { TIME_SLOTS } from '@/lib/booking'
import { getTemplate, render } from '@/lib/messageTemplate'
import { buildEmail } from '@/lib/emailWrapper'
import { deliverEmail } from '@/lib/sendEmail'
import { OFFICE_ALERT_EMAIL, officeButton } from '@/lib/email/office'
import { isTestEmail } from '@/lib/people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Pushes go through sendServerPush: this used to POST to /api/push/send on an old deployment URL, which needs a
// signed-in user, so every nudge was refused. These nudges go to staff (contractors, cleaners, admins), so they run
// while tenant comms are paused; sendServerPush still holds back any tenant device.
function slotLabel(slot: string | null) {
  return TIME_SLOTS.find((s) => s.value === slot)?.label ?? slot ?? ''
}

function push(p: { personId?: string; role?: string; title: string; body: string; url: string; tag?: string; requireInteraction?: boolean }) {
  return sendServerPush(p)
}

/**
 * Daily nudge (Vercel cron). Two jobs:
 *  1. "Still on time?" to any contractor with a job booked today they haven't
 *     marked arrived — they tap through to confirm or reschedule (which notifies
 *     tenants of the new time).
 *  2. Compliance reminder to admins, ~every 3rd day, for certs due within 14 days.
 *  3. Cleans not logged: the cleaner is asked "did you do it?"; the office gets one email listing cleans 2+ days
 *     overdue and houses with a cleaning schedule but nothing booked (only when there's something to say).
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const supabase = createServiceClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

  const { data: jobs } = await supabase
    .from('maintenance_tickets')
    .select('id, title, category, booked_slot, contractor_id, arrived_at, status, rooms(name), properties(name, address)')
    .eq('booked_date', today)
    .eq('status', 'assigned')
    .not('contractor_id', 'is', null)
    .is('arrived_at', null)

  const nudgeTpl = await getTemplate('contractor-nudge')

  let nudged = 0
  for (const j of jobs || []) {
    const slot = slotLabel(j.booked_slot)
    const jj = j as any
    const where = [jj.rooms?.name, String(jj.properties?.name || jj.properties?.address || '').split('\n')[0]].filter(Boolean).join(', ')
    const nudgeBody = nudgeTpl
      ? render(nudgeTpl.template_text, { slot })
      : `You're booked today${slot ? ` at ${slot}` : ''} for ${jj.title || jj.category || 'a job'}${where ? ` at ${where}` : ''}. If you can't make this time, please rebook in the app so the tenants are updated.`
    await push({
      personId: j.contractor_id,
      title: `Today${slot ? ` · ${slot}` : ''}: you're booked in`,
      body: nudgeBody,
      url: `/contractor/job/${j.id}`,
      tag: `nudge-${j.id}`,
      requireInteraction: true,
    })
    nudged++
  }

  // Same "still on time?" nudge for cleaners with a clean booked today they
  // haven't marked arrived — they tap through to confirm or reschedule (which
  // notifies the property's tenants of the new time).
  const { data: cleansToday } = await supabase
    .from('cleans')
    .select('id, clean_time, cleaner_id, arrived_at, status')
    .eq('clean_date', today)
    .not('status', 'in', '("completed","cancelled")')
    .not('cleaner_id', 'is', null)
    .is('arrived_at', null)

  for (const c of cleansToday || []) {
    await push({
      personId: c.cleaner_id,
      title: 'Still on time?',
      body: `Your clean today${c.clean_time ? ` at ${String(c.clean_time).slice(0, 5)}` : ''} — tap to confirm you're on track, or change the time.`,
      url: `/cleaner/clean/${c.id}`,
      tag: `nudge-clean-${c.id}`,
      requireInteraction: true,
    })
    nudged++
  }

  // Cleans whose day has gone by and that nobody finished or logged (26 Oct 2026): the next clean is only booked when one
  // is finished, so an unlogged clean stops a house's cleaning. The cleaner is asked "did you do it?", and the office
  // hears about any clean two days or more overdue and any house with a schedule but nothing booked.
  const { data: overdueCleans } = await supabase
    .from('cleans')
    .select('id, clean_date, cleaner_id, property_id, properties(name)')
    .lt('clean_date', today)
    .not('status', 'in', '("completed","cancelled")')
    .gte('clean_date', new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
  for (const c of (overdueCleans ?? []) as any[]) {
    if (!c.cleaner_id) continue
    await push({
      personId: c.cleaner_id,
      title: 'Did you do this clean?',
      body: `${String(c.properties?.name ?? 'A clean').split('\n')[0]} was booked for ${new Date(`${c.clean_date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}. Tap to log it — or move it if it didn't happen.`,
      url: `/cleaner/clean/${c.id}`,
      tag: `overdue-clean-${c.id}`,
    })
    nudged++
  }
  let cleaningAlert = 0
  {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    // test cleaners' cleans (made-up accounts) aren't the office's business
    const { data: cleaners } = await supabase.from('people').select('id, email').eq('role', 'cleaner')
    const testIds = new Set(((cleaners ?? []) as any[]).filter(p => isTestEmail(p.email)).map(p => p.id))
    const late = ((overdueCleans ?? []) as any[]).filter(c => c.clean_date <= twoDaysAgo && !testIds.has(c.cleaner_id))
    const { data: houses, error: hErr } = await supabase.from('properties').select('id, name, clean_day, clean_time, clean_frequency_weeks').not('clean_day', 'is', null)
    const { data: ahead } = await supabase.from('cleans').select('property_id').gte('clean_date', today).not('status', 'in', '("completed","cancelled")')
    const booked = new Set(((ahead ?? []) as any[]).map(a => a.property_id))
    const lateHouses = new Set(late.map(c => c.property_id))
    const unbooked = hErr ? [] : ((houses ?? []) as any[]).filter(h => h.clean_time && h.clean_frequency_weeks && !booked.has(h.id) && !lateHouses.has(h.id))
    cleaningAlert = late.length + unbooked.length
    if (cleaningAlert) {
      const name = (n: unknown) => String(n ?? '').split('\n')[0]
      const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      const html = await buildEmail(
        (late.length ? `<p><strong>Cleans not logged</strong> — booked, the day has gone, and the cleaner hasn’t said it was done. The next clean at these houses isn’t booked until it is.</p><ul>${late.map(c => `<li>${name(c.properties?.name)} — ${day(c.clean_date)}</li>`).join('')}</ul>` : '')
        + (unbooked.length ? `<p><strong>No clean booked</strong> — these houses have a cleaning schedule but nothing in the diary.</p><ul>${unbooked.map(h => `<li>${name(h.name)}</li>`).join('')}</ul>` : '')
        + officeButton('/admin/cleaner-jobs', 'Open Cleaning'), { signature: false })
      await deliverEmail({ to: OFFICE_ALERT_EMAIL, subject: `Cleaning: ${[late.length && `${late.length} clean${late.length === 1 ? '' : 's'} not logged`, unbooked.length && `${unbooked.length} house${unbooked.length === 1 ? '' : 's'} with nothing booked`].filter(Boolean).join(', ')}`, html }).catch(() => null)
    }
  }

  // Throttle the compliance push to roughly every third day (the in-app banner
  // nags continuously; this is the out-of-app nudge).
  let certAlerts = 0
  if (Math.floor(Date.now() / 86400000) % 3 === 0) {
    const { data: props } = await supabase
      .from('properties')
      .select('id, name, gas_safe_cert_expiry, electrical_cert_expiry, license_expiry, insurance_expiry')
      .or('letting_type.is.null,letting_type.neq.let_only')   // managed only
    const licencePending = await pendingLicenceIds(supabase)
    const t0 = new Date(today).getTime()
    const names = new Set<string>()
    for (const p of props || []) {
      for (const f of [
        'gas_safe_cert_expiry',
        'electrical_cert_expiry',
        'license_expiry',
        'insurance_expiry',
      ]) {
        const v = (p as any)[f]
        if (!v) continue
        if (f === 'license_expiry' && licencePending.has((p as any).id)) continue
        const days = Math.floor((new Date(v).getTime() - t0) / 86400000)
        if (days <= 14) names.add(p.name)
      }
    }
    certAlerts = names.size
    if (certAlerts > 0) {
      await push({
        role: 'administrator',
        title: 'Compliance deadlines',
        body: `${certAlerts} propert${certAlerts > 1 ? 'ies have' : 'y has'} a certificate due soon.`,
        url: '/admin/compliance',
      })
    }
  }

  return NextResponse.json({ ok: true, nudged, certAlerts, cleaningAlert })
}

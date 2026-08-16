import { NextResponse } from 'next/server'
import { tenantCommsLive } from '@/lib/comms'
import { createClient } from '@/lib/supabase'
import { TIME_SLOTS } from '@/lib/booking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Stable origin for the internal push call.
const BASE = 'https://cros-capital-rooms.vercel.app'

function slotLabel(slot: string | null) {
  return TIME_SLOTS.find((s) => s.value === slot)?.label ?? slot ?? ''
}

function push(payload: any) {
  return fetch(`${BASE}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

/**
 * Daily nudge (Vercel cron). Two jobs:
 *  1. "Still on time?" to any contractor with a job booked today they haven't
 *     marked arrived — they tap through to confirm or reschedule (which notifies
 *     tenants of the new time).
 *  2. Compliance reminder to admins, ~every 3rd day, for certs due within 14 days.
 */
export async function GET() {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!tenantCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: jobs } = await supabase
    .from('maintenance_tickets')
    .select('id, category, booked_slot, contractor_id, arrived_at, status')
    .eq('booked_date', today)
    .eq('status', 'assigned')
    .not('contractor_id', 'is', null)
    .is('arrived_at', null)

  let nudged = 0
  for (const j of jobs || []) {
    await push({
      personId: j.contractor_id,
      title: 'Still on time?',
      body: `Your ${slotLabel(j.booked_slot)} job today — tap to confirm you're on track, or reschedule.`,
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
    .neq('status', 'completed')
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

  // Throttle the compliance push to roughly every third day (the in-app banner
  // nags continuously; this is the out-of-app nudge).
  let certAlerts = 0
  if (Math.floor(Date.now() / 86400000) % 3 === 0) {
    const { data: props } = await supabase
      .from('properties')
      .select('name, gas_safe_cert_expiry, electrical_cert_expiry, license_expiry, insurance_expiry')
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

  return NextResponse.json({ ok: true, nudged, certAlerts })
}

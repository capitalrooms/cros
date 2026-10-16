/**
 * /api/emergencies/tick — the emergency clock, called every minute by the database's scheduler (migration 203)
 * and whenever an emergency is opened or answered. It only acts on timers that have run out, so an extra call is
 * harmless; no sign-in needed.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { tick } from '@/lib/emergencies/engine'
import { checkDeliveries } from '@/lib/email/deliveryWatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run() {
  try {
    const s = createServiceClient()
    const done = await tick(s)
    // every 5 minutes: tell the office about any email that didn't arrive (bounced / blocked address)
    let email: unknown = null
    if (new Date().getUTCMinutes() % 5 === 0) email = await checkDeliveries(s).catch(e => ({ error: e instanceof Error ? e.message : 'check failed' }))
    return NextResponse.json({ ok: true, done, email })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'tick failed'
    // before migration 203 the tables don't exist yet — that's not an error worth retrying
    if (/emergenc/.test(msg) && /does not exist|schema cache/.test(msg)) return NextResponse.json({ ok: true, setupNeeded: true })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
export const GET = run
export const POST = run

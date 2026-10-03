/**
 * /api/emergencies/tick — the emergency clock, called every minute by the database's scheduler (migration 203)
 * and whenever an emergency is opened or answered. It only acts on timers that have run out, so an extra call is
 * harmless; no sign-in needed.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { tick } from '@/lib/emergencies/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run() {
  try {
    const done = await tick(createServiceClient())
    return NextResponse.json({ ok: true, done })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'tick failed'
    // before migration 203 the tables don't exist yet — that's not an error worth retrying
    if (/emergenc/.test(msg) && /does not exist|schema cache/.test(msg)) return NextResponse.json({ ok: true, setupNeeded: true })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
export const GET = run
export const POST = run

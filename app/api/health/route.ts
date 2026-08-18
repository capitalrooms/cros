import { NextRequest, NextResponse } from 'next/server'
import manifest from '@/lib/schema-manifest.json'

/**
 * Production health check. Runs the same contract the local `npm run doctor`
 * enforces, but SERVER-SIDE on Vercel where the real (Sensitive) env values
 * live — the only place prod key validity can actually be verified.
 *
 * GET /api/health          → summary booleans only (safe to expose / monitor)
 * GET /api/health?full=1 with Authorization: Bearer <CRON_SECRET> → per-check detail
 *
 * Never returns secret values — only pass/fail and human-readable messages.
 */

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CRON = process.env.CRON_SECRET || ''

type Check = { name: string; ok: boolean; level: 'error' | 'warn'; detail?: string }

async function status(path: string, key: string): Promise<number> {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  return res.status
}

export async function GET(req: NextRequest) {
  const checks: Check[] = []
  const add = (name: string, ok: boolean, level: Check['level'] = 'error', detail?: string) =>
    checks.push({ name, ok, level, detail })

  // Env presence (booleans only — never the values)
  add('env: NEXT_PUBLIC_SUPABASE_URL', !!URL)
  add('env: NEXT_PUBLIC_SUPABASE_ANON_KEY', !!ANON)
  add('env: SUPABASE_SERVICE_ROLE_KEY', !!SERVICE, 'error', SERVICE ? undefined : 'cron & generation routes cannot write')
  add('env: CRON_SECRET', !!CRON)

  if (URL && ANON) {
    // Key validity — a dead key fails silently in normal use, so test it explicitly
    try {
      const anonStatus = await status('people?select=id&limit=1', ANON)
      add('anon key authenticates', anonStatus !== 401, 'error', anonStatus === 401 ? 'rejected by Supabase' : undefined)
    } catch { add('anon key authenticates', false, 'error', 'request failed') }

    if (SERVICE) {
      try {
        const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }, cache: 'no-store' })
        add('service-role key authenticates', res.status === 200, 'error', res.status === 200 ? undefined : `HTTP ${res.status} — cron/generation routes will silently no-op`)
      } catch { add('service-role key authenticates', false, 'error', 'request failed') }
    }

    // Tables + columns (catches missing tables and tenant_id-vs-person_id class)
    for (const [table, cols] of Object.entries(manifest.tables as Record<string, string[]>)) {
      const tStatus = await status(`${table}?select=${cols[0]}&limit=1`, ANON)
      if (tStatus === 404) { add(`table ${table}`, false, 'error', 'does not exist — migration not applied'); continue }
      const missing: string[] = []
      for (const col of cols) {
        if ((await status(`${table}?select=${col}&limit=1`, ANON)) === 400) missing.push(col)
      }
      add(`table ${table}`, missing.length === 0, 'error', missing.length ? `missing columns: ${missing.join(', ')}` : undefined)
    }

    // Known gaps (warnings)
    for (const [table, why] of Object.entries(manifest.knownGaps as Record<string, string>)) {
      const s = await status(`${table}?select=id&limit=1`, ANON)
      add(`gap: ${table}`, s !== 404, 'warn', s === 404 ? (why as string) : undefined)
    }
  }

  const errors = checks.filter((c) => !c.ok && c.level === 'error')
  const warnings = checks.filter((c) => !c.ok && c.level === 'warn')
  const healthy = errors.length === 0

  // Detail requires the cron secret; the bare summary is safe to expose/monitor.
  const wantsFull = req.nextUrl.searchParams.get('full') === '1'
  const authed = CRON && req.headers.get('authorization') === `Bearer ${CRON}`

  const body: Record<string, unknown> = {
    healthy,
    errors: errors.length,
    warnings: warnings.length,
    checkedAt: new Date().toISOString(),
  }
  if (wantsFull && authed) body.checks = checks
  else if (wantsFull && !authed) body.note = 'pass ?full=1 with Authorization: Bearer <CRON_SECRET> for per-check detail'
  else body.failing = [...errors, ...warnings].map((c) => `${c.level === 'warn' ? '⚠ ' : '✗ '}${c.name}`)

  return NextResponse.json(body, { status: healthy ? 200 : 503 })
}

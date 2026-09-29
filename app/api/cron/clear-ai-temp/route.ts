import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/clear-ai-temp  (daily, see vercel.json; ?dry=1 lists without deleting)
 *
 * Deletes files in property-documents/ai-temp/ older than 24 hours that nothing refers to.
 * Large uploads (>4 MB) are also stored there permanently by some screens, so before deleting we check every
 * table in the database plus the planner's boards JSON for the file's path. If that check can't finish, nothing is deleted.
 */
const BUCKET = 'property-documents'
const FOLDER = 'ai-temp'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1'
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const candidates: { name: string; size: number; created: string }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(FOLDER, { limit: 1000, offset })
    if (error) return NextResponse.json({ ok: false, error: `Could not list ${FOLDER}: ${error.message}` }, { status: 500 })
    for (const f of data) {
      if (f.id === null || !f.created_at) continue
      if (Date.now() - new Date(f.created_at).getTime() > MAX_AGE_MS) {
        candidates.push({ name: f.name, size: f.metadata?.size ?? 0, created: f.created_at })
      }
    }
    if (data.length < 1000) break
  }
  if (!candidates.length) return NextResponse.json({ ok: true, dry, deleted: 0, message: 'Nothing older than 24 hours' })

  let haystack: string
  try {
    haystack = await everythingThatCouldReferToAFile(sb, url, key)
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Reference check failed, nothing deleted: ${e instanceof Error ? e.message : e}` }, { status: 500 })
  }

  const inUse = candidates.filter(c => haystack.includes(c.name))
  const toDelete = candidates.filter(c => !haystack.includes(c.name))
  const mb = (n: number) => Math.round(n / 104857.6) / 10

  if (!dry && toDelete.length) {
    for (let i = 0; i < toDelete.length; i += 100) {
      const { error } = await sb.storage.from(BUCKET).remove(toDelete.slice(i, i + 100).map(c => `${FOLDER}/${c.name}`))
      if (error) return NextResponse.json({ ok: false, error: `Delete failed: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    deleted: dry ? 0 : toDelete.length,
    freedMb: dry ? 0 : mb(toDelete.reduce((a, c) => a + c.size, 0)),
    wouldDelete: dry ? toDelete.map(c => ({ name: c.name, mb: mb(c.size), created: c.created.slice(0, 10) })) : undefined,
    keptBecauseInUse: inUse.map(c => c.name),
  })
}

async function everythingThatCouldReferToAFile(
  sb: ReturnType<typeof createClient>, url: string, key: string,
): Promise<string> {
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const spec = await fetch(`${url}/rest/v1/`, { headers, cache: 'no-store' })
  if (!spec.ok) throw new Error(`schema ${spec.status}`)
  const tables = Object.keys(((await spec.json()) as { definitions?: Record<string, unknown> }).definitions ?? {})
  if (!tables.length) throw new Error('no tables found')

  const parts: string[] = []
  for (const t of tables) {
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${url}/rest/v1/${t}?select=*`, { headers: { ...headers, Range: `${from}-${from + 999}` }, cache: 'no-store' })
      if (r.status === 416) break
      if (!r.ok) throw new Error(`${t} ${r.status}`)
      const rows = (await r.json()) as unknown[]
      parts.push(JSON.stringify(rows))
      if (rows.length < 1000) break
    }
  }

  // The planner keeps its boards (with attachment links) as JSON in storage, not in a table.
  const { data: jsonFiles, error } = await sb.storage.from('landlord-docs').list('planner', { limit: 100 })
  if (error) throw new Error(`planner boards: ${error.message}`)
  for (const f of jsonFiles ?? []) {
    if (!f.name.endsWith('.json')) continue
    const { data, error: dlErr } = await sb.storage.from('landlord-docs').download(`planner/${f.name}`)
    if (dlErr || !data) throw new Error(`planner/${f.name}: ${dlErr?.message ?? 'empty'}`)
    parts.push(await data.text())
  }
  return parts.join('\n')
}

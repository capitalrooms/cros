// GET  /api/tenant/house-jobs → the house's jobs, with who last did each and when (shared within the house).
// POST /api/tenant/house-jobs { jobKey } → records that you did it. Anyone in the house can do this.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { getActiveTenancy } from '@/lib/tenancy'
import { createServiceClient } from '@/lib/supabase'
import { HOUSE_JOBS } from '@/lib/house/jobs'

export const dynamic = 'force-dynamic'

async function tenantCaller(req: NextRequest) {
  const c = await requireSignedIn(req)
  return c && c.role === 'tenant' ? c : null
}

export async function GET(req: NextRequest) {
  const c = await tenantCaller(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const t = await getActiveTenancy(c.personId)
  if (!t) return NextResponse.json({ error: 'No current tenancy.' }, { status: 404 })
  const s = createServiceClient() as any
  const since = new Date(Date.now() - 60 * 86400000).toISOString()
  const { data } = await s.from('house_job_done').select('job_key, done_at, people(full_name, first_name, last_name)').eq('property_id', t.property_id).gte('done_at', since).order('done_at', { ascending: false }).limit(300)
  const last = new Map<string, { by: string; at: string }>()
  for (const r of (data ?? []) as any[]) {
    if (last.has(r.job_key)) continue
    const by = r.people?.full_name || [r.people?.first_name, r.people?.last_name].filter(Boolean).join(' ') || 'a housemate'
    last.set(r.job_key, { by, at: r.done_at })
  }
  return NextResponse.json({ jobs: HOUSE_JOBS.map(j => ({ key: j.key, label: j.label, lastBy: last.get(j.key)?.by ?? null, lastAt: last.get(j.key)?.at ?? null })) })
}

export async function POST(req: NextRequest) {
  const c = await tenantCaller(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const t = await getActiveTenancy(c.personId)
  if (!t) return NextResponse.json({ error: 'No current tenancy.' }, { status: 404 })
  const b = await req.json().catch(() => ({})) as { jobKey?: string }
  if (!HOUSE_JOBS.some(j => j.key === b.jobKey)) return NextResponse.json({ error: 'Choose a job from the list.' }, { status: 400 })
  const s = createServiceClient() as any
  const { error } = await s.from('house_job_done').insert({ property_id: t.property_id, job_key: b.jobKey, done_by: c.personId })
  if (error) return NextResponse.json({ error: 'That didn’t save. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Bring Homeppl documents into CROS for everyone already on the books (6 Nov 2026, Harry: "any you can find add them
// in"). Administrators only (in no access area). One tenancy per person — their latest — so nothing is filed twice.
//   GET                          → { tenancyIds } the tenancies to go through (latest per tenant, not fallen through)
//   POST { tenancyIds: [≤5] }    → each: documents + reports copied in (lib/homeppl/sync); ticks left alone for anyone
//                                  who has already moved in
import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { homepplReady } from '@/lib/homeppl/client'
import { bringInFromHomeppl } from '@/lib/homeppl/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!(await requireAdministrator(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await createServiceClient().from('tenancies').select('id, person_id, start_date, properties(is_demo)').is('let_cancelled_at', null).not('person_id', 'is', null).order('start_date', { ascending: false })
  const seen = new Set<string>(), tenancyIds: string[] = []
  for (const t of (data ?? []) as any[]) {
    if (t.properties?.is_demo || seen.has(t.person_id)) continue
    seen.add(t.person_id); tenancyIds.push(t.id)
  }
  return NextResponse.json({ tenancyIds })
}

export async function POST(req: NextRequest) {
  const caller = await requireAdministrator(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!homepplReady()) return NextResponse.json({ error: 'Homeppl isn’t connected' }, { status: 400 })
  const b = await req.json().catch(() => ({}))
  const ids = (Array.isArray(b.tenancyIds) ? b.tenancyIds : []).map(String).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 5)
  const s = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const results: any[] = []
  for (const id of ids) {
    const { data: t } = await s.from('tenancies').select('start_date').eq('id', id).maybeSingle() as { data: any }
    try {
      const r = await bringInFromHomeppl(s, id, caller.email, { ticks: !t?.start_date || t.start_date > today })
      results.push({ id, status: r.check?.status ?? null, copied: r.copied.length, failed: r.failed, ticked: r.ticked })
    } catch (e: any) { results.push({ id, none: e?.message ?? 'error' }) }
  }
  return NextResponse.json({ results })
}

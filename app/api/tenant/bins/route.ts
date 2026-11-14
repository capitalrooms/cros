// /api/tenant/bins — the tenant's bin day (14 Nov 2026).
//   GET  → { day, next: { date, names } | null, councilName, councilWebsite, checkedAt, source }
//          the council's own schedule when it has been looked up (lib/bins), else the day the office typed in
//   POST { kind: 'missed' | 'changed', leftOut?, note? } → logs it (bin_reports, migration 289) and tells the office,
//          who check the day with the council and correct it for everyone
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn } from '@/lib/portalAuth'
import { insertNotifications } from '@/lib/serverNotify'

export const dynamic = 'force-dynamic'
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

async function myProperty(s: ReturnType<typeof svc>, personId: string) {
  const t = today()
  const { data } = await s.from('tenancies').select('property_id').or(`person_id.eq.${personId},co_tenant_id.eq.${personId}`).is('let_cancelled_at', null).lte('start_date', t).or(`end_date.is.null,end_date.gte.${t}`).order('start_date', { ascending: false }).limit(1).maybeSingle()
  return (data as any)?.property_id as string | undefined
}

export async function GET(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.role !== 'tenant') return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = svc()
  const pid = await myProperty(s, c.personId)
  if (!pid) return NextResponse.json({ day: null, next: null })
  const { data: p } = await s.from('properties').select('bin_collection_day, council_name, council_website, house_info').eq('id', pid).maybeSingle() as { data: any }
  // no bin day set, but the house guide has one ("Bin Day: Every Friday") — use that
  if (p && !p.bin_collection_day) { const item = ((p.house_info?.items ?? []) as any[]).find(i => /bin/i.test(String(i?.label ?? ''))); if (item?.value) p.bin_collection_day = String(item.value).replace(/^every\s+/i, '') }
  const { data: b } = await s.from('properties').select('bin_schedule, bin_checked_at, bin_source').eq('id', pid).maybeSingle() as { data: any }   // migration 289
  const next = Array.isArray(b?.bin_schedule) ? (b.bin_schedule as any[]).find(d => d.date >= today()) : null
  return NextResponse.json({
    day: p?.bin_collection_day ?? null, councilName: p?.council_name ?? null, councilWebsite: p?.council_website ?? null,
    next: next ? { date: next.date, names: (next.collections ?? []).map((x: any) => x.name).filter(Boolean) } : null,
    checkedAt: b?.bin_checked_at ?? null, source: b?.bin_source ?? (p?.bin_collection_day ? 'manual' : null),
  })
}

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.role !== 'tenant' || c.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const kind = b.kind === 'changed' ? 'changed' : 'missed'
  const s = svc()
  const pid = await myProperty(s, c.personId)
  if (!pid) return NextResponse.json({ error: 'No current tenancy.' }, { status: 404 })
  // one report per house per day is plenty
  const { data: dup } = await s.from('bin_reports').select('id').eq('property_id', pid).eq('kind', kind).gte('created_at', `${today()}T00:00:00Z`).limit(1)
  if (dup?.length) return NextResponse.json({ ok: true, already: true })
  await s.from('bin_reports').insert({ property_id: pid, person_id: c.personId, kind, left_out: typeof b.leftOut === 'boolean' ? b.leftOut : null, note: String(b.note ?? '').slice(0, 300) || null })
  if (b.leftOut !== false) {
    const { data: prop } = await s.from('properties').select('name').eq('id', pid).maybeSingle() as { data: any }
    const { data: admins } = await s.from('people').select('id').eq('role', 'administrator')
    await insertNotifications(s as any, ((admins ?? []) as any[]).map(a => a.id), { title: `Bins not collected at ${prop?.name ?? 'a property'}`, body: kind === 'missed' ? 'A tenant says the bins were out but weren’t collected — check the day with the council and update it.' : 'A tenant says the bin day has changed — check with the council and update it.', type: 'admin', link: `/admin/properties/${pid}` } as any).catch(() => null)
  }
  return NextResponse.json({ ok: true })
}

// Deposits: every current tenancy — amount, the 5-week cap, protection (scheme, reference, date) and
// prescribed information, against the 30-day legal deadline from the start of the tenancy.
// GET                         → rows
// PATCH { tenancyId, deposit_amount?, deposit_scheme?, deposit_scheme_ref?, deposit_protected_at?, prescribed_info_served_at? }
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { demoPropertyIds } from '@/lib/demoProperties'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const BASE = 'id, start_date, end_date, rent_amount, deposit_amount, deposit_held_by, deposit_scheme_ref, property_id, rooms(name), properties(name), people!person_id(first_name, last_name, full_name)'
const NEW_COLS = ', deposit_scheme, deposit_protected_at, prescribed_info_served_at'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const today = new Date().toISOString().slice(0, 10)
  const active = (cols: string) => s.from('tenancies').select(cols).or(`end_date.is.null,end_date.gte.${today}`).order('start_date', { ascending: false })
  let res = await active(BASE + NEW_COLS)
  const ready = !res.error
  if (res.error) res = await active(BASE)
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
  const demo = await demoPropertyIds(s)
  const { data: packs } = await s.from('tenancy_packs').select('tenancy_id, sent_at, documents').neq('status', 'withdrawn')
  const piSent = new Map<string, string>()
  for (const p of (packs ?? []) as any[]) if ((p.documents ?? []).some((d: any) => d.key === 'prescribed_info')) {
    const prev = piSent.get(p.tenancy_id); if (!prev || p.sent_at < prev) piSent.set(p.tenancy_id, p.sent_at)
  }

  const rows = ((res.data ?? []) as any[]).filter(t => !demo.has(t.property_id)).map(t => {
    const p = t.people ?? {}
    const rent = Number(t.rent_amount || 0)
    const cap = r2(rent * 12 / 52 * 5)
    const deadline = t.start_date ? new Date(Date.parse(t.start_date) + 30 * 86_400_000).toISOString().slice(0, 10) : null
    const protectedAt = t.deposit_protected_at ?? null
    const hasDeposit = Number(t.deposit_amount || 0) > 0
    const status = !hasDeposit ? 'no_deposit'
      : (protectedAt || t.deposit_scheme_ref) ? 'protected'
      : deadline && today > deadline ? 'overdue' : 'due'
    return {
      tenancyId: t.id, tenant: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Tenant',
      room: t.rooms?.name ?? '', property: String(t.properties?.name || '').split('\n')[0],
      startDate: t.start_date, rent, deposit: Number(t.deposit_amount || 0), cap, overCap: Number(t.deposit_amount || 0) > cap + 0.01,
      scheme: t.deposit_scheme ?? (t.deposit_held_by === 'agent' ? 'DPS custodial' : null), schemeRef: t.deposit_scheme_ref, protectedAt,
      prescribedInfoAt: t.prescribed_info_served_at ?? null, prescribedInfoInPack: piSent.get(t.id)?.slice(0, 10) ?? null,
      deadline, status,
    }
  })
  const order: Record<string, number> = { overdue: 0, due: 1, no_deposit: 2, protected: 3 }
  rows.sort((a, b) => order[a.status] - order[b.status])
  return NextResponse.json({ rows, ready, setupNeeded: ready ? null : 'Run migration 189 in Supabase to record protection and prescribed-information dates.' })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.tenancyId) return NextResponse.json({ error: 'tenancyId required' }, { status: 400 })
  const update: Record<string, unknown> = {}
  const date = (v: unknown) => (v === '' || v == null ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : undefined)
  if ('deposit_amount' in b) { const n = b.deposit_amount === '' ? null : Number(b.deposit_amount); if (n != null && (!isFinite(n) || n < 0)) return NextResponse.json({ error: 'Deposit must be a number.' }, { status: 400 }); update.deposit_amount = n }
  for (const k of ['deposit_scheme', 'deposit_scheme_ref'] as const) if (k in b) update[k] = String(b[k] || '').trim() || null
  for (const k of ['deposit_protected_at', 'prescribed_info_served_at'] as const) if (k in b) {
    const v = date(b[k]); if (v === undefined) return NextResponse.json({ error: 'Dates must be real dates.' }, { status: 400 }); update[k] = v
  }
  const { error } = await svc().from('tenancies').update(update).eq('id', b.tenancyId)
  if (error) return NextResponse.json({ error: error.code === '42703' ? 'Run migration 189 in Supabase first.' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * /api/admin/emergencies — the office's view of emergencies (migration 203).
 *   GET                → { emergencies, list, contractors, settings, lastTick }   open ones first, then the last 30 days
 *   GET ?id=…          → { emergency, responses, events }                          one emergency, everything that happened
 *   POST { action: 'office', id, op: hold|resume|choose|ask_again|dispatch|resolve|cancel|note, responseId?, note? }
 *   POST { action: 'save_contractor', personId, trades, hoursFrom, hoursTo, backupOnly, fee, rank, active, notes }
 *   POST { action: 'remove_contractor', personId }
 *   POST { action: 'settings', values: { auto, windowMin, costLimit, overLimit, followupMin, tenantUpdates } }
 * Office staff; the list and settings are administrators only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { officeAction, settings, tick } from '@/lib/emergencies/engine'
import { KINDS, TRADE_LABEL, type EmergencyKind } from '@/lib/emergencies/guide'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN = ['administrator', 'admin']
const pname = (p: any) => p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company || p.email || '') : ''
const missing = (e: { message?: string } | null) => !!e && /emergenc|does not exist|schema cache/.test(e.message ?? '')
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0]

export async function GET(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  await tick(s).catch(() => null)
  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const [{ data: em, error }, { data: rs }, { data: ev }] = await Promise.all([
      s.from('emergencies').select('*, properties(name, address, postcode, key_safe_code), rooms(name), people!reporter_id(first_name, last_name, full_name, phone, email)').eq('id', id).maybeSingle(),
      s.from('emergency_responses').select('*, people!contractor_id(id, first_name, last_name, full_name, company, phone)').eq('emergency_id', id).order('sent_at'),
      s.from('emergency_events').select('*').eq('emergency_id', id).order('at', { ascending: false }),
    ]) as any[]
    if (error) return NextResponse.json(missing(error) ? { setupNeeded: true } : { error: error.message }, { status: missing(error) ? 200 : 500 })
    if (!em) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({
      emergency: { ...em, kindLabel: KINDS[em.kind as EmergencyKind]?.label ?? em.kind, steps: KINDS[em.kind as EmergencyKind]?.steps ?? [], property: firstLine(em.properties?.name), room: em.rooms?.name ?? null, tenant: em.people ? { name: pname(em.people), phone: em.people.phone, email: em.people.email } : null },
      responses: ((rs ?? []) as any[]).map(r => ({ ...r, name: pname(r.people), phone: r.people?.phone ?? null, chosen: r.id === em.chosen_response_id })),
      events: ev ?? [],
    })
  }

  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const [{ data: ems, error }, { data: list }, { data: cons }, set, { data: lt }] = await Promise.all([
    s.from('emergencies').select('id, kind, title, status, eta_at, call_out_fee, created_at, updated_at, window_ends_at, properties(name), rooms(name), emergency_responses(id, answer, contractor_id)').gte('created_at', since).order('created_at', { ascending: false }),
    s.from('emergency_contractors').select('*, people!person_id(id, first_name, last_name, full_name, company, phone)').order('rank'),
    s.from('people').select('id, first_name, last_name, full_name, company, phone').eq('role', 'contractor').order('first_name'),
    settings(s),
    s.from('system_settings').select('value').eq('key', 'emergency_last_tick').maybeSingle(),
  ]) as any[]
  if (error) return NextResponse.json(missing(error) ? { setupNeeded: true, emergencies: [], list: [], contractors: [] } : { error: error.message }, { status: missing(error) ? 200 : 500 })
  const order = (st: string) => ['awaiting_office', 'collecting', 'assigned', 'on_site', 'needs_return', 'office_handling', 'call_999', 'morning'].indexOf(st)
  return NextResponse.json({
    emergencies: ((ems ?? []) as any[]).map(e => ({
      id: e.id, kind: KINDS[e.kind as EmergencyKind]?.label ?? e.kind, title: e.title, status: e.status, etaAt: e.eta_at, fee: e.call_out_fee, createdAt: e.created_at,
      windowEndsAt: e.window_ends_at, where: [e.rooms?.name, firstLine(e.properties?.name)].filter(Boolean).join(', '),
      asked: (e.emergency_responses ?? []).length, yes: (e.emergency_responses ?? []).filter((r: any) => r.answer === 'yes').length,
    })).sort((a, b) => { const oa = order(a.status), ob = order(b.status); return (oa < 0 ? 99 : oa) - (ob < 0 ? 99 : ob) || b.createdAt.localeCompare(a.createdAt) }),
    list: ((list ?? []) as any[]).map(c => ({ personId: c.person_id, name: pname(c.people), phone: c.people?.phone ?? null, trades: c.trades ?? [], hoursFrom: c.hours_from, hoursTo: c.hours_to, backupOnly: c.backup_only, fee: c.call_out_fee, rank: c.rank, active: c.active, notes: c.notes })),
    contractors: ((cons ?? []) as any[]).map(p => ({ id: p.id, name: pname(p), phone: p.phone ?? null })),
    trades: TRADE_LABEL,
    settings: set,
    lastTick: lt?.value ?? null,
  })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: me } = await s.from('people').select('first_name, last_name, full_name').eq('id', caller.personId).maybeSingle()
  const by = pname(me) || caller.email

  if (b.action === 'office') {
    const out = await officeAction(s, String(b.id ?? ''), by, { action: String(b.op ?? ''), responseId: b.responseId, note: b.note })
    return NextResponse.json(out, { status: (out as any).error ? 400 : 200 })
  }

  if (!ADMIN.includes(caller.role)) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })

  if (b.action === 'save_contractor') {
    const trades = (Array.isArray(b.trades) ? b.trades : []).filter((t: string) => t in TRADE_LABEL)
    if (!b.personId || !trades.length) return NextResponse.json({ error: 'Choose the contractor and at least one trade' }, { status: 400 })
    const clampH = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d }
    const { error } = await s.from('emergency_contractors').upsert({
      person_id: b.personId, trades, hours_from: clampH(b.hoursFrom, 0, 0, 23), hours_to: clampH(b.hoursTo, 24, 1, 24),
      backup_only: !!b.backupOnly, call_out_fee: b.fee === '' || b.fee == null ? null : Number(b.fee), rank: clampH(b.rank, 5, 1, 9),
      active: b.active !== false, notes: String(b.notes ?? '').slice(0, 500) || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'person_id' })
    return error ? NextResponse.json({ error: missing(error) ? 'Run migration 203 first' : error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }
  if (b.action === 'remove_contractor') {
    const { error } = await s.from('emergency_contractors').delete().eq('person_id', String(b.personId ?? ''))
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }
  if (b.action === 'settings') {
    const v = b.values ?? {}
    const rows = [
      ['emergency_auto', v.auto ? 'true' : 'false'],
      ['emergency_window_min', String(Math.min(60, Math.max(2, Number(v.windowMin) || 10)))],
      ['emergency_cost_limit', String(Math.max(0, Number(v.costLimit) || 150))],
      ['emergency_over_limit', v.overLimit === 'wait' ? 'wait' : 'send_after_15'],
      ['emergency_followup_min', String(Math.min(240, Math.max(15, Number(v.followupMin) || 60)))],
      ['emergency_tenant_updates', v.tenantUpdates ? 'true' : 'false'],
    ].map(([key, value]) => ({ key, value }))
    const { error } = await s.from('system_settings').upsert(rows, { onConflict: 'key' })
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// Deposits: every current tenancy — amount, the 5-week cap, protection (scheme, reference, date) and
// prescribed information, against the 30-day legal deadline from the start of the tenancy.
// GET                         → rows
// PATCH { tenancyId, deposit_amount?, deposit_scheme?, deposit_scheme_ref?, deposit_protected_at?, prescribed_info_served_at? }
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { demoPropertyIds } from '@/lib/demoProperties'
import { isLetOnly } from '@/lib/tenancy/depositHolder'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { managedMoveInReceipt } from '@/lib/finance/initialMonies'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { getElectedCommsLive } from '@/lib/comms'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const BASE = 'id, start_date, end_date, rent_amount, deposit_amount, deposit_held_by, deposit_scheme_ref, property_id, rooms(name, is_let_only), properties(name, letting_type), people!person_id(salutation, first_name, last_name, full_name)'
const NEW_COLS = ', deposit_scheme, deposit_protected_at, prescribed_info_served_at, deposit_protection_assumed'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
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
    // let only: the landlord holds and protects the deposit — not ours to protect (3 Nov 2026 audit)
    const landlords = t.properties?.letting_type === 'let_only' || !!t.rooms?.is_let_only
    const status = landlords ? 'landlord' : !hasDeposit ? 'no_deposit'
      : (protectedAt || t.deposit_scheme_ref || t.deposit_protection_assumed) ? 'protected'   // assumed = began before CROS records
      : deadline && today > deadline ? 'overdue' : 'due'
    return {
      tenancyId: t.id, tenant: [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Tenant',
      room: t.rooms?.name ?? '', property: String(t.properties?.name || '').split('\n')[0],
      startDate: t.start_date, rent, deposit: Number(t.deposit_amount || 0), cap, overCap: Number(t.deposit_amount || 0) > cap + 0.01,
      scheme: t.deposit_scheme ?? (t.deposit_held_by === 'agent' ? 'DPS custodial' : null), schemeRef: t.deposit_scheme_ref, protectedAt,
      prescribedInfoAt: t.prescribed_info_served_at ?? null, prescribedInfoInPack: piSent.get(t.id)?.slice(0, 10) ?? null,
      deadline, status,
    }
  })
  const order: Record<string, number> = { overdue: 0, due: 1, no_deposit: 2, protected: 3, landlord: 4 }
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

// POST — a managed tenancy's deposit through the client account (migration 258; Harry, 3 Nov 2026):
//   { action: 'received', tenancyId, on, amount }               the deposit arrived in the client account
//   { action: 'sent', tenancyId, on, amount, reference }        sent to the DPS to be protected
// Let-only deposits never come here: they go to the landlord inside the initial monies. Each is recorded once; the
// tenancy's activity keeps the trail.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = svc()
  const { data: t } = await s.from('tenancies').select('id, deposit_amount, deposit_held_by, deposit_received_on, deposit_received_amount, deposit_sent_on, rooms(is_let_only), properties(letting_type)').eq('id', String(b.tenancyId ?? '')).maybeSingle() as { data: any; error: any }
  if (!t) return NextResponse.json({ error: 'Tenancy not found — or run migration 258 in Supabase first.' }, { status: 404 })
  if (isLetOnly(t.properties?.letting_type, t.rooms?.is_let_only)) return NextResponse.json({ error: 'This is a let-only tenancy — its deposit goes to the landlord with the initial monies, not to the DPS.' }, { status: 409 })
  const on = String(b.on ?? ''), amount = Math.round(Number(b.amount) * 100) / 100
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return NextResponse.json({ error: 'Enter the date.' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ error: 'Enter the amount.' }, { status: 400 })
  const pounds = (n: number) => `£${n.toFixed(2)}`
  if (b.action === 'received') {
    if (t.deposit_received_on) return NextResponse.json({ error: `Already recorded as received on ${t.deposit_received_on}.` }, { status: 409 })
    const { error } = await s.from('tenancies').update({ deposit_received_on: on, deposit_received_amount: amount }).eq('id', t.id).is('deposit_received_on', null)
    if (error) return NextResponse.json({ error: error.code === '42703' ? 'Run migration 258 in Supabase first.' : error.message }, { status: 500 })
    await logTenancyEvent(s as any, t.id, 'deposit_received', `Deposit ${pounds(amount)} received into the client account on ${on}${Math.abs(amount - Number(t.deposit_amount || 0)) > 0.005 ? ` (the agreed deposit is ${pounds(Number(t.deposit_amount || 0))})` : ''}`, admin.email)
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'sent') {
    if (!t.deposit_received_on) return NextResponse.json({ error: 'Record the deposit as received first.' }, { status: 409 })
    if (t.deposit_sent_on) return NextResponse.json({ error: `Already recorded as sent to the DPS on ${t.deposit_sent_on}.` }, { status: 409 })
    if (on < t.deposit_received_on) return NextResponse.json({ error: 'It can’t be sent before it was received.' }, { status: 400 })
    if (amount > Number(t.deposit_received_amount) + 0.005) return NextResponse.json({ error: `Only ${pounds(Number(t.deposit_received_amount))} was received.` }, { status: 409 })
    const reference = String(b.reference ?? '').trim()
    if (!reference) return NextResponse.json({ error: 'Enter the payment reference you used with the DPS.' }, { status: 400 })
    const { error } = await s.from('tenancies').update({ deposit_sent_on: on, deposit_sent_amount: amount, deposit_sent_reference: reference }).eq('id', t.id).is('deposit_sent_on', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const days = Math.round((Date.parse(on) - Date.parse(t.deposit_received_on)) / 86_400_000)
    await logTenancyEvent(s as any, t.id, 'deposit_sent', `Deposit ${pounds(amount)} sent to the DPS on ${on} · ref ${reference}${days > 30 ? ` — ${days} days after it was received (the limit is 30)` : ''}`, admin.email)
    return NextResponse.json({ ok: true, late: days > 30 })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// PUT { tenancyId, preview? } — a managed let's move-in receipt (lib/finance/initialMonies managedMoveInReceipt):
// previewed, then sent by the office; the send is noted on the letting file.
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = svc()
  const rc = await managedMoveInReceipt(s as any, String(b.tenancyId ?? ''))
  if ('error' in rc) return NextResponse.json({ error: rc.error }, { status: 409 })
  if (b.preview) return NextResponse.json(rc)
  if (!rc.to) return NextResponse.json({ error: 'No email address for the tenant.' }, { status: 422 })
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages you send are switched off in Settings. Nothing was sent.' }, { status: 409 })
  const { ok, error } = await sendEmail(rc.to, rc.subject, messageHtml(rc.text), { req })
  if (!ok) return NextResponse.json({ error: error ?? 'The email didn’t send' }, { status: 502 })
  await logTenancyEvent(s as any, String(b.tenancyId), 'move_in_receipt', `Move-in receipt emailed to ${rc.to}`, admin.email)
  return NextResponse.json({ ok: true, to: rc.to })
}

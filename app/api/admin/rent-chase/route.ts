// Rent chase (1 Nov 2026, Harry: "import rents on 2nd Nov … 10 received and 40 missing … go through list just to
// confirm the rent amount owed and then click to send at the end").
//   GET  → { rows: [{ tenancyId, tenants, room, house, rent, owed, owedMonths, ref, email, phone, letOnly }] }
//          every current tenancy with rent unpaid, from its rent account (lib/finance/tenantAccount)
//   POST { messageId: 'rent-late'|'rent-late-2'|'rent-due', channels, items: [{ tenancyId, owed }] } → { results }
//          each tenant gets the message with the amount the office confirmed
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { getElectedCommsLive } from '@/lib/comms'
import { CROS_COLLECTS_RENT } from '@/lib/finance/mode'
import { QUICK_MESSAGES, sendToTenancy, tenancyFacts, unfilled, fillMessage, type Channel, type TenancyFacts } from '@/lib/tenancy/quickMessages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function inBatches<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < xs.length; i += n) out.push(...await Promise.all(xs.slice(i, i + n).map(fn)))
  return out
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  // statements only: nothing can be chased from CROS, so don't spend 15 seconds working out every rent account
  if (!CROS_COLLECTS_RENT) return NextResponse.json({ rows: [], checked: 0, statementsOnly: true })
  const { data: ts, error } = await s.from('tenancies').select('id, properties!inner(is_demo)').is('let_cancelled_at', null)
    .lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = ((ts ?? []) as any[]).filter(t => !t.properties?.is_demo).map(t => t.id)
  const facts = (await inBatches(ids, 8, id => tenancyFacts(s, id).catch(() => null))).filter((f): f is TenancyFacts => !!f && !f.letOnly)
  const rows = facts.filter(f => f.owed > 0.005).map(f => ({
    tenancyId: f.tenancyId, tenants: f.tenants.map(t => t.name).join(' & '), room: f.room, house: f.house, rent: f.rent, owed: f.owed,
    owedMonths: f.owedMonths, ref: f.paymentRef, email: f.tenants.some(t => t.email), phone: f.tenants.some(t => t.phone),
  })).sort((a, b) => a.house.localeCompare(b.house) || a.room.localeCompare(b.room, undefined, { numeric: true }))
  return NextResponse.json({ rows, checked: facts.length })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages you send are switched off in Settings. Nothing was sent.' }, { status: 409 })
  // statements-only mode: CROS doesn't hold the rent figures, so it mustn't tell tenants what they owe (lib/finance/mode)
  if (!CROS_COLLECTS_RENT) return NextResponse.json({ error: 'CROS is on statements only — rent is collected in your other system, so rent reminders aren’t sent from here. Nothing was sent.' }, { status: 409 })
  const b = await req.json().catch(() => ({}))
  const msg = QUICK_MESSAGES.find(m => m.id === b.messageId && m.group === 'Rent')
  if (!msg) return NextResponse.json({ error: 'Choose which reminder to send' }, { status: 400 })
  const channels = (Array.isArray(b.channels) ? b.channels : []).filter((c: string) => ['email', 'sms', 'push'].includes(c)) as Channel[]
  if (!channels.length) return NextResponse.json({ error: 'Choose email, text or app notification' }, { status: 400 })
  const extra = String(b.date ?? '').trim()   // the "[date — 7 days from today]" of the second reminder
  const fill = (t: string) => extra ? t.replace(/\[date[^\]]*\]/g, extra) : t
  const tmpl = { subject: fill(msg.subject), email: fill(msg.email), sms: fill(msg.sms) }
  const gaps = unfilled(tmpl.subject, tmpl.email, tmpl.sms)
  if (gaps.length) return NextResponse.json({ error: `Fill in ${gaps.join(', ')} first. Nothing was sent.` }, { status: 400 })
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200)
  if (!items.length) return NextResponse.json({ error: 'Tick at least one tenant' }, { status: 400 })
  const s = createServiceClient()
  const results = []
  for (const it of items) {
    const f = await tenancyFacts(s, String(it.tenancyId)).catch(() => null)
    if (!f) { results.push({ tenancyId: it.tenancyId, error: 'not found' }); continue }
    const owed = Number(it.owed)
    if (Number.isFinite(owed) && owed > 0) f.owed = Math.round(owed * 100) / 100   // the amount the office confirmed
    results.push({ tenancyId: f.tenancyId, sent: await sendToTenancy(f, { ...tmpl, channels, req }) })
  }
  return NextResponse.json({ results })
}
// preview of one row's message, for the screen
export async function PUT(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const msg = QUICK_MESSAGES.find(m => m.id === b.messageId)
  const f = msg ? await tenancyFacts(createServiceClient(), String(b.tenancyId ?? '')) : null
  if (!msg || !f) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (Number(b.owed) > 0) f.owed = Number(b.owed)
  return NextResponse.json({ subject: fillMessage(msg.subject, f), email: fillMessage(msg.email, f), sms: fillMessage(msg.sms, f) })
}

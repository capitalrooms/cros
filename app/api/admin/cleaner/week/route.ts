// /api/admin/cleaner/week — the weekly cleaner email on the Cleaning screen (11 Nov 2026, migration 276).
//   GET ?week=YYYY-MM-DD (any day; defaults to the week the next email is about)
//        → { ready, setting, days, weekStart, weekEnd, cleaners: [{ …, subject, html, sent }], unassigned, houses }
//   POST { setting }                                          → when it goes: off · sunday · monday
//   POST { action: 'task', propertyId, roomId?, weekStart, task, extraHours? } → an extra job that week
//   POST { action: 'cancelTask', id }
//   POST { action: 'test', cleanerId, weekStart }             → that cleaner's email, to you, marked as a test
//   POST { action: 'send', weekStart }                        → send the week now (anyone not yet sent)
// Office staff with Maintenance (lib/access/areas: /api/admin/cleaner).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/sendEmail'
import { buildWeekPlan, mondayOf, sendWeekEmails, weekEmail, weekEmailDay, weekForEmail, londonToday, WEEK_EMAIL_DAYS, WEEK_EMAIL_KEY, weekChannel, WEEK_CHANNELS, WEEK_CHANNEL_KEY } from '@/lib/cleans/weekPlan'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const missing = (m: string) => /clean_week_tasks|clean_week_emails|clean_hours|does not exist|schema cache/i.test(m)
const isoOk = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const asked = req.nextUrl.searchParams.get('week')
  const weekStart = isoOk(asked) ? mondayOf(asked!) : weekForEmail(londonToday())
  const probe = await s.from('clean_week_tasks').select('id').limit(1)
  if (probe.error && missing(probe.error.message)) return NextResponse.json({ ready: false, setting: 'off', days: WEEK_EMAIL_DAYS, weekStart })
  const [plan, setting, channel, { data: sent }, { data: houses }] = await Promise.all([
    buildWeekPlan(s, weekStart), weekEmailDay(s), weekChannel(s),
    s.from('clean_week_emails').select('cleaner_id, sent_at').eq('week_start', weekStart),
    s.from('properties').select('id, name, rooms(id, name)').order('name'),
  ])
  const sentAt = new Map(((sent ?? []) as any[]).map(r => [r.cleaner_id, r.sent_at]))
  return NextResponse.json({
    ready: true, setting, days: WEEK_EMAIL_DAYS, channel, channels: WEEK_CHANNELS, weekStart: plan.weekStart, weekEnd: plan.weekEnd, unassigned: plan.unassigned,
    cleaners: plan.cleaners.map(c => ({ cleanerId: c.cleanerId, name: c.name, email: c.email, test: c.test, houses: c.houses, sentAt: sentAt.get(c.cleanerId) ?? null, ...weekEmail(c, plan) })),
    houses: ((houses ?? []) as any[]).map(h => ({ id: h.id, name: h.name, rooms: ((h.rooms ?? []) as any[]).map(r => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) })),
  })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()

  if (b.setting !== undefined) {
    if (!WEEK_EMAIL_DAYS.some(d => d.value === b.setting)) return NextResponse.json({ error: 'Pick when it goes.' }, { status: 400 })
    const { error } = await s.from('system_settings').upsert({ key: WEEK_EMAIL_KEY, value: b.setting }, { onConflict: 'key' })
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  if (b.channel !== undefined) {
    if (!WEEK_CHANNELS.some(c => c.value === b.channel)) return NextResponse.json({ error: 'Pick how it reaches them.' }, { status: 400 })
    const { error } = await s.from('system_settings').upsert({ key: WEEK_CHANNEL_KEY, value: b.channel }, { onConflict: 'key' })
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  if (b.action === 'task') {
    const task = String(b.task ?? '').trim().slice(0, 300)
    if (!task) return NextResponse.json({ error: 'Say what needs doing.' }, { status: 400 })
    if (!isoOk(b.weekStart)) return NextResponse.json({ error: 'Pick the week.' }, { status: 400 })
    const hours = b.extraHours === '' || b.extraHours == null ? null : Number(b.extraHours)
    if (hours !== null && !(hours > 0 && hours <= 12)) return NextResponse.json({ error: 'Extra time: up to 12 hours.' }, { status: 400 })
    const { error } = await s.from('clean_week_tasks').insert({ property_id: String(b.propertyId ?? ''), room_id: b.roomId || null, week_start: mondayOf(b.weekStart), task, extra_hours: hours, created_by: caller.email ?? null })
    return error ? NextResponse.json({ error: missing(error.message) ? 'Run migration 276 first.' : error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }

  if (b.action === 'cancelTask') {
    const { error } = await s.from('clean_week_tasks').update({ cancelled_at: new Date().toISOString() }).eq('id', String(b.id ?? ''))
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
  }

  if (b.action === 'test') {
    if (!isoOk(b.weekStart)) return NextResponse.json({ error: 'Pick the week.' }, { status: 400 })
    if (!caller.email) return NextResponse.json({ error: 'Your login has no email address.' }, { status: 400 })
    const plan = await buildWeekPlan(s, mondayOf(b.weekStart))
    const c = plan.cleaners.find(x => x.cleanerId === b.cleanerId)
    if (!c) return NextResponse.json({ error: 'That cleaner has nothing that week.' }, { status: 400 })
    const { subject, html } = weekEmail(c, plan)
    const note = `<p style="margin:0 0 16px;padding:10px 12px;border-radius:8px;background:#fef3c7;font-size:13px;color:#78350f;">Test copy of the email ${c.name} would get. Only you were sent this.</p>`
    const r = await sendEmail(caller.email, `[Test] ${subject}`, note + html, { kind: 'cleaner-week' })
    return r.ok ? NextResponse.json({ ok: true, to: caller.email }) : NextResponse.json({ error: r.error ?? 'Email failed' }, { status: 500 })
  }

  if (b.action === 'send') {
    if (!isoOk(b.weekStart)) return NextResponse.json({ error: 'Pick the week.' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await sendWeekEmails(s, mondayOf(b.weekStart))) })
  }
  return NextResponse.json({ error: 'Unknown request' }, { status: 400 })
}

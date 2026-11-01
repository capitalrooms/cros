// One-click messages to a tenancy's tenants (lib/tenancy/quickMessages).
//   GET  ?tenancyId=…  → { facts, messages: [{ id, group, name, subject, email, sms }] }  each filled from the tenancy
//   POST { tenancyId, subject, email, sms, channels: ['email'|'sms'|'push'], sendAgainOn?: 'YYYY-MM-DD', onlyLater? } → { results, scheduledOn }
//   DELETE ?id=… → cancel a scheduled one
// Staff-chosen, so it follows the "messages you send" switch (getElectedCommsLive), not the automatic pause.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { getElectedCommsLive } from '@/lib/comms'
import { QUICK_MESSAGES, fillMessage, sendToTenancy, tenancyFacts, unfilled, type Channel } from '@/lib/tenancy/quickMessages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const f = await tenancyFacts(createServiceClient(), req.nextUrl.searchParams.get('tenancyId') ?? '')
  if (!f) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const { data: scheduled } = await createServiceClient().from('scheduled_tenant_messages').select('id, send_on, name, channels, sent_at, cancelled_at, result')
    .eq('tenancy_id', f.tenancyId).order('send_on', { ascending: false }).limit(20)   // empty before migration 256
  return NextResponse.json({
    scheduled: scheduled ?? [],
    facts: f,
    messages: QUICK_MESSAGES.map(m => ({ id: m.id, group: m.group, name: m.name, subject: fillMessage(m.subject, f), email: fillMessage(m.email, f), sms: fillMessage(m.sms, f) })),
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages you send are switched off in Settings. Nothing was sent.' }, { status: 409 })
  const b = await req.json().catch(() => ({}))
  const channels = (Array.isArray(b.channels) ? b.channels : []).filter((c: string) => ['email', 'sms', 'push'].includes(c)) as Channel[]
  if (!channels.length) return NextResponse.json({ error: 'Choose email, text or app notification' }, { status: 400 })
  const subject = String(b.subject ?? '').trim(), email = String(b.email ?? '').trim(), sms = String(b.sms ?? '').trim()
  const gaps = unfilled(subject, channels.includes('email') ? email : '', channels.some((c: string) => c !== 'email') ? sms : '')
  if (gaps.length) return NextResponse.json({ error: `Fill in ${gaps.join(', ')} first. Nothing was sent.` }, { status: 400 })
  const f = await tenancyFacts(createServiceClient(), String(b.tenancyId ?? ''))
  if (!f) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  if (!f.tenants.length) return NextResponse.json({ error: 'No tenant on this tenancy' }, { status: 400 })
  // "send again on …" (migration 256): kept and sent by the morning job on that date
  const later = String(b.sendAgainOn ?? '')
  let scheduledOn: string | null = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(later)) {
    const { error } = await createServiceClient().from('scheduled_tenant_messages').insert({ tenancy_id: f.tenancyId, send_on: later, channels, subject, email, sms, name: String(b.name ?? '').slice(0, 120) || null, created_by: (await requireStaff(req))?.email ?? null })
    if (error) return NextResponse.json({ error: /scheduled_tenant_messages/.test(error.message) ? 'Sending again on a date needs migration 256 running in Supabase. Nothing was sent.' : error.message }, { status: 500 })
    scheduledOn = later
  }
  if (b.onlyLater && scheduledOn) return NextResponse.json({ results: [], scheduledOn })
  return NextResponse.json({ results: await sendToTenancy(f, { subject, email, sms, channels, req }), scheduledOn })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await createServiceClient().from('scheduled_tenant_messages').update({ cancelled_at: new Date().toISOString() }).eq('id', req.nextUrl.searchParams.get('id') ?? '').is('sent_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

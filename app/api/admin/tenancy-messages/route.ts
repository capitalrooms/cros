// One-click messages to a tenancy's tenants (lib/tenancy/quickMessages).
//   GET  ?tenancyId=…  → { facts, messages: [{ id, group, name, subject, email, sms }] }  each filled from the tenancy
//   POST { tenancyId, subject, email, sms, channels: ['email'|'sms'|'push'] } → { results }
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
  return NextResponse.json({
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
  return NextResponse.json({ results: await sendToTenancy(f, { subject, email, sms, channels, req }) })
}

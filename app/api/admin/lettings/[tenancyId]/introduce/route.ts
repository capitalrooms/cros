// "Introduce to housemates" (6 Nov 2026): in a house Capital Rooms manages, the people already living there get a
// short email about who's moving in — the new tenant's photo and the talking points they chose to share in their
// move-in pack (lib/housemates/profile). Never contact, rent or deposit details. Each housemate gets their own email,
// so no one's address is shown to anyone else. Nothing goes without the office pressing Send.
//   GET                  → { ready, why?, first, recipients: [{ name, room }], html } (the email, for the preview)
//   POST                 → sends it; logged on the letting file
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { deliverEmail } from '@/lib/sendEmail'
import { landlordUpdateHtml } from '@/lib/landlordUpdates/email'
import { loadUpdateContext, housemateCard } from '@/lib/landlordUpdates/updates'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { dearName } from '@/lib/people'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const long = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

async function build(tenancyId: string, req: NextRequest) {
  const s = createServiceClient()
  const c = await loadUpdateContext(s as any, { tenancyId })
  if (!c) return { error: 'Tenancy not found', status: 404 as const }
  const { data: t } = await s.from('tenancies').select('property_id, person_id, let_cancelled_at').eq('id', tenancyId).single() as { data: any }
  if (t.let_cancelled_at) return { ready: false, why: 'This let fell through' }
  if (c.letOnly) return { ready: false, why: 'A let-only house — send the landlord the “Meet your new housemate” card to forward instead' }
  if (c.whole) return { ready: false, why: 'A whole-home let — there are no housemates' }
  const card = housemateCard(c)
  if (!card) return { ready: false, why: 'The tenant hasn’t said hello in their move-in pack yet (or chose not to share it)' }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data: others } = await s.from('tenancies')
    .select('id, person_id, rooms(name), people:person_id(salutation, first_name, last_name, email)')
    .eq('property_id', t.property_id).neq('person_id', t.person_id).is('let_cancelled_at', null)
    .lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  const seen = new Set<string>()
  const recipients = ((others ?? []) as any[]).filter(o => o.people?.email && !seen.has(o.people.email.toLowerCase()) && seen.add(o.people.email.toLowerCase()))
    .map(o => ({ email: String(o.people.email), name: [o.people.first_name, o.people.last_name].filter(Boolean).join(' '), room: o.rooms?.name ?? '', dear: dearName(o.people) }))
  if (!recipients.length) return { ready: false, why: 'Nobody else is living in the house at the moment' }
  const first = card.first
  const when = c.startDate ? ` on ${long(c.startDate)}` : ''
  const room = c.place.split(',')[0]
  const message = [`Hello,`, `We wanted to introduce you to ${first}, who is moving into ${room}${when}. Here’s a little about them, in their own words — something to chat about when you meet.`, `Please do make them feel welcome.`, `Kind regards,`].join('\n\n')
  const headline = { eyebrow: 'Your new housemate', place: c.place, lead: 'Say hello to', street: first, sub: `${room}${c.startDate ? ` · moving in ${long(c.startDate)}` : ''}`, terms: [] }
  const html = await landlordUpdateHtml({ stage: 'housemate', message, facts: [], link: null, until: null, headline, card, req })
  return { ready: true, first, subject: `Meet your new housemate, ${first}`, recipients, html }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r: any = await build((await params).tenancyId, req)
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ...r, recipients: (r.recipients ?? []).map((x: any) => ({ name: x.name, room: x.room })) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const r: any = await build(tenancyId, req)
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status })
  if (!r.ready) return NextResponse.json({ error: r.why }, { status: 409 })
  const sent: string[] = [], failed: string[] = []
  for (const x of r.recipients) {
    const res = await deliverEmail({ to: x.email, subject: r.subject, html: r.html }, { req })
    ;(res.ok ? sent : failed).push(x.name || x.email)
  }
  await logTenancyEvent(createServiceClient() as any, tenancyId, 'housemates_introduced', `Introduced to housemates: ${sent.join(', ') || 'nobody'}${failed.length ? ` (didn’t send to ${failed.join(', ')})` : ''}`, caller.email)
  return NextResponse.json({ ok: true, sent, failed })
}

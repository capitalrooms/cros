/**
 * /api/admin/rooms/[roomId] — the room page (option D, 24 Oct 2026).
 *   GET                                                      → { room overview } (lib/rooms/roomOverview)
 *   POST { action: 'message', personId, email, sms, app, subject, body, preview? }
 *                                                            → sends to a tenant or applicant of this room, through the
 *                                                              same sender as Quick Notify (logged in message_log, 242)
 *   POST { action: 'note', content }                         → an office note on the room
 * Office staff with the Properties area (proxy.ts). Sending needs "Messages you send yourself" switched on.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadRoomOverview } from '@/lib/rooms/roomOverview'
import { dispatchChannels, type NotifyChannels } from '@/lib/serverNotify'
import { getElectedCommsLive } from '@/lib/comms'
import { displayName } from '@/lib/people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { roomId } = await params
  const o = await loadRoomOverview(createServiceClient(), roomId)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: 404 })
  return NextResponse.json(o)
}

const channelsFor = (app: boolean, email: boolean, sms: boolean): NotifyChannels | null =>
  app && email && sms ? 'push_email_sms' : app && email ? 'push_email' : email && sms ? 'email_sms' : app && sms ? 'push_sms' : email ? 'email_only' : sms ? 'sms_only' : app ? 'push_only' : null

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { roomId } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: room } = await s.from('rooms').select('id, name, property_id').eq('id', roomId).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  if (b.action === 'note') {
    const content = String(b.content ?? '').trim().slice(0, 4000)
    if (!content) return NextResponse.json({ error: 'Write the note first' }, { status: 400 })
    const { error } = await s.from('room_notes').insert({ room_id: roomId, content, note_type: 'office', created_by: caller.email })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'message') {
    const personId = String(b.personId ?? '')
    const subject = String(b.subject ?? '').trim().slice(0, 150), body = String(b.body ?? '').trim().slice(0, 4000)
    if (!subject || !body) return NextResponse.json({ error: 'Add a subject and a message' }, { status: 400 })
    const channels = channelsFor(!!b.app, !!b.email, !!b.sms)
    if (!channels) return NextResponse.json({ error: 'Choose email, text or the app' }, { status: 400 })
    // only someone tied to this room: a tenant on one of its tenancies (or the joint tenant)
    const { data: ts } = await s.from('tenancies').select('person_id, co_tenant_id').eq('room_id', roomId).is('let_cancelled_at', null)
    const allowed = new Set(((ts ?? []) as any[]).flatMap(t => [t.person_id, t.co_tenant_id]).filter(Boolean))
    if (!allowed.has(personId)) return NextResponse.json({ error: 'That person isn’t a tenant of this room' }, { status: 403 })
    const { data: p } = await s.from('people').select('id, salutation, first_name, last_name, full_name, email, phone').eq('id', personId).maybeSingle()
    if (!p) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    const missing = [b.email && !p.email ? 'no email address' : '', b.sms && !p.phone ? 'no mobile' : ''].filter(Boolean)
    if (b.preview) return NextResponse.json({ ok: true, to: displayName(p), email: p.email ?? null, phone: p.phone ?? null, missing })
    if (missing.length) return NextResponse.json({ error: `${displayName(p)} has ${missing.join(' and ')} on file` }, { status: 409 })
    if (!(await getElectedCommsLive())) return NextResponse.json({ error: '“Messages you send yourself” is switched off in Settings — switch it on to send this.' }, { status: 409 })
    const r = await dispatchChannels(s, [personId], { title: subject, body, type: 'admin' }, channels, req, { elected: true })
    return NextResponse.json({ ok: true, ...r })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

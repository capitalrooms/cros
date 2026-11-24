// POST /api/tenant/job-update-request — a tenant asks for an update on an open job (Harry, 24 Nov 2026: "ask for an
// update button on open jobs"). Open means not completed or cancelled, booked or not. The request is logged on the job,
// the office is told, and the contractor is told if one is on it. One request per job per day, so it can't be spammed.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { activeTenantIds, insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.role !== 'tenant' || c.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { ticketId?: string }
  const ticketId = String(b.ticketId ?? '')
  if (!ticketId) return NextResponse.json({ error: 'That job wasn’t found.' }, { status: 404 })
  const s = createServiceClient() as any
  const { data: t } = await s.from('maintenance_tickets').select('id, title, notes, property_id, reporter_id, contractor_id, status').eq('id', ticketId).maybeSingle()
  if (!t) return NextResponse.json({ error: 'That job wasn’t found.' }, { status: 404 })
  const living = await activeTenantIds(s, t.property_id).catch(() => [] as string[])
  if (t.reporter_id !== c.personId && !living.includes(c.personId)) return NextResponse.json({ error: 'This job isn’t at your property.' }, { status: 403 })
  if (['completed', 'cancelled'].includes(String(t.status))) return NextResponse.json({ error: 'This job is closed, so there’s nothing to update.' }, { status: 409 })

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })
  const marker = `${today} — Tenant asked for an update`
  if (String(t.notes ?? '').includes(marker)) return NextResponse.json({ error: 'You’ve already asked for an update today. We’ve passed it on.' }, { status: 429 })

  const { data: me } = await s.from('people').select('first_name').eq('id', c.personId).maybeSingle()
  const who = me?.first_name ?? 'Tenant'
  const line = `${marker} (${who}).`
  await s.from('maintenance_tickets').update({ notes: [t.notes, line].filter(Boolean).join('\n') }).eq('id', t.id)

  const short = String(t.title).split(' — ')[0].slice(0, 40)
  const { data: office } = await s.from('people').select('id').eq('role', 'administrator')
  await insertNotifications(s, ((office ?? []) as any[]).map(o => o.id), { title: `Update asked for: “${short}”`, body: `${who} wants to know where this job is up to.`, type: 'maintenance', link: `/admin/maintenance?ticket=${t.id}` } as any).catch(() => null)
  if (t.contractor_id) {
    await insertNotifications(s, [t.contractor_id], { title: 'Tenant asked for an update', body: `${who} would like to know when you can book or where the job is up to.`, type: 'maintenance', link: `/contractor/job/${t.id}` } as any).catch(() => null)
    await sendServerPush({ personId: t.contractor_id, title: 'Tenant asked for an update', body: `${who} would like to know where the job is up to.`, url: `/contractor/job/${t.id}`, tag: `job-${t.id}` } as any).catch(() => 0)
  }
  return NextResponse.json({ ok: true })
}

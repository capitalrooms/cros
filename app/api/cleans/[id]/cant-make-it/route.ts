// POST /api/cleans/<id>/cant-make-it { reason } — the cleaner can't do a clean (12 Nov 2026). The office is alerted
// straight away (email + app notice) to rearrange — give it to someone else, move it, or cancel it (which tells the
// tenants). The clean comes off this cleaner and goes back to unassigned; the tenants hear nothing until the office
// decides. Only the cleaner on that clean.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { OFFICE_ALERT_EMAIL, officeButton } from '@/lib/email/office'

export const dynamic = 'force-dynamic'
const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const reason = String(b.reason ?? '').trim().slice(0, 500)
  const s = createServiceClient()
  const { data: c } = await s.from('cleans').select('id, status, cleaner_id, clean_date, clean_time, admin_note, properties(name)').eq('id', id).maybeSingle() as { data: any }
  if (!c) return NextResponse.json({ error: 'Clean not found' }, { status: 404 })
  if (c.cleaner_id !== me.personId) return NextResponse.json({ error: 'Not your clean' }, { status: 403 })
  if (['completed', 'cancelled'].includes(c.status)) return NextResponse.json({ error: `It’s already ${c.status}` }, { status: 409 })
  const { data: who } = await s.from('people').select('first_name, last_name, full_name').eq('id', me.personId).maybeSingle() as { data: any }
  const name = [who?.first_name, who?.last_name].filter(Boolean).join(' ') || who?.full_name || 'The cleaner'
  const house = String(c.properties?.name ?? 'the house').split('\n')[0]
  const when = `${day(c.clean_date)}${c.clean_time ? ` at ${String(c.clean_time).slice(0, 5)}` : ''}`
  const stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })
  const { error } = await s.from('cleans').update({ cleaner_id: null, accepted_at: null, admin_note: [c.admin_note, `[${stamp}] ${name} can’t make it${reason ? `: ${reason}` : ''}`].filter(Boolean).join('\n') }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await deliverEmail({ to: [OFFICE_ALERT_EMAIL], subject: `Can’t make it: ${name} — clean at ${house}, ${when}`,
    html: await buildEmail(`<p><b>${esc(name)}</b> can’t do the clean at <b>${esc(house)}</b> on <b>${esc(when)}</b>.</p>${reason ? `<p>Their reason: ${esc(reason)}</p>` : ''}<p>It’s back to unassigned. Give it to another cleaner, move it, or cancel it — cancelling tells the tenants.</p>${officeButton('/admin/agency-diary', 'Open the diary')}`, { kind: 'office-visit-booked', signature: false }) }).catch(() => null)
  return NextResponse.json({ ok: true })
}

/**
 * /api/admin/jobs/cancel — close off a maintenance job that won't go ahead (migration 207).
 *   POST { ticketId, reason, tellContractor?, tellTenant? }
 * A reason is required. The job is kept, marked cancelled with who / when / why, and drops out of every live list.
 * An open emergency on it is cancelled too (contractors stood down). Nothing is sent unless ticked.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { officeAction } from '@/lib/emergencies/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const pname = (p: any) => p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email || '') : ''

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const reason = String(b.reason ?? '').trim().slice(0, 1000)
  if (reason.length < 4) return NextResponse.json({ error: 'Say why it’s being cancelled — it’s kept on the record' }, { status: 400 })
  const s = createServiceClient()
  const { data: t } = await s.from('maintenance_tickets').select('id, title, status, contractor_id, reporter_id, property_id, room_id, admin_note').eq('id', String(b.ticketId ?? '')).maybeSingle() as { data: any }
  if (!t) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (t.status === 'completed' || t.status === 'cancelled') return NextResponse.json({ error: `It’s already ${t.status}` }, { status: 409 })
  const { data: me } = await s.from('people').select('first_name, last_name, full_name, email').eq('id', caller.personId).maybeSingle()
  const by = pname(me) || caller.email
  const now = new Date().toISOString()
  const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
  const { error } = await s.from('maintenance_tickets').update({
    status: 'cancelled', cancelled_at: now, cancelled_by: caller.personId, cancel_reason: reason,
    admin_note: [t.admin_note, `[${day}] Cancelled by ${by}: ${reason}`].filter(Boolean).join('\n'), updated_at: now,
  }).eq('id', t.id)
  if (error) return NextResponse.json({ error: /cancel/.test(error.message) ? 'Run migration 207 first' : error.message }, { status: 400 })

  // an open emergency on this job: cancel it and stand everyone down
  const { data: em } = await s.from('emergencies').select('id, status').eq('ticket_id', t.id).maybeSingle()
  if (em && !['resolved', 'cancelled'].includes(em.status)) await officeAction(s, em.id, by, { action: 'cancel', note: reason })

  const told: string[] = []
  if (b.tellContractor && t.contractor_id) {
    const title = 'Job cancelled', body = `“${t.title}” has been cancelled — no need to attend. Reason: ${reason}`
    await insertNotifications(s, [t.contractor_id], { title, body, type: 'maintenance', link: '/contractor' })
    await sendServerPush({ personId: t.contractor_id, title, body, url: '/contractor', tag: `job-${t.id}` })
    told.push('the contractor')
  }
  if (b.tellTenant) {
    // reporter_id is an auth id on older jobs; find the person either way
    let pid: string | null = null
    if (t.reporter_id) {
      const { data: rep } = await s.from('people').select('id').eq('id', t.reporter_id).maybeSingle()
      pid = (rep as any)?.id ?? null
      if (!pid) {
        const { data: u } = await s.auth.admin.getUserById(t.reporter_id).catch(() => ({ data: { user: null } }) as any)
        if (u?.user?.email) {
          const { data: byEmail } = await s.from('people').select('id').ilike('email', u.user.email).maybeSingle()
          pid = (byEmail as any)?.id ?? null
        }
      }
    }
    if (pid) {
      const title = 'Your repair request', body = `We’ve closed “${t.title}”. ${reason}`
      await insertNotifications(s, [pid], { title, body, type: 'maintenance', link: '/tenant' }, { propertyId: t.property_id, roomId: t.room_id })
      await sendServerPush({ personId: pid, title, body, url: '/tenant', tag: `job-${t.id}` })
      told.push('the tenant')
    }
  }
  return NextResponse.json({ ok: true, told })
}

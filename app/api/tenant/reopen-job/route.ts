// POST /api/tenant/reopen-job { ticketId, reason: 'not_done' | 'broke_again' | 'more_needed', note? }
// A tenant reopens a repair that was marked done (within REOPEN_DAYS). The job goes straight back to the same contractor
// — told by text / app / email as they've chosen — and the office is told. (21 Oct 2026; migration 236.)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn, canActAtProperty } from '@/lib/portalAuth'
import { tellContractor } from '@/lib/contractorContact'
import { insertNotifications } from '@/lib/serverNotify'
import { PORTAL_URL } from '@/lib/emailTemplate'
import { REOPEN_REASONS, REOPEN_DAYS, canReopen, type ReopenReason } from '@/lib/repairs/targets'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const caller = await requireSignedIn(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const reason = String(b.reason ?? '') as ReopenReason
  if (!b.ticketId || !(reason in REOPEN_REASONS)) return NextResponse.json({ error: 'Choose why it needs looking at again' }, { status: 400 })
  const note = String(b.note ?? '').trim().slice(0, 1000)
  if (reason === 'more_needed' && !note) return NextResponse.json({ error: 'Say what else needs doing' }, { status: 400 })

  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: t } = await s.from('maintenance_tickets').select('id, title, category, status, completed_at, property_id, contractor_id, reopen_count, notes, properties(name), rooms(name)').eq('id', String(b.ticketId)).maybeSingle() as { data: any }
  if (!t) return NextResponse.json({ error: 'Repair not found' }, { status: 404 })
  if (!(caller.role === 'tenant' && t.property_id && await canActAtProperty(caller, t.property_id, s))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canReopen(t)) return NextResponse.json({ error: t.status === 'completed' ? `It's more than ${REOPEN_DAYS} days since this was finished — please report it as a new issue` : 'This repair is still open — we’re on it' }, { status: 409 })

  const now = new Date().toISOString()
  const line = `[${new Date().toLocaleDateString('en-GB')}] Reopened by the tenant — ${REOPEN_REASONS[reason]}${note ? `: ${note}` : ''}`
  const { error } = await s.from('maintenance_tickets').update({
    status: t.contractor_id ? 'assigned' : 'reported', completed_at: null, booked_date: null, booked_slot: null,
    reopened_at: now, reopen_count: Number(t.reopen_count || 0) + 1, reopen_reason: reason, reopen_note: note || null,
    notes: [t.notes, line].filter(Boolean).join('\n'),
  }).eq('id', t.id)
  if (error) return NextResponse.json({ error: /reopen/.test(error.message) ? 'Run migration 236 in Supabase first' : `Couldn’t reopen it: ${error.message}` }, { status: 500 })

  const house = String(t.properties?.name ?? 'the property').split('\n')[0]
  const what = t.title || t.category || 'the repair'
  const summary = `${what} at ${house}${t.rooms?.name ? ` (${t.rooms.name})` : ''} — ${REOPEN_REASONS[reason].toLowerCase()}${note ? `: “${note}”` : ''}`
  const told: string[] = []
  // straight back to the same contractor
  if (t.contractor_id) {
    const { data: c } = await s.from('people').select('*').eq('id', t.contractor_id).maybeSingle()
    if (c) {
      const out = await tellContractor(c, c.id, {
        text: `CAPITAL ROOMS: a job you finished has been reopened by the tenant — ${summary}. Please book a time to go back: ${PORTAL_URL}/contractor/job/${t.id}`,
        title: '↩︎ Job reopened by the tenant', body: summary.slice(0, 160),
        url: `/contractor/job/${t.id}`, link: `${PORTAL_URL}/contractor/job/${t.id}`, tag: `job-${t.id}`,
      })
      told.push(out.via.length ? 'contractor' : `contractor not reached (${out.error})`)
    }
  }
  const { data: office } = await s.from('people').select('id').in('role', ['administrator', 'admin', 'lettings'])
  if (office?.length) {
    await insertNotifications(s, office.map((o: any) => o.id), { title: '↩︎ Repair reopened by a tenant', body: summary, type: 'maintenance', link: '/admin/maintenance' }, { propertyId: t.property_id })
    told.push('office')
  }
  return NextResponse.json({ ok: true, told, backToContractor: !!t.contractor_id })
}

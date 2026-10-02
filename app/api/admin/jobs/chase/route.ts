/**
 * /api/admin/jobs/chase — ask contractors for an update on jobs that have stalled.
 *   GET                                  → { jobs } assigned jobs that need one: never booked (assigned 2+ days ago),
 *                                          or the booked day has passed with no job sheet
 *   POST { ticketIds, note?, email? }     → sends each contractor one message per job: in the app, as a push, and
 *                                          (when email is true) by email — push alone reaches no one who hasn't
 *                                          turned notifications on. Office staff press send; nothing goes automatically.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { TIME_SLOTS } from '@/lib/booking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const slotLabel = (slot: string | null) => TIME_SLOTS.find(s => s.value === slot)?.label ?? slot ?? ''

export interface ChaseJob {
  id: string; title: string; where: string; contractorId: string; contractor: string; contractorEmail: string | null
  bookedDate: string | null; bookedSlot: string | null; reason: 'not_booked' | 'overdue'; message: string
}

async function stalledJobs(s: ReturnType<typeof createServiceClient>, ids?: string[]): Promise<ChaseJob[]> {
  const today = todayIso()
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()
  let q = s.from('maintenance_tickets')
    .select('id, title, booked_date, booked_slot, approved_at, created_at, contractor_id, rooms(name), properties(name, address)')
    .eq('status', 'assigned').not('contractor_id', 'is', null).is('completed_at', null)
  if (ids?.length) q = q.in('id', ids)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  // maintenance_tickets.contractor_id has no foreign key to people, so the contractor is looked up separately
  const cIds = [...new Set(((data ?? []) as any[]).map(t => t.contractor_id))]
  const { data: cs } = cIds.length
    ? await s.from('people').select('id, first_name, last_name, full_name, company, email').in('id', cIds)
    : { data: [] as any[] }
  const byId = new Map(((cs ?? []) as any[]).map(c => [c.id, c]))
  const out: ChaseJob[] = []
  for (const t of (data ?? []) as any[]) {
    const overdue = !!t.booked_date && t.booked_date < today
    const notBooked = !t.booked_date && (t.approved_at ?? t.created_at) < twoDaysAgo
    if (!ids?.length && !overdue && !notBooked) continue
    const c = byId.get(t.contractor_id) ?? {}
    const first = c.first_name || String(c.full_name || '').split(' ')[0] || 'there'
    const where = [t.rooms?.name, String(t.properties?.name || t.properties?.address || '').split('\n')[0]].filter(Boolean).join(', ')
    const job = `“${String(t.title || 'Maintenance job').trim()}” at ${where}`
    const message = overdue
      ? `Hi ${first}, how did the visit on ${day(t.booked_date)}${t.booked_slot ? ` (${slotLabel(t.booked_slot)})` : ''} go for ${job}? Please fill in the job sheet in the app, or rebook a new date if it still needs finishing — the tenants are told automatically.`
      : t.booked_date
        ? `Hi ${first}, just checking in on ${job}, booked for ${day(t.booked_date)}. Please update the job in the app if anything has changed.`
        : `Hi ${first}, could you book a date for ${job}? Pick a slot in the app and the tenants are told automatically. If you can’t take it on, let us know so we can pass it on.`
    out.push({
      id: t.id, title: t.title || 'Maintenance job', where, contractorId: t.contractor_id,
      contractor: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.full_name || c.company || c.email || 'Contractor',
      contractorEmail: c.email ?? null, bookedDate: t.booked_date, bookedSlot: t.booked_slot,
      reason: overdue ? 'overdue' : 'not_booked', message,
    })
  }
  return out.sort((a, b) => (a.reason === b.reason ? a.contractor.localeCompare(b.contractor) : a.reason === 'overdue' ? -1 : 1))
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ jobs: await stalledJobs(createServiceClient()) })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const ids = (Array.isArray(b.ticketIds) ? b.ticketIds : []).filter((x: unknown) => typeof x === 'string').slice(0, 50)
  if (!ids.length) return NextResponse.json({ error: 'Choose at least one job' }, { status: 400 })
  const note = String(b.note ?? '').trim().slice(0, 600)
  const s = createServiceClient()
  const jobs = await stalledJobs(s, ids)
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || ''
  const results: { id: string; contractor: string; inApp: boolean; push: number; email?: string; error?: string }[] = []

  for (const j of jobs) {
    const text = note ? `${j.message}\n\n${note}` : j.message
    const link = `/contractor/job/${j.id}`
    const r: (typeof results)[number] = { id: j.id, contractor: j.contractor, inApp: false, push: 0 }
    const { error } = await insertNotifications(s, [j.contractorId], { title: 'Update needed', body: text, type: 'maintenance', link })
    r.inApp = !error
    r.push = await sendServerPush({ personId: j.contractorId, title: 'Update needed', body: text, url: link, tag: `chase-${j.id}` })
    if (b.email && j.contractorEmail) {
      const sent = await sendEmail(j.contractorEmail, `Update needed: ${j.title}`, messageHtml(`${text}\n\nOpen the job: ${origin}${link}`), { req })
      if (sent.ok) r.email = j.contractorEmail; else r.error = `Email not sent: ${sent.error ?? 'unknown error'}`
    }
    // keep a record on the job itself
    const stamp = `[${new Date().toLocaleDateString('en-GB')}] Update requested from ${j.contractor} by ${caller.email}${r.email ? ' (app + email)' : ' (app)'}`
    const { data: cur } = await s.from('maintenance_tickets').select('admin_note').eq('id', j.id).maybeSingle() as { data: any }
    await s.from('maintenance_tickets').update({ admin_note: [cur?.admin_note, stamp].filter(Boolean).join('\n') }).eq('id', j.id)
    results.push(r)
  }
  return NextResponse.json({ sent: results.length, results })
}

// /api/planned-works — Planned Works (24 Nov 2026). Multi-day projects on a maintenance job. See lib/plannedWorks.ts.
//   GET  ?ticketId=…            → the project: planned fields, day n of N, updates (newest first), facilities.
//                                 Allowed: staff, the job's assigned contractor, a tenant living at the property.
//   GET  ?active=1              → staff: every live planned project across properties.
//   POST { action:'raise', ticketId, durationDays, startOn }        staff: make a job planned
//   POST { action:'daily', ticketId, key?|message?, returnOn?, proposedCompleteOn?, facilities? }   contractor: daily update
//   POST { action:'request_complete', ticketId, note? }             contractor: asks the office to check and close
//   POST { action:'facility', ticketId, name, status }              staff any status; contractor not 'restored'
//   POST { action:'confirm_complete', ticketId }                    staff: closes the project after inspection
//   POST { action:'confirm_expected', ticketId, date }              staff: sets the expected completion date
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { activeTenantIds, insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { DAILY_MESSAGES, FACILITY_LABEL, ALL_FACILITY_STATUS, CONTRACTOR_FACILITY_STATUS, addWorkingDays, projectDay, canAcceptDailyUpdate } from '@/lib/plannedWorks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const ISO = /^\d{4}-\d{2}-\d{2}$/
const todayLondon = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

async function loadTicket(s: any, id: string) {
  const { data } = await s.from('maintenance_tickets').select('id, title, property_id, reporter_id, contractor_id, status, job_type, planned_duration_days, planned_start_on, expected_complete_on, project_status').eq('id', id).maybeSingle()
  return data as any | null
}

async function notifyTenants(s: any, propertyId: string, title: string, body: string, link: string) {
  const ids: string[] = await activeTenantIds(s, propertyId).catch(() => [] as string[])
  if (!ids.length) return
  await insertNotifications(s, ids, { title, body, type: 'maintenance', link } as any).catch(() => null)
  for (const id of ids) await sendServerPush({ personId: id, title, body: body.slice(0, 160), url: link, tag: `planned-${link}` } as any).catch(() => 0)
}

export async function GET(req: NextRequest) {
  const s = createServiceClient() as any
  const url = req.nextUrl
  const staff = await requireStaff(req)
  if (url.searchParams.get('active')) {
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: jobs } = await s.from('maintenance_tickets').select('id, title, property_id, contractor_id, status, job_type, planned_duration_days, planned_start_on, expected_complete_on, project_status, properties(address)').eq('job_type', 'planned').neq('project_status', 'completed').order('planned_start_on', { ascending: true })
    const today = todayLondon()
    const items = await Promise.all(((jobs ?? []) as any[]).map(async j => {
      const { data: facs } = await s.from('project_facilities').select('name, facility_status').eq('ticket_id', j.id)
      const { data: last } = await s.from('project_updates').select('update_date, message, kind').eq('ticket_id', j.id).order('created_at', { ascending: false }).limit(1)
      const day = j.planned_start_on ? projectDay(j.planned_start_on, today, j.planned_duration_days ?? 1) : 0
      return { id: j.id, title: j.title, address: j.properties?.address ?? '', projectStatus: j.project_status, day, duration: j.planned_duration_days, expectedCompleteOn: j.expected_complete_on, facilities: facs ?? [], latest: last?.[0] ?? null, stale: !!(last?.[0] && last[0].update_date < today && j.project_status !== 'completed') }
    }))
    // open standard jobs that could be made planned (for the office's raise form)
    const { data: cand } = await s.from('maintenance_tickets').select('id, title, status, properties(address)').eq('job_type', 'standard').not('status', 'in', '("completed","cancelled")').order('created_at', { ascending: false }).limit(200)
    const candidates = ((cand ?? []) as any[]).map(c => ({ id: c.id, title: c.title, address: c.properties?.address ?? '', status: c.status }))
    return NextResponse.json({ items, candidates })
  }

  const ticketId = url.searchParams.get('ticketId') ?? ''
  const t = ticketId ? await loadTicket(s, ticketId) : null
  if (!t) return NextResponse.json({ error: 'That job wasn’t found.' }, { status: 404 })
  if (!staff) {
    const c = await requireSignedIn(req)
    if (!c || c.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    const living: string[] = c.role === 'tenant' ? await activeTenantIds(s, t.property_id).catch(() => [] as string[]) : []
    const ok = (c.role === 'contractor' && t.contractor_id === c.personId) || (c.role === 'tenant' && living.includes(c.personId))
    if (!ok) return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }
  if (t.job_type !== 'planned') return NextResponse.json({ planned: false })
  const today = todayLondon()
  const { data: updates } = await s.from('project_updates').select('id, update_date, kind, message, return_on, proposed_complete_on, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false })
  const { data: facs } = await s.from('project_facilities').select('name, facility_status, changed_at').eq('ticket_id', t.id).order('name')
  return NextResponse.json({
    planned: true, ticketId: t.id, title: t.title, projectStatus: t.project_status,
    duration: t.planned_duration_days, startOn: t.planned_start_on, expectedCompleteOn: t.expected_complete_on,
    day: t.planned_start_on ? projectDay(t.planned_start_on, today, t.planned_duration_days ?? 1) : 0,
    updates: updates ?? [], facilities: facs ?? [], facilityLabels: FACILITY_LABEL, messages: DAILY_MESSAGES, facilityNames: ['Sink', 'Shower', 'Bath', 'Toilet', 'Kitchen', 'Cooker', 'Heating', 'Hot water'],
    isStaff: !!staff, canUpdate: canAcceptDailyUpdate(t.project_status),
  })
}

export async function POST(req: NextRequest) {
  const s = createServiceClient() as any
  const b = await req.json().catch(() => ({})) as any
  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
  const staff = await requireStaff(req)
  const c = staff ? null : await requireSignedIn(req)
  if (!staff && (!c || c.role !== 'contractor' || c.viewingAsBy)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const who = staff ? (staff.email ?? 'office') : (c as any).email ?? 'contractor'
  const t = await loadTicket(s, String(b.ticketId ?? ''))
  if (!t) return bad('That job wasn’t found.', 404)
  if (!staff && t.contractor_id !== (c as any).personId) return bad('This job isn’t assigned to you.', 403)

  if (b.action === 'raise') {
    if (!staff) return bad('Only the office can make a job planned.', 403)
    const dur = Math.floor(Number(b.durationDays))
    if (!(dur >= 1 && dur <= 60)) return bad('Enter how many working days it will take (1–60).')
    if (!ISO.test(b.startOn ?? '')) return bad('Enter the start date.')
    const expected = addWorkingDays(b.startOn, dur - 1)
    const { error } = await s.from('maintenance_tickets').update({ job_type: 'planned', planned_duration_days: dur, planned_start_on: b.startOn, expected_complete_on: expected, project_status: 'planned', status: 'in_progress' }).eq('id', t.id)
    if (error) return bad(error.message, 500)
    return NextResponse.json({ ok: true, expectedCompleteOn: expected })
  }
  if (t.job_type !== 'planned') return bad('This job isn’t a planned project.', 409)
  if (!canAcceptDailyUpdate(t.project_status) && b.action !== 'confirm_expected') return bad('This project is already complete.', 409)
  const today = todayLondon()

  if (b.action === 'daily') {
    if (!staff && !canAcceptDailyUpdate(t.project_status)) return bad('This project is complete.', 409)
    const preset = DAILY_MESSAGES.find(m => m.key === b.key)
    const message = String(preset ? preset.text : b.message ?? '').trim().slice(0, 1000)
    if (!message) return bad('Pick a message or write one.')
    const returnOn = b.returnOn && ISO.test(b.returnOn) ? b.returnOn : null
    const proposed = b.proposedCompleteOn && ISO.test(b.proposedCompleteOn) ? b.proposedCompleteOn : null
    // Daily updates never change project status to completed. A delay is raised for staff to confirm.
    const { error } = await s.from('project_updates').insert({ ticket_id: t.id, update_date: today, kind: b.delay ? 'delay' : 'daily', message, return_on: returnOn, proposed_complete_on: proposed, created_by: who })
    if (error) return bad(error.message, 500)
    if (b.delay) await s.from('maintenance_tickets').update({ project_status: 'delayed' }).eq('id', t.id)
    else if (t.project_status === 'planned') await s.from('maintenance_tickets').update({ project_status: 'in_progress' }).eq('id', t.id)
    await insertNotifications(s, ((await s.from('people').select('id').eq('role', 'administrator')).data ?? []).map((o: any) => o.id), { title: `Update on “${String(t.title).split(' — ')[0].slice(0, 40)}”`, body: message.slice(0, 160), type: 'maintenance', link: `/admin/planned-works?ticket=${t.id}` } as any).catch(() => null)
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'request_complete') {
    if (staff) return bad('Only the contractor requests completion.', 403)
    await s.from('project_updates').insert({ ticket_id: t.id, update_date: today, kind: 'completion_requested', message: String(b.note ?? 'Work finished — please check and close the project.').slice(0, 500), created_by: who })
    await insertNotifications(s, ((await s.from('people').select('id').eq('role', 'administrator')).data ?? []).map((o: any) => o.id), { title: `Completion requested: “${String(t.title).split(' — ')[0].slice(0, 40)}”`, body: 'The contractor says the work is finished. Check and close the project.', type: 'maintenance', link: `/admin/planned-works?ticket=${t.id}` } as any).catch(() => null)
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'facility') {
    const name = String(b.name ?? '').slice(0, 40)
    const status = String(b.status ?? '')
    if (!name) return bad('Name the facility.')
    if (!(ALL_FACILITY_STATUS as readonly string[]).includes(status)) return bad('Choose a status.')
    if (!staff && !(CONTRACTOR_FACILITY_STATUS as readonly string[]).includes(status)) return bad('Only the office can mark a facility restored.', 403)
    const { data: prev } = await s.from('project_facilities').select('facility_status').eq('ticket_id', t.id).eq('name', name).maybeSingle()
    const { error } = await s.from('project_facilities').upsert({ ticket_id: t.id, name, facility_status: status, changed_at: new Date().toISOString(), changed_by: who }, { onConflict: 'ticket_id,name' })
    if (error) return bad(error.message, 500)
    if (prev?.facility_status !== status) {
      await s.from('project_updates').insert({ ticket_id: t.id, update_date: today, kind: 'facility', message: `${name}: ${FACILITY_LABEL[status]}`, created_by: who })
      await notifyTenants(s, t.property_id, `${name} ${status === 'restored' ? 'is available again' : 'is affected'}`, `${FACILITY_LABEL[status]} — “${String(t.title).split(' — ')[0].slice(0, 40)}”.`, `/tenant/visit/${t.id}`)
    }
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'confirm_complete') {
    if (!staff) return bad('Only the office closes a project.', 403)
    const now = new Date().toISOString()
    const { error } = await s.from('maintenance_tickets').update({ project_status: 'completed', status: 'completed', completed_at: now, completed_by: who }).eq('id', t.id)
    if (error) return bad(error.message, 500)
    await s.from('project_updates').insert({ ticket_id: t.id, update_date: today, kind: 'office', message: 'Project closed after inspection.', created_by: who })
    await notifyTenants(s, t.property_id, 'Works finished', `“${String(t.title).split(' — ')[0].slice(0, 40)}” is complete.`, `/tenant/visit/${t.id}`)
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'confirm_expected') {
    if (!staff) return bad('Only the office sets the expected date.', 403)
    if (!ISO.test(b.date ?? '')) return bad('Enter the date.')
    await s.from('maintenance_tickets').update({ expected_complete_on: b.date }).eq('id', t.id)
    await s.from('project_updates').insert({ ticket_id: t.id, update_date: today, kind: 'office', message: `Expected completion now ${b.date}.`, created_by: who })
    await notifyTenants(s, t.property_id, 'New completion date', `“${String(t.title).split(' — ')[0].slice(0, 40)}” is now expected to finish on ${b.date}.`, `/tenant/visit/${t.id}`)
    return NextResponse.json({ ok: true })
  }
  return bad('Unknown action')
}

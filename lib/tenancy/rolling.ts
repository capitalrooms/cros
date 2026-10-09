// Tenancies are rolling by default (Harry, 9 Oct 2026: "tenants stay as long as they want unless we give a notice
// date" … "unless I have ticked they are leaving they never leave"). Leaving = notice recorded (Mark on notice, or the
// tenant's Give notice). An end date only means something once notice is recorded; one without notice is the end of a fixed term
// entered with the tenancy, and it would stop rent being raised and make the tenant look gone.
//   endDatesToSort — tenancies with an end date and no notice that may really be carrying on (Health Check list)
//   makeRolling    — clear those end dates (Health Check button, and nightly — past end dates included)
import type { SupabaseClient } from '@supabase/supabase-js'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'

// Leaves out anyone whose room someone else has moved into since (they've gone), lets that fell through, demo and
// let-only houses, and rooms already marked on notice or empty — so this can never bring back a tenancy that ended.
export async function endDatesToSort(s: SupabaseClient | any) {
  const { data } = await s.from('tenancies')
    .select('id, room_id, person_id, start_date, end_date, let_cancelled_at, rooms(name, status), properties(name, is_demo, letting_type), people!person_id(first_name, last_name)')
    .not('end_date', 'is', null).is('notice_received_date', null).is('let_cancelled_at', null).order('end_date')
  const rows = ((data ?? []) as any[]).filter(t => !t.properties?.is_demo && t.properties?.letting_type !== 'let_only' && t.rooms?.status !== 'on_notice' && t.rooms?.status !== 'available')
  if (!rows.length) return []
  const { data: inRooms } = await s.from('tenancies').select('id, room_id, start_date, let_cancelled_at').in('room_id', [...new Set(rows.map(t => t.room_id).filter(Boolean))])
  const replaced = (t: any) => ((inRooms ?? []) as any[]).some(o => o.id !== t.id && !o.let_cancelled_at && o.room_id === t.room_id && o.start_date && o.start_date > t.start_date)
  // someone new lined up for the room (an applicant still in progress) means this tenant is leaving, notice or not:
  // tagged newTenant so they're never made rolling — the office records their notice instead (Health Check)
  const { data: apps } = await s.from('applicants').select('room_id, first_name, last_name, full_name, pipeline_stage')
    .in('room_id', [...new Set(rows.map(t => t.room_id).filter(Boolean))]).is('archived_at', null).neq('pipeline_stage', 'rejected')
  const nextFor = (t: any) => {
    const a: any = ((apps ?? []) as any[]).find(x => x.room_id === t.room_id)
    return a ? ([a.first_name, a.last_name].filter(Boolean).join(' ') || a.full_name || 'an applicant') : null
  }
  return rows.filter(t => !replaced(t)).map(t => ({ ...t, newTenant: nextFor(t) as string | null }))
}

/** Clear no-notice end dates, past or still to come. futureOnly limits it to end dates still to come (nothing uses
 *  that now). A room already marked empty or on notice is skipped (endDatesToSort), so a person decides those in the
 *  Health Check. Each change is written to the tenancy's activity. */
export async function makeRolling(s: SupabaseClient | any, opts: { futureOnly?: boolean; by: string }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const rows = (await endDatesToSort(s)).filter((t: any) => !t.newTenant && (!opts.futureOnly || t.end_date > today))
  if (!rows.length) return 0
  const { error } = await s.from('tenancies').update({ end_date: null, is_periodic: true }).in('id', rows.map((t: any) => t.id))
  if (error) throw new Error(error.message)
  for (const t of rows) await logTenancyEvent(s, t.id, 'terms', `Now rolling: the end date ${t.end_date} had no notice behind it, so it was cleared (tenancies roll until notice is given)`, opts.by)
  return rows.length
}

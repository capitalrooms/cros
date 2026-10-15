// "Popping by" — an unbooked visit to a property (15 Oct 2026, Harry: "the contractor needs to be able to just do a
// quick notify to visit a property in order to get the key safe code … warning they cannot visit an individual's
// room" · "same for lettings as they may need to simply go round … to take photos of a room").
//
//   · Contractors: shared areas only — never a room. They pick a property they've worked at, the day, the time and
//     why; every tenant in the house is told; then (and only then) they're shown the key safe code.
//   · Lettings / office: may also name a room (e.g. photos). An occupied room's tenant gets their own notice, and it
//     needs 24 hours' notice unless the tenant has agreed. Everyone else in the house gets the house notice.
// Every visit is logged (property_visits, migration 224; and the audit log) — who, where, when, why, who was told.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Caller } from '@/lib/portalAuth'
import { isStaff } from '@/lib/portalAuth'
import { activeTenantIds, insertNotifications, dispatchChannels } from '@/lib/serverNotify'
import { getElectedCommsLive } from '@/lib/comms'
import { readKeySafe } from '@/lib/access/keySafe'
import { logAudit } from '@/lib/auditLog'
import { oneLine, shortAddress } from '@/lib/lettings/letWording'

export const VISIT_DAYS_AHEAD = 14
const ROOM_NOTICE_HOURS = 24
const CONTRACTOR_LOOKBACK_DAYS = 365

export interface VisitInput { propertyId: string; roomId?: string | null; date: string; from: string; to: string; reason: string; tenantAgreed?: boolean }
export interface VisitOption { id: string; name: string; rooms: { id: string; name: string; occupied: boolean }[] }

const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(String(e.message ?? '')))
const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const niceDay = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
/** A London wall-clock time as a UTC timestamp (the server runs in UTC; London is UTC+0 or +1). */
export function londonToUtc(dateIso: string, hhmm: string): number {
  const [y, m, d] = dateIso.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const wall = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'Europe/London' })).getTime()
  const utcWall = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  return guess - (wall - utcWall)
}

/** The properties this person may pop by — contractors: where they've had a job in the last year; office: all. */
export async function visitOptions(s: SupabaseClient, c: Caller): Promise<VisitOption[]> {
  let ids: string[] | null = null
  if (!isStaff(c)) {
    if (c.role !== 'contractor') return []
    const since = new Date(Date.now() - CONTRACTOR_LOOKBACK_DAYS * 86_400_000).toISOString()
    const { data: t } = await s.from('maintenance_tickets').select('property_id').eq('contractor_id', c.personId).gte('created_at', since).not('property_id', 'is', null)
    ids = [...new Set(((t ?? []) as any[]).map(x => x.property_id))]
    if (!ids.length) return []
  }
  let q = s.from('properties').select('id, name, address, is_demo').order('name')
  if (ids) q = q.in('id', ids)
  const { data: props } = await q
  const list = ((props ?? []) as any[]).filter(p => !p.is_demo)
  // rooms (office only — contractors never choose a room)
  const roomsBy = new Map<string, VisitOption['rooms']>()
  if (isStaff(c) && list.length) {
    const today = londonToday()
    const { data: rooms } = await s.from('rooms').select('id, name, property_id').in('property_id', list.map(p => p.id)).order('name')
    const { data: ten } = await s.from('tenancies').select('room_id').lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
    const occupied = new Set(((ten ?? []) as any[]).map(t => t.room_id))
    for (const r of (rooms ?? []) as any[]) {
      const arr = roomsBy.get(r.property_id) ?? []
      arr.push({ id: r.id, name: r.name || 'Room', occupied: occupied.has(r.id) })
      roomsBy.set(r.property_id, arr)
    }
  }
  return list.map(p => ({ id: p.id, name: shortAddress(p.name || p.address) || oneLine(p.address), rooms: roomsBy.get(p.id) ?? [] }))
}

export async function createVisit(s: SupabaseClient, c: Caller, v: VisitInput, req: Request): Promise<{ status: number; body: Record<string, unknown> }> {
  const bad = (error: string, status = 400) => ({ status, body: { error } })
  const staff = isStaff(c)
  if (!staff && c.role !== 'contractor') return bad('Only contractors and the office can arrange a visit.', 403)

  const reason = String(v.reason ?? '').trim().replace(/\s+/g, ' ')
  if (reason.length < 3) return bad('Say briefly why you’re visiting — the tenants will see it.')
  if (reason.length > 200) return bad('Keep the reason under 200 characters.')
  const today = londonToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || v.date < today || v.date > addDays(today, VISIT_DAYS_AHEAD)) return bad(`Pick a day from today up to ${VISIT_DAYS_AHEAD} days ahead.`)
  if (!HHMM.test(v.from) || !HHMM.test(v.to) || v.to <= v.from) return bad('Give a time window, e.g. 10:00 to 11:00.')

  // may they go there?
  const allowed = await visitOptions(s, c)
  const prop = allowed.find(p => p.id === v.propertyId)
  if (!prop) return bad(staff ? 'Property not found.' : 'You can only pop by properties you’ve done jobs at. Ask the office if you need to visit somewhere else.', 403)

  let room: { id: string; name: string; occupied: boolean } | null = null
  if (v.roomId) {
    if (!staff) return bad('Contractors can’t visit a tenant’s room on a pop-by — rooms need a booked job.', 403)
    room = prop.rooms.find(r => r.id === v.roomId) ?? null
    if (!room) return bad('That room isn’t at this property.')
    if (room.occupied && !v.tenantAgreed) {
      if (londonToUtc(v.date, v.from) - Date.now() < ROOM_NOTICE_HOURS * 3_600_000) {
        return bad(`The tenant must have ${ROOM_NOTICE_HOURS} hours’ notice before anyone goes into their room. Pick a later time, or tick that the tenant has agreed.`)
      }
    }
  }

  // anything sent to current tenants follows the switch for messages someone chooses to send (lib/comms)
  if (!(await getElectedCommsLive())) return bad('Messages to tenants are switched off in Settings, so the tenants can’t be told — ask the office.', 409)

  // a few visits a day at most, so it can't become a way round the rules
  const { data: me } = await s.from('people').select('first_name, last_name, full_name, company').eq('id', c.personId).maybeSingle()
  const first = String((me as any)?.first_name || String((me as any)?.full_name || '').split(' ')[0] || '').trim()
  const who = staff ? `${first || 'Someone'} from our lettings team` : `${first || 'Our contractor'}${first ? ', our contractor,' : ''}`
  const { data: recent, error: recentErr } = await s.from('property_visits').select('id').eq('visitor_id', c.personId).eq('property_id', prop.id).eq('visit_date', v.date).is('cancelled_at', null)
  if (!recentErr && (recent ?? []).length >= 3) return bad('You’ve already told the tenants about 3 visits to this property that day.')

  const when = `${niceDay(v.date)}, between ${v.from} and ${v.to}`
  const roomTenants = room ? await activeTenantIds(s, prop.id, room.id) : []
  const houseTenants = (await activeTenantIds(s, prop.id)).filter(id => !roomTenants.includes(id))

  const houseNote = {
    title: `Visit to ${prop.name} — ${niceDay(v.date)}`,
    body: `${who} will pop by ${prop.name} on ${when} — ${reason}.\n\n${room ? `They’ll be visiting ${room.name}${room.occupied ? '' : ' (currently empty)'} and the shared areas` : 'They’ll only be in the shared areas and won’t go into anyone’s room'}. If you have any questions, just reply or get in touch with us.`,
    type: 'visit', link: '/tenant',
  }
  const roomNote = room ? {
    title: `Visit to your room — ${niceDay(v.date)}`,
    body: `${who} will visit your room, ${room.name}, on ${when} — ${reason}.${v.tenantAgreed ? ' Thank you for agreeing to this.' : ''}\n\nIf this time doesn’t work for you, please get in touch with us straight away.`,
    type: 'visit', link: '/tenant',
  } : null

  await insertNotifications(s, houseTenants, houseNote)
  const house = houseTenants.length ? await dispatchChannels(s, houseTenants, houseNote, 'push_email', req) : { emailCount: 0 }
  let roomSent = { emailCount: 0 }
  if (roomNote && roomTenants.length) { await insertNotifications(s, roomTenants, roomNote); roomSent = await dispatchChannels(s, roomTenants, roomNote, 'push_email', req) }
  const told = houseTenants.length + roomTenants.length

  const keySafe = await readKeySafe(s, prop.id)
  const row = {
    property_id: prop.id, room_id: room?.id ?? null, visitor_id: c.personId, visitor_role: c.role,
    visit_date: v.date, time_from: v.from, time_to: v.to, reason, tenant_agreed: !!v.tenantAgreed,
    notified: { house: houseTenants.length, room: roomTenants.length, emails: house.emailCount + roomSent.emailCount },
    key_safe_shown: !!keySafe,
  }
  const { data: logged, error: logErr } = await s.from('property_visits').insert(row).select('id').maybeSingle()
  if (logErr && !missingTable(logErr)) console.error('[visits] not logged:', logErr.message)
  await logAudit({ userId: c.personId, action: 'create', table: 'property_visits', recordId: (logged as any)?.id ?? prop.id, details: `Pop-by visit: ${prop.name}${room ? ` (${room.name})` : ''} ${v.date} ${v.from}-${v.to} — ${reason}. ${told} tenant(s) told.${keySafe ? ' Key safe code shown.' : ''}` }).catch(() => false)

  return {
    status: 200,
    body: {
      ok: true, told, property: prop.name, room: room?.name ?? null, when,
      keySafe, noTenants: told === 0,
      reminder: staff && room ? `Only ${room.name} and the shared areas — no other rooms.` : 'Shared areas only. Never go into a tenant’s room on a pop-by visit.',
    },
  }
}

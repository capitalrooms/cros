// Arriving at a property (14 Nov 2026, Harry: "they must also click I have arrived to get code … make sure they could
// arrive, book it in and then do it although say you should have given more notice to tenants … then reveal key safe
// — same for contractors"). The key safe now shows only after "I've arrived" on a visit booked for today, and how much
// notice the tenants had decides what happens:
//
//   · Shared areas (a clean, or a job not in anyone's room): under 4 hours' notice → a warning they must tick
//     ("tenants don't tend to mind for something important in shared areas, but give more notice next time"), then
//     the code.
//   · A tenant's room: under 24 hours' notice → not without the tenant's yes — UNLESS the tenant has already said they
//     don't need notice (tenant_access_any_time, e.g. "please just fix it asap" when reporting it, or a yes to a
//     short-notice request). A contractor can ask the tenant in one tap (askTenant): the tenant gets the request in
//     their app and inbox, and the moment they say yes the contractor can go in.
//
// "Notice" = the time since the booking was made (booked_at, migration 289, stamped by a trigger whichever screen or
// link made it). Bookings made before then have no booked_at and count as properly notified.
// Codes come from lib/access/keySafe and only ever open the HOUSE, never a room.
import type { SupabaseClient } from '@supabase/supabase-js'
import { readKeySafe } from '@/lib/access/keySafe'
import { activeTenantIds, insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { inTenantRoom } from '@/lib/repairs/where'

export const SHARED_NOTICE_HOURS = 4
export const ROOM_NOTICE_HOURS = 24
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export type ArrivalCheck =
  | { state: 'ok'; keySafe: string | null; already: boolean; where: string; room: RoomInfo | null }
  | { state: 'warn'; message: string; hours: number; where: string; room: RoomInfo | null }
  | { state: 'blocked'; message: string; hours: number; canAskTenant: boolean; asked: boolean; where: string; room: RoomInfo | null }
  | { state: 'not_today' | 'not_booked' | 'not_yours' | 'not_found'; message: string }
export type RoomInfo = { name: string; location: string | null; occupied: boolean }

const hoursSince = (iso: string | null | undefined) => iso ? (Date.now() - new Date(iso).getTime()) / 3600_000 : Infinity
const fmtHours = (h: number) => h < 1 ? `${Math.max(1, Math.round(h * 60))} minutes` : h < 2 ? 'about an hour' : `about ${Math.round(h)} hours`

async function room(s: SupabaseClient, propertyId: string, roomId: string | null): Promise<RoomInfo | null> {
  if (!roomId) return null
  const [{ data: r }, ids] = await Promise.all([
    s.from('rooms').select('name, location_in_house').eq('id', roomId).maybeSingle(),
    activeTenantIds(s, propertyId, roomId).catch(() => [] as string[]),
  ])
  return { name: (r as any)?.name ?? 'the room', location: (r as any)?.location_in_house ?? null, occupied: ids.length > 0 }
}
const roomLine = (r: RoomInfo) => `${r.name}${r.location ? ` (${r.location})` : ''}`

/** What happens if this person taps "I've arrived" now. Read-only. */
export async function checkArrival(s: SupabaseClient, o: { kind: 'job' | 'clean'; id: string; personId: string; staff?: boolean }): Promise<ArrivalCheck & { propertyId?: string }> {
  if (o.kind === 'job') {
    const { data: t } = await s.from('maintenance_tickets').select('*').eq('id', o.id).maybeSingle() as { data: any }
    if (!t) return { state: 'not_found', message: 'That job wasn’t found.' }
    if (!o.staff && t.contractor_id !== o.personId) return { state: 'not_yours', message: 'This job isn’t yours.' }
    if (!t.booked_date || ['completed', 'cancelled'].includes(String(t.status))) return { state: 'not_booked', message: 'Book the visit first — the tenants are told, then you can tap “I’ve arrived”.' }
    if (String(t.booked_date).slice(0, 10) !== today()) return { state: 'not_today', message: `This visit is booked for ${new Date(String(t.booked_date).slice(0, 10) + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}. Move it to today first, so the tenants know.` }
    const { data: p } = await s.from('properties').select('name').eq('id', t.property_id).maybeSingle() as { data: any }
    // a job is in someone's room only when its location says so — a kitchen job reported by the tenant of Room 1 still
    // carries Room 1 as the reporter's room (lib/repairs/where)
    const r = inTenantRoom({ location: t.location }) ? await room(s, t.property_id, t.room_id) : null
    const where = r ? `${roomLine(r)}, ${p?.name ?? 'the property'}` : `the shared areas at ${p?.name ?? 'the property'}${t.location && !inTenantRoom({ location: t.location }) ? ` (${t.location})` : ''}`
    const base = { where, room: r, propertyId: t.property_id as string }
    if (t.arrived_at && String(t.arrived_at).slice(0, 10) === today()) return { state: 'ok', keySafe: await readKeySafe(s, t.property_id), already: true, ...base }
    const h = hoursSince(t.booked_at)
    if (r?.occupied) {
      const agreed = !!t.tenant_access_any_time || !!t.short_notice_tenant_approved_at
      if (!agreed && h < ROOM_NOTICE_HOURS)
        return { state: 'blocked', hours: h, canAskTenant: !t.short_notice_pending, asked: !!t.short_notice_pending, ...base,
          message: `This job is in ${roomLine(r)}, where someone lives. The tenant was only told ${fmtHours(h)} ago — going into a room needs 24 hours’ notice unless they say yes. ${t.short_notice_pending ? 'We’ve asked them — you can go in the moment they agree.' : 'Ask them now: they get it on their phone and can say yes in one tap.'}` }
      return { state: 'ok', keySafe: null, already: false, ...base }   // the code is given once they confirm (confirmArrival)
    }
    if (h < SHARED_NOTICE_HOURS)
      return { state: 'warn', hours: h, ...base, message: `The tenants were only told ${fmtHours(h)} ago. For something important in the shared areas that’s usually fine — but next time, book it at least ${SHARED_NOTICE_HOURS} hours ahead so they have fair warning.` }
    return { state: 'ok', keySafe: null, already: false, ...base }
  }

  const { data: c } = await s.from('cleans').select('*').eq('id', o.id).maybeSingle() as { data: any }
  if (!c) return { state: 'not_found', message: 'That clean wasn’t found.' }
  if (!o.staff && c.cleaner_id !== o.personId) return { state: 'not_yours', message: 'This clean isn’t yours.' }
  if (['cancelled', 'completed'].includes(String(c.status))) return { state: 'not_booked', message: 'This clean is closed.' }
  if (String(c.clean_date).slice(0, 10) !== today()) return { state: 'not_today', message: 'This clean is booked for another day — move it to today first, so the tenants know.' }
  const { data: p } = await s.from('properties').select('name').eq('id', c.property_id).maybeSingle() as { data: any }
  const r = await room(s, c.property_id, c.room_id)
  const where = r ? `${roomLine(r)}, ${p?.name ?? 'the property'}` : `${p?.name ?? 'the property'}`
  const base = { where, room: r, propertyId: c.property_id as string }
  if (c.arrived_at && String(c.arrived_at).slice(0, 10) === today()) return { state: 'ok', keySafe: await readKeySafe(s, c.property_id), already: true, ...base }
  const h = hoursSince(c.booked_at)
  if (r?.occupied && h < ROOM_NOTICE_HOURS)
    return { state: 'blocked', hours: h, canAskTenant: false, asked: false, ...base, message: `This clean includes ${roomLine(r)}, where someone lives, and they were only told ${fmtHours(h)} ago. A room needs 24 hours’ notice — clean the shared areas today and ask the office to rebook the room.` }
  if (h < SHARED_NOTICE_HOURS)
    return { state: 'warn', hours: h, ...base, message: `The tenants were only told ${fmtHours(h)} ago. That’s fine this time — but book your cleans at least ${SHARED_NOTICE_HOURS} hours ahead so the house knows you’re coming.` }
  return { state: 'ok', keySafe: null, already: false, ...base }
}

/** "I've arrived": checks again, records it (and any warning they ticked), and hands over the key safe code. */
export async function confirmArrival(s: SupabaseClient, o: { kind: 'job' | 'clean'; id: string; personId: string; staff?: boolean; ack?: boolean }) {
  const c = await checkArrival(s, o)
  if (c.state === 'warn' && !o.ack) return c
  if (c.state !== 'ok' && c.state !== 'warn') return c
  const table = o.kind === 'job' ? 'maintenance_tickets' : 'cleans'
  if (!(c.state === 'ok' && c.already)) {
    const now = new Date().toISOString()
    const ack = c.state === 'warn' ? `Short notice (${Math.round(c.hours * 10) / 10}h) — warning seen ${now}` : null
    const { error } = await s.from(table).update({ arrived_at: now, ...(ack ? { arrival_ack: ack } : {}) }).eq('id', o.id)
    if (error && ack) await s.from(table).update({ arrived_at: now }).eq('id', o.id)   // before migration 289
  }
  return { state: 'ok' as const, keySafe: await readKeySafe(s, (c as any).propertyId), where: c.where, room: c.room, warned: c.state === 'warn' }
}

/** Ask the tenant of the room to let the contractor in now (short notice): their app shows "Your answer needed". */
export async function askTenant(s: SupabaseClient, jobId: string, personId: string, staff = false) {
  const { data: t } = await s.from('maintenance_tickets').select('id, property_id, room_id, contractor_id, title, category, booked_date, booked_slot, short_notice_pending, properties(name)').eq('id', jobId).maybeSingle() as { data: any }
  if (!t || (!staff && t.contractor_id !== personId)) return { ok: false, error: 'This job isn’t yours.' }
  if (!t.room_id) return { ok: false, error: 'This job isn’t in a room.' }
  if (t.short_notice_pending) return { ok: true, already: true }
  await s.from('maintenance_tickets').update({ short_notice: true, short_notice_pending: true, short_notice_asserted_by: personId, short_notice_asserted_at: new Date().toISOString() }).eq('id', jobId)
  const ids = await activeTenantIds(s, t.property_id, t.room_id)
  if (ids.length) await insertNotifications(s, ids, {
    type: 'short_notice_access_request', title: 'Can the contractor come in now?',
    body: `The contractor for “${t.title || String(t.category ?? 'your repair').replace(/-/g, ' ')}” is at ${t.properties?.name ?? 'the property'} and needs to come into your room. It’s less than 24 hours’ notice, so it’s your choice — tap to say yes or no.`,
    link: `/tenant/visit/${jobId}`,
  } as any).catch(() => null)
  // and on their phone — the contractor is waiting at the door (14 Nov 2026)
  for (const id of ids) await sendServerPush({ personId: id, title: 'Can the contractor come in now?', body: `They’re at ${t.properties?.name ?? 'the property'} for “${t.title || 'your repair'}”. Tap to say yes or no.`, url: `/tenant/visit/${jobId}`, tag: `access-${jobId}` } as any).catch(() => 0)
  return { ok: true, told: ids.length }
}

// A repair visit that won't happen (12 Nov 2026, Harry: "how does cancelling work with contractors and cleaners").
// One notice for every way a visit falls through — the whole job cancelled, or just the visit taken off to rebook:
//   · the contractor: a text (lib/sms) plus their app notice
//   · the people who'd been told about the visit: that room's tenant for a room job, the whole house for a shared area
//     (lib/repairs/where) — app, email and a text; at a let-only house, everyone the landlord told us lives there
// Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'
import { activeTenantIds, insertNotifications, dispatchChannels } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { sendSms } from '@/lib/sms'
import { slotLabel } from '@/lib/booking'
import { inTenantRoom } from '@/lib/repairs/where'
import { occupantsOf } from '@/lib/letOnly/occupants'
import { hiName, personFromText } from '@/lib/people'

const full = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export interface VisitTicket { id: string; title: string; contractor_id: string | null; property_id: string | null; room_id: string | null; location?: string | null; booked_date?: string | null; booked_slot?: string | null }

/** "Tuesday 18 November, 10am – 1pm" — or null when no visit was booked */
export const visitWhen = (t: VisitTicket) => t.booked_date ? `${full(String(t.booked_date).slice(0, 10))}${t.booked_slot ? `, ${slotLabel(t.booked_slot)}` : ''}` : null

export async function tellContractorVisitOff(s: SupabaseClient, t: VisitTicket, o: { jobCancelled: boolean; reason?: string }): Promise<boolean> {
  if (!t.contractor_id) return false
  const when = visitWhen(t)
  const title = o.jobCancelled ? 'Job cancelled' : 'Visit cancelled'
  const body = o.jobCancelled
    ? `“${t.title}” has been cancelled — no need to attend${when ? ` on ${when}` : ''}.${o.reason ? ` Reason: ${o.reason}` : ''}`
    : `The visit for “${t.title}”${when ? ` on ${when}` : ''} is off. The job is still yours — we’ll be in touch about a new day.${o.reason ? ` Reason: ${o.reason}` : ''}`
  await insertNotifications(s, [t.contractor_id], { title, body, type: 'maintenance', link: '/contractor' })
  await sendServerPush({ personId: t.contractor_id, title, body, url: '/contractor', tag: `job-${t.id}` })
  const { data: c } = await s.from('people').select('first_name, full_name, phone').eq('id', t.contractor_id).maybeSingle() as { data: any }
  if (c?.phone) await sendSms(c.phone, `Hi ${hiName(c)}, ${body.charAt(0).toLowerCase()}${body.slice(1)} -Capital Rooms`)
  return true
}

/** Everyone who was told about the visit. Returns how many were told. Only when a visit was actually booked. */
export async function tellHouseVisitOff(s: SupabaseClient, t: VisitTicket, o: { jobCancelled: boolean; req?: Request | null }): Promise<number> {
  const when = visitWhen(t)
  if (!when || !t.property_id) return 0
  const title = 'Repair visit cancelled'
  const body = o.jobCancelled ? `The repair visit on ${when} (“${t.title}”) is cancelled, so nobody will be coming.` : `The repair visit on ${when} (“${t.title}”) won’t go ahead. We’ll let you know the new day.`
  const { data: house } = await s.from('properties').select('letting_type').eq('id', t.property_id).maybeSingle() as { data: any }
  if (house?.letting_type === 'let_only') {
    let n = 0
    for (const p of await occupantsOf(s, t.property_id)) {
      if (inTenantRoom({ location: t.location ?? null }) && t.room_id && p.roomId !== t.room_id) continue
      if (p.phone && (await sendSms(p.phone, `Hi ${hiName(personFromText(p.name))}, ${body.charAt(0).toLowerCase()}${body.slice(1)} -Capital Rooms`)).ok) n++
    }
    return n
  }
  const ids = await activeTenantIds(s, t.property_id, inTenantRoom({ location: t.location ?? null }) ? t.room_id : null)
  if (!ids.length) return 0
  await insertNotifications(s, ids, { title, body, type: 'maintenance', link: '/tenant/requests' }, { propertyId: t.property_id, roomId: t.room_id })
  await dispatchChannels(s, ids, { title, body, link: '/tenant/requests' }, 'push_email_sms', o.req ?? null, { elected: true })
  return ids.length
}

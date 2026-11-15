// Job watch — normal repair jobs keep moving when nobody presses anything (15 Nov 2026, Harry: "bullet proof
// automation so it could all work without us … accounting for the fact that along the way sometimes people may skip
// pressing something and how the system handles lack of input"). Emergencies have their own clock (lib/emergencies).
// Runs hourly 8am–8pm (/api/cron/job-watch). Every step is sent ONCE: the contractor's or tenant's in-app notification
// for it is the record (its link carries the step), so re-runs never double up and no database change is needed.
//
//   Given out, never booked     +1 day: contractor asked to book (text/email/app, their job link)
//                               +2 days: asked again; the tenants told we're chasing
//                               +3 days, then every 2: the office ("give it to someone else?")
//   Booked day gone, no arrival next morning: contractor "did you go? log it or rebook"; tenants "did they come?"
//                               +2 days: the office
//   Arrived, never finished     +1 day: contractor "how did it go?"; +3 days: tenants "is it fixed?"; +4: the office
//   Coming back, no date        +2 days: contractor asked to book the return; +4 days: the office
// The tenant's answers (app/api/tenant/visit-ticket) act on them: came / didn't come / fixed / not fixed.
import type { SupabaseClient } from '@supabase/supabase-js'
import { tellContractor } from '@/lib/contractorContact'
import { activeTenantIds, insertNotifications, dispatchChannels } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { inTenantRoom } from '@/lib/repairs/where'
import { getCommsLive } from '@/lib/comms'
import { isTestEmail, hiName } from '@/lib/people'
import { PORTAL_URL } from '@/lib/emailWrapper'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { OFFICE_ALERT_EMAIL, officeButton } from '@/lib/email/office'

const DAY = 86_400_000
// only what happens from the day it went live — the older backlog stays on the office's lists rather than everyone
// getting a burst of messages about old jobs at once
const WATCH_FROM = new Date('2026-11-15T00:00:00Z').getTime()
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const fullDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const short = (t: string) => { const x = String(t || 'the repair').replace(/^\[[^\]]*\]\s*/, '').split(/\s+—\s+/)[0]; return x.length > 50 ? `${x.slice(0, 50)}…` : x }
const house = (j: any) => String(j.properties?.name ?? j.properties?.address ?? 'the property').split('\n')[0].split(',')[0]

/** Has this step been sent to this person for this job? (the notification is the record) */
async function sent(s: SupabaseClient, personId: string, link: string) {
  const { data } = await s.from('notifications').select('id').eq('user_id', personId).eq('link', link).limit(1)
  return !!data?.length
}
async function lastSent(s: SupabaseClient, personId: string, linkPrefix: string) {
  const { data } = await s.from('notifications').select('created_at').eq('user_id', personId).like('link', `${linkPrefix}%`).order('created_at', { ascending: false }).limit(1)
  return (data?.[0] as any)?.created_at ? new Date((data![0] as any).created_at).getTime() : 0
}
/** When the job reached this contractor: their first notice about it, else when it was approved/raised. */
async function givenAt(s: SupabaseClient, j: any) {
  const { data } = await s.from('notifications').select('created_at').eq('user_id', j.contractor_id).like('link', `/contractor/job/${j.id}%`).order('created_at').limit(1)
  const first = (data?.[0] as any)?.created_at
  return new Date(first || j.approved_at || j.created_at).getTime()
}

async function chaseContractor(s: SupabaseClient, j: any, step: string, text: string, title: string) {
  const url = `/contractor/job/${j.id}?w=${step}`
  if (await sent(s, j.contractor_id, url)) return false
  await tellContractor(j.people, j.contractor_id, { text: `🔧 Capital Rooms — ${title.toLowerCase()}\n\n${text.charAt(0).toUpperCase()}${text.slice(1).replace(/:$/, '.')}\n\n${PORTAL_URL}/contractor/job/${j.id}`, title, body: text.slice(0, 140), url, link: `${PORTAL_URL}/contractor/job/${j.id}`, tag: `job-${j.id}` })
  return true
}
async function tellTenants(s: SupabaseClient, j: any, step: string, title: string, body: string) {
  if (!j.property_id || !(await getCommsLive({ propertyId: j.property_id }))) return false   // automatic tenant messages follow the pause switch
  const ids = await activeTenantIds(s, j.property_id, inTenantRoom({ location: j.location }) ? j.room_id : null)
  if (!ids.length) return false
  const link = `/tenant/visit/${j.id}?w=${step}`
  if (await sent(s, ids[0], link)) return false
  await insertNotifications(s, ids, { title, body, type: 'maintenance', link } as any, { propertyId: j.property_id, roomId: j.room_id })
  await dispatchChannels(s, ids, { title, body, link } as any, 'push_email', null).catch(() => null)
  return true
}
async function tellOffice(s: SupabaseClient, j: any, step: string, subject: string, html: string, every = 0) {
  if (isTestEmail(j.people?.email)) return false   // made-up contractors aren't the office's business
  const { data: office } = await s.from('people').select('id').in('role', ['administrator', 'admin'])
  const ids = ((office ?? []) as any[]).map(o => o.id)
  if (!ids.length) return false
  const link = `/admin/maintenance?ticket=${j.id}&w=${step}`
  if (every ? Date.now() - await lastSent(s, ids[0], link) < every : await sent(s, ids[0], link)) return false
  await insertNotifications(s, ids, { title: subject, body: html.replace(/<[^>]+>/g, '').slice(0, 160), type: 'maintenance', link } as any, { propertyId: j.property_id, roomId: j.room_id })
  await sendServerPush({ personIds: ids, title: subject, body: html.replace(/<[^>]+>/g, '').slice(0, 120), url: `/admin/maintenance?ticket=${j.id}`, tag: `watch-${j.id}` } as any).catch(() => 0)
  await deliverEmail({ to: [OFFICE_ALERT_EMAIL], subject, html: await buildEmail(`${html}${officeButton(`/admin/maintenance?ticket=${j.id}`, 'Open this job')}`, { kind: 'office-repairs', signature: false }) }).catch(() => null)
  return true
}

export async function watchJobs(s: SupabaseClient) {
  const done: string[] = []
  const now = Date.now()
  const { data } = await s.from('maintenance_tickets')
    .select('id, title, category, status, priority, location, property_id, room_id, contractor_id, booked_date, booked_slot, arrived_at, completed_at, return_needed, return_date, approved_at, created_at, updated_at, on_hold, properties(name, address), people!contractor_id(*)')
    .in('status', ['assigned', 'in_progress', 'reported'])
    .not('contractor_id', 'is', null)
    .gte('created_at', new Date(now - 120 * DAY).toISOString()) as { data: any[] | null }
  for (const j of data ?? []) {
    if (String(j.priority).toLowerCase() === 'emergency' || j.on_hold || !j.people) continue
    const what = short(j.title || j.category), where = house(j)

    // coming back, no date
    if (j.return_needed && !j.booked_date) {
      if (new Date(j.updated_at).getTime() < WATCH_FROM) continue
      const since = now - new Date(j.updated_at).getTime()
      if (since > 2 * DAY && await chaseContractor(s, j, 'return1', `please book your return visit for “${what}” at ${where} — the tenants are waiting:`, 'Book your return visit')) done.push(`return chase ${j.id}`)
      if (since > 4 * DAY && await tellOffice(s, j, 'return', `Return visit not booked — ${what}, ${where}`, `<p>${hiName(j.people)} said they need to come back to finish <b>${what}</b> at ${where}, but hasn’t booked a day in 4 days.</p>`, 2 * DAY)) done.push(`return office ${j.id}`)
      continue
    }

    // given out, never booked
    if (!j.booked_date && !j.arrived_at) {
      const given = await givenAt(s, j)
      if (given < WATCH_FROM) continue
      const age = now - given
      if (age > 1 * DAY && await chaseContractor(s, j, 'book1', `please book a day for “${what}” at ${where}:`, 'Please book a day')) done.push(`book chase 1 ${j.id}`)
      if (age > 2 * DAY) {
        if (await chaseContractor(s, j, 'book2', `reminder — “${what}” at ${where} still needs a day booking. Book it, or tell us you can’t take it:`, 'Reminder — book a day')) done.push(`book chase 2 ${j.id}`)
        if (await tellTenants(s, j, 'chasing', `We’re chasing your repair — ${what}`, 'The contractor hasn’t booked a day yet, so we’ve chased them. We’ll tell you as soon as it’s booked.')) done.push(`tenants told chasing ${j.id}`)
      }
      if (age > 3 * DAY && await tellOffice(s, j, 'unbooked', `Not booked after ${Math.floor(age / DAY)} days — ${what}, ${where}`, `<p>${hiName(j.people)} has had <b>${what}</b> at ${where} for ${Math.floor(age / DAY)} days without booking a day, after two reminders. Give it to someone else?</p>`, 2 * DAY)) done.push(`office unbooked ${j.id}`)
      continue
    }

    // booked day gone, no arrival
    if (j.booked_date && !j.arrived_at && String(j.booked_date).slice(0, 10) < today()) {
      const day = String(j.booked_date).slice(0, 10), key = `missed-${day}`
      if (new Date(`${day}T00:00:00Z`).getTime() < WATCH_FROM) continue
      if (await chaseContractor(s, j, key, `your visit for “${what}” at ${where} was booked for ${fullDay(day)}. Did you go? Log it — or rebook:`, 'Did you go?')) done.push(`missed chase ${j.id}`)
      if (await tellTenants(s, j, `came-${day}`, `Did the contractor come? — ${what}`, `A visit was booked for ${fullDay(day)}. Did the contractor come? Tap to tell us — if not, we’ll get it rebooked.`)) done.push(`tenants asked came ${j.id}`)
      const late = (new Date(today()).getTime() - new Date(day).getTime()) / DAY
      if (late >= 2 && await tellOffice(s, j, key, `Visit not logged — ${what}, ${where}`, `<p>The visit for <b>${what}</b> at ${where} was booked for ${fullDay(day)} and nobody has logged it or rebooked.</p>`)) done.push(`office missed ${j.id}`)
      continue
    }

    // arrived, never finished
    if (j.arrived_at && !j.completed_at) {
      if (new Date(j.arrived_at).getTime() < WATCH_FROM) continue
      const since = now - new Date(j.arrived_at).getTime(), key = `open-${String(j.arrived_at).slice(0, 10)}`
      if (since > 1 * DAY && await chaseContractor(s, j, key, `how did “${what}” at ${where} go? Mark it done — or say you’re coming back:`, 'How did it go?')) done.push(`finish chase ${j.id}`)
      if (since > 3 * DAY && await tellTenants(s, j, `fixed-${String(j.arrived_at).slice(0, 10)}`, `Is it fixed? — ${what}`, 'The contractor came — is it fixed now? Tap to tell us.')) done.push(`tenants asked fixed ${j.id}`)
      if (since > 4 * DAY && await tellOffice(s, j, key, `Not finished — ${what}, ${where}`, `<p>${hiName(j.people)} arrived for <b>${what}</b> at ${where} ${Math.floor(since / DAY)} days ago and hasn’t marked it done or booked a return.</p>`)) done.push(`office open ${j.id}`)
    }
  }
  return done
}

/** What the tenant should be asked on the visit page right now, if anything. */
export function tenantCheck(j: { status?: string; booked_date?: string | null; arrived_at?: string | null; completed_at?: string | null; priority?: string | null }): 'came' | 'fixed' | null {
  if (String(j.priority).toLowerCase() === 'emergency' || ['completed', 'cancelled'].includes(String(j.status))) return null
  if (j.booked_date && !j.arrived_at && String(j.booked_date).slice(0, 10) < today()) return 'came'
  if (j.arrived_at && !j.completed_at && Date.now() - new Date(j.arrived_at).getTime() > 1 * DAY) return 'fixed'
  return null
}

/** The tenant's answer. */
export async function tenantAnswer(s: SupabaseClient, ticketId: string, who: { name: string }, answer: 'came' | 'not_came' | 'fixed' | 'not_fixed') {
  const { data: j } = await s.from('maintenance_tickets').select('id, title, category, status, location, property_id, room_id, contractor_id, booked_date, booked_slot, arrived_at, completed_at, priority, properties(name, address), people!contractor_id(*)').eq('id', ticketId).maybeSingle() as { data: any }
  if (!j) return { ok: false, error: 'That job wasn’t found.' }
  const check = tenantCheck(j)
  const what = short(j.title || j.category), where = house(j)
  const now = new Date().toISOString()
  if (answer === 'came' && check === 'came') {
    // the visit happened: count it as arrived on the day, and ask the contractor to finish it off
    const start = Number(String(j.booked_slot ?? '').replace(/^by /, '').split(/[-:]/)[0]) || 9
    await s.from('maintenance_tickets').update({ arrived_at: new Date(`${String(j.booked_date).slice(0, 10)}T${String(start).padStart(2, '0')}:00:00`).toISOString() }).eq('id', j.id)
    if (j.people) await tellContractor(j.people, j.contractor_id, { text: `CAPITAL ROOMS: ${who.name} says you came for “${what}” at ${where}. Please mark it done — or say you’re coming back: ${PORTAL_URL}/contractor/job/${j.id}`, title: 'Please finish the job off', body: `${who.name} says you came for ${what}`, url: `/contractor/job/${j.id}`, link: `${PORTAL_URL}/contractor/job/${j.id}`, tag: `job-${j.id}` })
    return { ok: true, message: 'Thanks — we’ll get the contractor to finish it off.' }
  }
  if (answer === 'not_came' && check === 'came') {
    await s.from('maintenance_tickets').update({ booked_date: null, booked_slot: null, admin_note: `[${fullDay(today())}] ${who.name} says the contractor didn’t come on ${fullDay(String(j.booked_date))}.` }).eq('id', j.id)
    if (j.people) await tellContractor(j.people, j.contractor_id, { text: `CAPITAL ROOMS: ${who.name} says nobody came for “${what}” at ${where} on ${fullDay(String(j.booked_date))}. Please book a new day: ${PORTAL_URL}/contractor/job/${j.id}`, title: 'Missed visit — please rebook', body: `${what} at ${where}`, url: `/contractor/job/${j.id}`, link: `${PORTAL_URL}/contractor/job/${j.id}`, tag: `job-${j.id}` })
    await tellOffice(s, j, `noshow-${String(j.booked_date).slice(0, 10)}`, `Contractor didn’t come — ${what}, ${where}`, `<p>${who.name} says nobody came on ${fullDay(String(j.booked_date))}. The contractor has been asked to rebook; the job watch keeps chasing.</p>`)
    return { ok: true, message: 'Sorry about that — we’ve asked the contractor to rebook and told the office.' }
  }
  if (answer === 'fixed' && check === 'fixed') {
    await s.from('maintenance_tickets').update({ status: 'completed', completed_at: now, aftercare_notes: `${who.name} confirmed it’s fixed.` }).eq('id', j.id)
    if (j.people) await tellContractor(j.people, j.contractor_id, { text: `CAPITAL ROOMS: ${who.name} says “${what}” at ${where} is fixed — thank you. Add your price and invoice as usual: ${PORTAL_URL}/contractor/job/${j.id}`, title: 'Tenant says it’s fixed', body: `${what} at ${where}`, url: `/contractor/job/${j.id}`, link: `${PORTAL_URL}/contractor/job/${j.id}`, tag: `job-${j.id}` })
    return { ok: true, message: 'Great — marked as fixed.' }
  }
  if (answer === 'not_fixed' && check === 'fixed') {
    if (j.people) await tellContractor(j.people, j.contractor_id, { text: `CAPITAL ROOMS: ${who.name} says “${what}” at ${where} still isn’t fixed. Please book a return visit: ${PORTAL_URL}/contractor/job/${j.id}`, title: 'Still not fixed', body: `${what} at ${where}`, url: `/contractor/job/${j.id}`, link: `${PORTAL_URL}/contractor/job/${j.id}`, tag: `job-${j.id}` })
    await s.from('maintenance_tickets').update({ return_needed: true, return_reason: `${who.name}: still not fixed`, booked_date: null, booked_slot: null }).eq('id', j.id)
    await tellOffice(s, j, `notfixed-${today()}`, `Still not fixed — ${what}, ${where}`, `<p>${who.name} says it’s still not fixed. The contractor has been asked to come back; the job watch keeps chasing.</p>`)
    return { ok: true, message: 'Sorry — we’ve asked the contractor to come back and told the office.' }
  }
  return { ok: true, message: 'Thanks — that’s already been sorted.' }
}

// A contractor asks the tenants a question, and the tenant's answer comes straight back to them (15 Nov 2026, Harry:
// "in emergencies they may need more info from tenant … this would be similar for all jobs"). Works for contractors
// on the app and those who only use their text/email link: the question goes to the tenants who'd be visited (that
// room's for a room job, the whole house for a shared area) in their app, by push and email; the tenant replies on the
// job or emergency screen and the reply is texted/emailed/pushed to the contractor with their link. Nothing to set up.
// Tenants see the contractor's FIRST name only (Harry: "Ricky our emergency contractor will be visiting"). Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'
import { activeTenantIds, insertNotifications, dispatchChannels } from '@/lib/serverNotify'
import { inTenantRoom } from '@/lib/repairs/where'
import { tellContractor } from '@/lib/contractorContact'
import { bookingLink } from '@/lib/jobs/bookingLink'
import { hiName } from '@/lib/people'
import { PORTAL_URL } from '@/lib/emailWrapper'

const short = (t: string) => { const x = String(t || 'your repair').replace(/^\[[^\]]*\]\s*/, '').split(/\s+—\s+/)[0]; return x.length > 40 ? `${x.slice(0, 40)}…` : x }

/** The contractor's first name for tenants: "Ricky" — never their surname, number or company. */
export const firstNameForTenants = (p: any) => { const n = hiName(p); return n && n !== 'there' && !/sir or madam/i.test(n) ? n : 'Your contractor' }

async function ticketAndEmergency(s: SupabaseClient, ticketId: string) {
  const { data: t } = await s.from('maintenance_tickets').select('id, title, category, location, property_id, room_id, contractor_id').eq('id', ticketId).maybeSingle() as { data: any }
  if (!t) return null
  const { data: em } = await s.from('emergencies').select('id, status, chosen_response_id').eq('ticket_id', ticketId).not('status', 'in', '(resolved,cancelled)').maybeSingle() as { data: any }
  return { t, em }
}

export async function askTenants(s: SupabaseClient, ticketId: string, contractorId: string, question: string) {
  const q = question.trim().slice(0, 500)
  if (!q) return { ok: false, error: 'Write your question.' }
  const got = await ticketAndEmergency(s, ticketId)
  if (!got || got.t.contractor_id !== contractorId) return { ok: false, error: 'This job isn’t yours.' }
  const { t, em } = got
  const { data: c } = await s.from('people').select('salutation, first_name, last_name, full_name, company').eq('id', contractorId).maybeSingle()
  const ids = await activeTenantIds(s, t.property_id, inTenantRoom({ location: t.location }) ? t.room_id : null)
  if (!ids.length) return { ok: false, error: 'There’s no one living there to ask — call the office.' }
  const link = em ? `/tenant/emergency/${em.id}?reply=1` : `/tenant/visit/${t.id}?reply=1`
  const title = `${firstNameForTenants(c)} has a question — ${short(t.title || t.category)}`
  await insertNotifications(s, ids, { title, body: q, type: 'maintenance', link } as any, { propertyId: t.property_id, roomId: t.room_id })
  await dispatchChannels(s, ids, { title, body: `${q}\n\nTap to answer.`, link } as any, 'push_email', null).catch(() => null)
  if (em) await s.from('emergency_events').insert({ emergency_id: em.id, kind: 'question', note: `Contractor asked the tenants: “${q}”`, by_text: firstNameForTenants(c) })
  return { ok: true, told: ids.length }
}

/** The tenant's reply goes straight to the contractor, with the link that opens their job. */
export async function replyToContractor(s: SupabaseClient, ticketId: string, tenant: { personId: string; name: string; room?: string | null }, text: string) {
  const msg = text.trim().slice(0, 800)
  if (!msg) return { ok: false, error: 'Write your answer.' }
  const got = await ticketAndEmergency(s, ticketId)
  if (!got?.t.contractor_id) return { ok: false, error: 'No contractor is booked for this yet — the office has your message.' }
  const { t, em } = got
  const { data: c } = await s.from('people').select('*').eq('id', t.contractor_id).maybeSingle()
  let link = bookingLink(t.id, t.contractor_id), url = `/contractor/job/${t.id}`
  if (em?.chosen_response_id) {
    const { data: r } = await s.from('emergency_responses').select('token, contractor_id').eq('id', em.chosen_response_id).maybeSingle() as { data: any }
    if (r?.contractor_id === t.contractor_id) { link = `${PORTAL_URL.replace(/\/$/, '')}/e/${r.token}`; url = `/e/${r.token}` }
  }
  const from = `${tenant.name}${tenant.room ? ` (${tenant.room})` : ''}`
  const out = await tellContractor(c, t.contractor_id, {
    text: `CAPITAL ROOMS: ${from} replied about “${short(t.title)}”: ${msg}\nOpen the job: ${link}`,
    title: `Reply from ${tenant.name}`, body: msg.slice(0, 140), url, link, tag: `job-${t.id}`,
  })
  if (em) await s.from('emergency_events').insert({ emergency_id: em.id, kind: 'reply', note: `${from} replied: “${msg}”`, by_text: tenant.name })
  return { ok: true, via: out.via }
}

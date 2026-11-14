// One way to tell tenants about a repair (14 Nov 2026, Harry: "I approved a mattress report … there was no
// notification … if they were waiting how would they know?" and "her list of messages does not say what job the update
// relates to"). Every update about a job — approved, booked, on the way, arrived, done — goes:
//   · into the app inbox, titled with the job ("Mattress · contractor booked"), opening that job — always
//   · to their phone as a notification — when tenant messages are on for CROS or for this property (lib/comms)
// Who: the person who reported it, plus — for a visit to a shared area — everyone living there; for a job in a room,
// whoever lives in that room.
import type { SupabaseClient } from '@supabase/supabase-js'
import { activeTenantIds, insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { inTenantRoom } from '@/lib/repairs/where'

export type JobUpdate = 'approved' | 'booked' | 'arrived' | 'done' | 'note'

export function jobName(t: { title?: string | null; category?: string | null }) {
  const raw = String(t.title || t.category || 'Your repair').split(' — ')[0].replace(/-/g, ' ').trim()
  return raw.length > 40 ? raw.slice(0, 38).trimEnd() + '…' : raw
}

export async function tellJobTenants(s: SupabaseClient, ticketId: string, o: { kind: JobUpdate; line: string; whole?: boolean }) {
  const { data: t } = await s.from('maintenance_tickets').select('id, title, category, location, property_id, room_id, reporter_id').eq('id', ticketId).maybeSingle() as { data: any }
  if (!t) return { told: 0 }
  const reporter = t.reporter_id ? [t.reporter_id] : []
  let ids: string[] = []
  if (o.whole || !inTenantRoom({ location: t.location })) ids = await activeTenantIds(s, t.property_id).catch(() => [])
  else if (t.room_id) ids = await activeTenantIds(s, t.property_id, t.room_id).catch(() => [])
  // the reporter only if they still live there (tenants only — the office or a contractor may have raised it)
  const living = new Set(await activeTenantIds(s, t.property_id).catch(() => [] as string[]))
  const people = [...new Set([...ids, ...reporter.filter(r => living.has(r))])]
  if (!people.length) return { told: 0 }
  const title = `${jobName(t)} · ${{ approved: 'approved', booked: 'visit booked', arrived: 'contractor arrived', done: 'job done', note: 'update' }[o.kind]}`
  await insertNotifications(s, people, { title, body: o.line, type: 'maintenance', link: `/tenant/visit/${t.id}` } as any).catch(() => null)
  let pushed = 0
  for (const id of people) pushed += await sendServerPush({ personId: id, title, body: o.line, url: `/tenant/visit/${t.id}`, tag: `job-${t.id}` } as any).catch(() => 0)
  return { told: people.length, pushed }
}

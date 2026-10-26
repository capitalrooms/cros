// The next clean at a house, once one is finished (26 Oct 2026, Harry: "once they have completed the assigned cleans how
// does it populate with the next cleans due"). One rule, used when a clean is finished or logged afterwards:
//   · a room's move-out clean is a one-off — nothing follows it
//   · nothing is added if a clean is already booked ahead at the house
//   · how often: the house's cleaning frequency (Cleaning screen), else this clean's, else every 2 weeks
//   · the day and time: the house's set day (the first one at least the gap less 3 days on) and time, else the
//     same gap and time as this clean
//   · who: the house's regular cleaner, else whoever did this clean
// With a full schedule set for the house (how often, day, time) it's a firm booking and the tenants are told; without
// one it's pencilled in for the cleaner and the office to confirm, and nobody is told yet.
import type { SupabaseClient } from '@supabase/supabase-js'
import { tellTenantsAboutClean } from '@/lib/cleans/tenantUpdates'

const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** The first `day` (1 Monday … 7 Sunday) on or after `iso`. */
const onOrAfter = (iso: string, day: number) => { const d = new Date(`${iso}T12:00:00Z`); const cur = ((d.getUTCDay() + 6) % 7) + 1; return addDays(iso, (day - cur + 7) % 7) }

export type NextResult = { made: false; why: string; existing?: string } | { made: true; id: string; date: string; time: string | null; firm: boolean; told: number }

export async function bookNextClean(s: SupabaseClient, cleanId: string, req?: Request | null): Promise<NextResult> {
  const { data: c } = await s.from('cleans').select('id, property_id, room_id, cleaner_id, clean_date, clean_time, duration_hours, clean_type, clean_frequency_weeks, status').eq('id', cleanId).maybeSingle()
  if (!c?.property_id) return { made: false, why: 'clean not found' }
  if ((c as any).room_id) return { made: false, why: 'a room’s move-out clean is a one-off' }
  const today = londonToday()
  const { data: ahead } = await s.from('cleans').select('id, clean_date').eq('property_id', c.property_id).gt('clean_date', today)
    .neq('id', c.id).not('status', 'in', '("cancelled","completed")').order('clean_date').limit(1)
  if (ahead?.length) return { made: false, why: 'a clean is already booked ahead', existing: ahead[0].clean_date }

  let { data: h, error } = await s.from('properties').select('regular_cleaner_id, clean_frequency_weeks, clean_day, clean_time').eq('id', c.property_id).maybeSingle()
  if (error) h = (await s.from('properties').select('clean_frequency_weeks').eq('id', c.property_id).maybeSingle()).data as any
  const house = (h ?? {}) as any
  const weeks = Number(house.clean_frequency_weeks || (c as any).clean_frequency_weeks || 2)
  const firm = !!(house.clean_day && house.clean_time && house.clean_frequency_weeks)

  // with a set day: the first one at least (gap − 3 days) after this clean — so a clean done a little early or late
  // neither doubles up nor leaves a long gap (weekly Thursdays: done Mon, Tue or Thu → the next Thursday but one)
  const from = String(c.clean_date || today)
  let date = house.clean_day ? onOrAfter(addDays(from, 7 * weeks - 3), Number(house.clean_day)) : addDays(from, 7 * weeks)
  while (date <= today) date = addDays(date, 7 * weeks)   // logged late: the next one from today on, keeping the rhythm
  const time = house.clean_time ? String(house.clean_time).slice(0, 5) : c.clean_time ? String(c.clean_time).slice(0, 5) : null

  const { data: made, error: insErr } = await s.from('cleans').insert({
    property_id: c.property_id, cleaner_id: house.regular_cleaner_id || c.cleaner_id, clean_date: date, clean_time: time,
    duration_hours: (c as any).duration_hours ?? null, clean_type: (c as any).clean_type || 'routine', clean_frequency_weeks: weeks, status: 'scheduled',
    admin_note: firm ? 'Booked from the house’s cleaning schedule.' : `Pencilled in ${weeks === 1 ? 'a week' : `${weeks} weeks`} after the last clean${time ? `, ${time}` : ''} — set the house’s day and time on the Cleaning screen to make these firm.`,
  }).select('id').single()
  if (insErr || !made) return { made: false, why: insErr?.message ?? 'could not add the next clean' }
  const told = firm ? (await tellTenantsAboutClean(s, made.id, 'booked', {}, req).catch(() => ({ sent: 0 }))).sent : 0
  return { made: true, id: made.id, date, time, firm, told }
}

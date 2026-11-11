// The weekly cleaning plan (11 Nov 2026, migration 276): for a week (Monday–Sunday), which houses each regular cleaner
// should clean, whether it's booked yet, how long it takes, and the office's extra tasks for that week. Used by the
// Sunday/Monday evening email (api/cron/cleaner-week), its preview on the Cleaning screen, and the cleaner's clean page.
// Server only (service key).
import type { SupabaseClient } from '@supabase/supabase-js'
import { PORTAL_URL } from '@/lib/emailWrapper'
import { dearLine, isTestEmail } from '@/lib/people'

export const WEEK_EMAIL_KEY = 'cleaner_week_email'
export type WeekEmailDay = 'off' | 'sunday' | 'monday'
export const WEEK_EMAIL_DAYS: { value: WeekEmailDay; label: string }[] = [
  { value: 'off', label: 'Off' }, { value: 'sunday', label: 'Sunday evening' }, { value: 'monday', label: 'Monday evening' },
]

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (isoDay: string, n: number) => iso(new Date(new Date(`${isoDay}T12:00:00Z`).getTime() + n * 86_400_000))
export const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
/** The Monday of the week a day falls in. */
export function mondayOf(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00Z`)
  return addDays(isoDay, -((d.getUTCDay() + 6) % 7))
}
/** The week an email sent today is about: on Sunday, the week starting tomorrow; any other day, this week. */
export function weekForEmail(today = londonToday()): string {
  return new Date(`${today}T12:00:00Z`).getUTCDay() === 0 ? addDays(today, 1) : mondayOf(today)
}
export const longDay = (isoDay: string) => new Date(`${isoDay}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
export function clock(t: string | null | undefined) {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/)
  return m ? `${(+m[1] % 12) || 12}${m[2] === '00' ? '' : `:${m[2]}`}${+m[1] < 12 ? 'am' : 'pm'}` : ''
}
export const hoursText = (h: number) => `${h % 1 ? h.toFixed(1) : h} hour${h === 1 ? '' : 's'}`

export interface WeekTask { id: string; propertyId: string; roomId: string | null; roomName: string | null; task: string; extraHours: number | null }
export interface WeekHouse {
  propertyId: string; name: string; address: string | null
  usualDay: number | null; usualTime: string | null; hours: number | null; everyWeeks: number | null
  /** due by the schedule this week (or overdue); false = only here for an extra task */
  due: boolean
  booked: { date: string; time: string | null; done: boolean } | null
  tasks: WeekTask[]
}
export interface CleanerWeek { cleanerId: string; name: string; email: string | null; test: boolean; person: any; houses: WeekHouse[] }
export interface WeekPlan { weekStart: string; weekEnd: string; cleaners: CleanerWeek[]; unassigned: { name: string; tasks: WeekTask[] }[] }

/** Everything for one week. Houses need a regular cleaner and a "how often" to be in it; extra tasks always are. */
export async function buildWeekPlan(s: SupabaseClient, weekStart: string): Promise<WeekPlan> {
  const weekEnd = addDays(weekStart, 6)
  const [{ data: houses }, { data: tasks }, { data: people }] = await Promise.all([
    s.from('properties').select('id, name, address, regular_cleaner_id, clean_frequency_weeks, clean_day, clean_time, clean_hours').not('regular_cleaner_id', 'is', null) as any,
    s.from('clean_week_tasks').select('id, property_id, room_id, task, extra_hours, rooms(name)').eq('week_start', weekStart).is('cancelled_at', null).order('created_at') as any,
    s.from('people').select('id, salutation, first_name, last_name, full_name, email, role').eq('role', 'cleaner') as any,
  ])
  const taskRows: WeekTask[] = ((tasks ?? []) as any[]).map(t => ({ id: t.id, propertyId: t.property_id, roomId: t.room_id, roomName: t.rooms?.name ?? null, task: t.task, extraHours: t.extra_hours != null ? Number(t.extra_hours) : null }))
  const houseIds = [...new Set([...((houses ?? []) as any[]).map(h => h.id), ...taskRows.map(t => t.propertyId)])]
  // the houses' cleans up to the end of the week (the last one before it says when the next is due)
  const { data: cleans } = houseIds.length
    ? await s.from('cleans').select('property_id, room_id, clean_date, clean_time, status').in('property_id', houseIds).lte('clean_date', weekEnd).neq('status', 'cancelled').order('clean_date') as any
    : { data: [] }
  const extraHouses = taskRows.filter(t => !((houses ?? []) as any[]).some(h => h.id === t.propertyId)).map(t => t.propertyId)
  const { data: other } = extraHouses.length ? await s.from('properties').select('id, name, address, regular_cleaner_id, clean_frequency_weeks, clean_day, clean_time, clean_hours').in('id', [...new Set(extraHouses)]) as any : { data: [] }

  const byCleaner = new Map<string, WeekHouse[]>()
  const unassigned: WeekPlan['unassigned'] = []
  for (const h of [...((houses ?? []) as any[]), ...((other ?? []) as any[])]) {
    const mine = ((cleans ?? []) as any[]).filter(c => c.property_id === h.id && !c.room_id)   // the house clean, not one-room move-out cleans
    const inWeek = mine.find(c => c.clean_date >= weekStart && c.clean_date <= weekEnd)
    const before = mine.filter(c => c.clean_date < weekStart).pop()
    const every = h.clean_frequency_weeks ? Number(h.clean_frequency_weeks) : null
    const due = !!h.regular_cleaner_id && !!every && (!!inWeek || !before || addDays(before.clean_date, every * 7) <= weekEnd)
    const t = taskRows.filter(x => x.propertyId === h.id)
    if (!due && !t.length) continue
    const house: WeekHouse = {
      propertyId: h.id, name: h.name, address: h.address ?? null, usualDay: h.clean_day ?? null, usualTime: h.clean_time ? String(h.clean_time).slice(0, 5) : null,
      hours: h.clean_hours != null ? Number(h.clean_hours) : null, everyWeeks: every, due,
      booked: inWeek ? { date: inWeek.clean_date, time: inWeek.clean_time ? String(inWeek.clean_time).slice(0, 5) : null, done: inWeek.status === 'completed' } : null,
      tasks: t,
    }
    if (!h.regular_cleaner_id) { if (t.length) unassigned.push({ name: h.name, tasks: t }); continue }
    byCleaner.set(h.regular_cleaner_id, [...(byCleaner.get(h.regular_cleaner_id) ?? []), house])
  }
  const cleaners: CleanerWeek[] = [...byCleaner.entries()].map(([id, hs]) => {
    const p = ((people ?? []) as any[]).find(x => x.id === id)
    const name = p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email) : 'Unknown cleaner'
    return { cleanerId: id, name, email: p?.email ?? null, test: isTestEmail(p?.email), person: p ?? null, houses: hs.sort((a, b) => a.name.localeCompare(b.name)) }
  }).sort((a, b) => Number(a.test) - Number(b.test) || a.name.localeCompare(b.name))
  return { weekStart, weekEnd, cleaners, unassigned }
}

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** The email for one cleaner: subject + inner HTML (sendEmail adds the letterhead). */
export function weekEmail(c: CleanerWeek, plan: Pick<WeekPlan, 'weekStart' | 'weekEnd'>): { subject: string; html: string } {
  const toBook = c.houses.filter(h => !h.booked)
  const range = `${longDay(plan.weekStart)} to ${longDay(plan.weekEnd)}`
  const p = (t: string, extra = '') => `<p style="margin:0 0 14px;font-size:15px;color:#1c1917;line-height:1.6;${extra}">${t}</p>`
  const card = (h: WeekHouse) => {
    const usual = [h.usualDay ? `${DAY_NAMES[h.usualDay - 1]}${h.usualTime ? ` at ${clock(h.usualTime)}` : ''}` : '', h.hours ? `about ${hoursText(h.hours)}` : ''].filter(Boolean).join(' · ')
    const extraHours = h.tasks.reduce((n, t) => n + (t.extraHours ?? 0), 0)
    const status = h.booked
      ? `<span style="color:#166534;font-weight:700;">${h.booked.done ? 'Done' : 'Booked'}: ${longDay(h.booked.date)}${h.booked.time ? ` at ${clock(h.booked.time)}` : ''}</span>`
      : `<span style="color:#b45309;font-weight:700;">Not booked yet: please book it in the app</span>`
    return `<div style="margin:0 0 12px;padding:14px 16px;border:1px solid #e7e5e4;border-radius:12px;">`
      + `<p style="margin:0;font-size:16px;font-weight:700;color:#1c1917;">${esc(h.name)}</p>`
      + (h.address ? `<p style="margin:2px 0 0;font-size:13px;color:#57534e;">${esc(h.address)}</p>` : '')
      + (h.due ? (usual ? `<p style="margin:8px 0 0;font-size:14px;color:#44403c;">Usual clean: ${usual}${extraHours ? `, plus ${hoursText(extraHours)} for the extras below` : ''}</p>` : '')
        : `<p style="margin:8px 0 0;font-size:14px;color:#44403c;">Not a usual cleaning week here, just the extra job${h.tasks.length === 1 ? '' : 's'} below${extraHours ? ` (about ${hoursText(extraHours)})` : ''}.</p>`)
      + `<p style="margin:8px 0 0;font-size:14px;">${status}</p>`
      + (h.tasks.length ? `<p style="margin:10px 0 4px;font-size:14px;font-weight:700;color:#1c1917;">Also this week</p><ul style="margin:0;padding-left:20px;font-size:14px;color:#1c1917;line-height:1.55;">${h.tasks.map(t => `<li style="margin:0 0 4px;">${t.roomName ? `<strong>${esc(t.roomName)}:</strong> ` : ''}${esc(t.task)}${t.extraHours ? ` <span style="color:#57534e;">(about ${hoursText(t.extraHours)})</span>` : ''}</li>`).join('')}</ul>` : '')
      + `</div>`
  }
  const subject = toBook.length
    ? `Your cleans this week: please book ${toBook.length === 1 ? '1 clean' : `${toBook.length} cleans`}`
    : 'Your cleans this week: all booked, thank you'
  const html = p(c.person ? dearLine(c.person) : 'Hello,')
    + p(toBook.length
      ? `Here are your Capital Rooms cleans for ${range}. Please book ${toBook.length === 1 ? 'the one that isn’t booked yet' : 'the ones that aren’t booked yet'} in the app as soon as you can, so the tenants know when you’re coming.`
      : `Here are your Capital Rooms cleans for ${range}. Everything is booked, so there’s nothing to do now. Thank you.`)
    + c.houses.map(card).join('')
    + (toBook.length ? `<p style="margin:18px 0 22px;"><a href="${PORTAL_URL}/cleaner" style="display:inline-block;background:#181614;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Open the app to book</a></p>` : '')
    + `<p style="margin:0;font-size:13px;color:#57534e;line-height:1.5;">If a day doesn’t work, book the nearest day that does, or reply to this email and we’ll sort it out.</p>`
  return { subject, html }
}

/** The send-day setting (off until the office switches it on). */
export async function weekEmailDay(s: SupabaseClient): Promise<WeekEmailDay> {
  const { data } = await s.from('system_settings').select('value').eq('key', WEEK_EMAIL_KEY).maybeSingle()
  const v = String((data as any)?.value ?? 'off') as WeekEmailDay
  return WEEK_EMAIL_DAYS.some(d => d.value === v) ? v : 'off'
}

/**
 * Send a week's emails: one per real cleaner with something that week, never twice for the same week
 * (clean_week_emails). Test accounts are left out. Returns who got one, and anyone skipped and why.
 */
export async function sendWeekEmails(s: SupabaseClient, weekStart: string): Promise<{ sent: string[]; skipped: string[] }> {
  const { sendEmail } = await import('@/lib/sendEmail')
  const plan = await buildWeekPlan(s, weekStart)
  const { data: already } = await s.from('clean_week_emails').select('cleaner_id').eq('week_start', weekStart)
  const done = new Set(((already ?? []) as any[]).map(r => r.cleaner_id))
  const sent: string[] = [], skipped: string[] = []
  for (const c of plan.cleaners) {
    if (c.test) continue
    if (done.has(c.cleanerId)) { skipped.push(`${c.name}: already sent this week`); continue }
    if (!c.email || /\.invalid$/i.test(c.email)) { skipped.push(`${c.name}: no email address`); continue }
    // claim the week first, so two runs at once can't both send
    const { error: claim } = await s.from('clean_week_emails').insert({ week_start: weekStart, cleaner_id: c.cleanerId, sent_to: c.email, houses: c.houses.length })
    if (claim) { skipped.push(`${c.name}: ${/duplicate|unique/i.test(claim.message) ? 'already sent this week' : claim.message}`); continue }
    const { subject, html } = weekEmail(c, plan)
    const r = await sendEmail(c.email, subject, html, { kind: 'cleaner-week' })
    if (r.ok) sent.push(c.name)
    else { await s.from('clean_week_emails').delete().eq('week_start', weekStart).eq('cleaner_id', c.cleanerId); skipped.push(`${c.name}: ${r.error ?? 'email failed'}`) }
  }
  return { sent, skipped }
}

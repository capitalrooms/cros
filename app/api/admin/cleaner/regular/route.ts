// /api/admin/cleaner/regular — each house's cleaning set-up, on the Cleaning screen (24–26 Oct 2026): its regular
// cleaner (migration 243), how often (clean_frequency_weeks), its usual day and time (245), and how tenants hear
// about cleans (lib/cleans/tenantUpdates).
//   GET                                                   → { ready, scheduleReady, channel, houses, cleaners }
//   POST { propertyId, cleanerId?, everyWeeks?, day?, time?, handOver? }  → saves the house; with a full schedule and
//        nothing booked, puts the next clean in the cleaner's diary and tells the tenants
//   POST { channel }                                      → how tenants hear about cleans
// Office staff with Maintenance (lib/access/areas: /api/admin/cleaner).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { displayName, isTestEmail } from '@/lib/people'
import { cleanChannel, setCleanChannel, tellTenantsAboutClean, CLEAN_CHANNELS, type CleanChannel } from '@/lib/cleans/tenantUpdates'

export const dynamic = 'force-dynamic'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
/** The next date on that weekday (1 Monday … 7 Sunday), from tomorrow. */
function nextOn(day: number): string {
  const d = new Date(`${today()}T12:00:00Z`)
  for (let i = 1; i <= 7; i++) { const t = new Date(d.getTime() + i * 86_400_000); if (((t.getUTCDay() + 6) % 7) + 1 === day) return t.toISOString().slice(0, 10) }
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const [full, { data: people }, { data: moveOuts }, { data: cleans }, channel] = await Promise.all([
    s.from('properties').select('id, name, regular_cleaner_id, clean_frequency_weeks, clean_day, clean_time').order('name'),
    s.from('people').select('id, salutation, first_name, last_name, full_name, email').eq('role', 'cleaner'),
    s.from('assigned_jobs').select('property_id').eq('status', 'pending'),
    s.from('cleans').select('property_id, clean_date, clean_time').gte('clean_date', today()).not('status', 'in', '("completed","cancelled")').order('clean_date'),
    cleanChannel(s),
  ])
  // before migrations 243 / 245 their columns aren't there: still list the houses, and say which migration is needed
  let houses: any[] | null = full.data, ready = true, scheduleReady = true
  if (full.error) {
    scheduleReady = false
    const mid = await s.from('properties').select('id, name, regular_cleaner_id, clean_frequency_weeks').order('name')
    if (mid.error) { ready = false; houses = (await s.from('properties').select('id, name, clean_frequency_weeks').order('name')).data } else houses = mid.data
  }
  const open = new Map<string, number>(), next = new Map<string, { date: string; time: string | null }>()
  for (const r of [...(moveOuts ?? []), ...(cleans ?? [])] as any[]) if (r.property_id) open.set(r.property_id, (open.get(r.property_id) ?? 0) + 1)
  for (const c of (cleans ?? []) as any[]) if (!next.has(c.property_id)) next.set(c.property_id, { date: c.clean_date, time: c.clean_time })
  return NextResponse.json({
    ready, scheduleReady, channel, channels: CLEAN_CHANNELS,
    houses: (houses ?? []).map((h: any) => ({ id: h.id, name: h.name, regularCleanerId: h.regular_cleaner_id ?? null, everyWeeks: h.clean_frequency_weeks ?? null,
      day: h.clean_day ?? null, time: h.clean_time ? String(h.clean_time).slice(0, 5) : null, openCleans: open.get(h.id) ?? 0, nextClean: next.get(h.id) ?? null })),
    cleaners: (people ?? []).map((p: any) => ({ id: p.id, name: displayName(p), test: isTestEmail(p.email) }))
      .sort((a, b) => Number(a.test) - Number(b.test) || a.name.localeCompare(b.name)),
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()

  if (b.channel !== undefined) {
    if (!CLEAN_CHANNELS.some(c => c.value === b.channel)) return NextResponse.json({ error: 'Pick how tenants hear about cleans.' }, { status: 400 })
    await setCleanChannel(s, b.channel as CleanChannel)
    return NextResponse.json({ ok: true })
  }

  const propertyId = String(b.propertyId ?? '')
  const patch: Record<string, unknown> = {}
  if (b.cleanerId !== undefined) {
    const cleanerId = b.cleanerId ? String(b.cleanerId) : null
    if (cleanerId) {
      const { data: c } = await s.from('people').select('id').eq('id', cleanerId).eq('role', 'cleaner').maybeSingle()
      if (!c) return NextResponse.json({ error: 'That person isn’t a cleaner in CROS.' }, { status: 400 })
    }
    patch.regular_cleaner_id = cleanerId
  }
  if (b.everyWeeks !== undefined) { const w = b.everyWeeks === null || b.everyWeeks === '' ? null : Number(b.everyWeeks); if (w !== null && ![1, 2, 3, 4].includes(w)) return NextResponse.json({ error: 'How often: every 1–4 weeks.' }, { status: 400 }); patch.clean_frequency_weeks = w }
  if (b.day !== undefined) { const d = b.day === null || b.day === '' ? null : Number(b.day); if (d !== null && !(d >= 1 && d <= 7)) return NextResponse.json({ error: 'Pick a day.' }, { status: 400 }); patch.clean_day = d }
  if (b.time !== undefined) { const t = b.time ? String(b.time) : null; if (t && !/^\d{2}:\d{2}$/.test(t)) return NextResponse.json({ error: 'Pick a time.' }, { status: 400 }); patch.clean_time = t }
  const { error } = await s.from('properties').update(patch).eq('id', propertyId)
  if (error) return NextResponse.json({ error: /clean_day|clean_time/.test(error.message) ? 'Run migration 245 first (it adds each house’s cleaning day and time).' : /regular_cleaner_id/.test(error.message) ? 'Run migration 243 first.' : error.message }, { status: 400 })

  const { data: h } = await s.from('properties').select('regular_cleaner_id, clean_frequency_weeks, clean_day, clean_time').eq('id', propertyId).maybeSingle()
  let moved = 0, booked: string | null = null
  const cleanerId = (h as any)?.regular_cleaner_id ?? null
  if (b.handOver && cleanerId) {
    // only work nobody has said yes to yet — an accepted move-out clean or a done clean stays with whoever has it
    const [{ data: jobs }, { data: cl }] = await Promise.all([
      s.from('assigned_jobs').update({ cleaner_id: cleanerId }).eq('property_id', propertyId).eq('status', 'pending').or(`cleaner_id.is.null,cleaner_id.neq.${cleanerId}`).select('id'),
      s.from('cleans').update({ cleaner_id: cleanerId }).eq('property_id', propertyId).gte('clean_date', today()).not('status', 'in', '("completed","cancelled")').is('accepted_at', null).or(`cleaner_id.is.null,cleaner_id.neq.${cleanerId}`).select('id'),
    ])
    moved = (jobs?.length ?? 0) + (cl?.length ?? 0)
  }
  // a full schedule and nothing booked: put the next clean in the cleaner's diary, and tell the tenants
  if (cleanerId && (h as any)?.clean_frequency_weeks && (h as any)?.clean_day && (h as any)?.clean_time) {
    const { data: ahead } = await s.from('cleans').select('id, clean_date, admin_note, accepted_at').eq('property_id', propertyId).gte('clean_date', today()).not('status', 'in', '("completed","cancelled")').order('clean_date').limit(1)
    // the next one was only pencilled in (lib/cleans/nextClean, before the house had a schedule): put it on the
    // schedule's day and time that week, make it firm and tell the tenants
    const p0 = ahead?.[0] as any
    if (p0 && /^Pencilled in/.test(p0.admin_note ?? '')) {
      const d = new Date(`${p0.clean_date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + (Number((h as any).clean_day) - (((d.getUTCDay() + 6) % 7) + 1)))
      let date = d.toISOString().slice(0, 10)
      if (date <= today()) date = new Date(d.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
      const { error: mvErr } = await s.from('cleans').update({ clean_date: date, clean_time: (h as any).clean_time, cleaner_id: cleanerId, clean_frequency_weeks: (h as any).clean_frequency_weeks, admin_note: 'Booked from the house’s cleaning schedule.' }).eq('id', p0.id)
      if (!mvErr) { booked = date; await tellTenantsAboutClean(s, p0.id, 'booked', {}, req).catch(() => null) }
    } else if (!ahead?.length) {
      const { data: made } = await s.from('cleans').insert({
        property_id: propertyId, cleaner_id: cleanerId, clean_date: nextOn((h as any).clean_day), clean_time: (h as any).clean_time,
        clean_type: 'routine', status: 'scheduled', clean_frequency_weeks: (h as any).clean_frequency_weeks,
        admin_note: 'Booked from the house’s cleaning schedule (Cleaning screen).',
      }).select('id, clean_date').single()
      if (made) { booked = made.clean_date; await tellTenantsAboutClean(s, made.id, 'booked', {}, req).catch(() => null) }
    }
  }
  return NextResponse.json({ ok: true, moved, booked })
}

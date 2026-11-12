'use client'
// Diary › Everything — viewings, repairs, cleans and appointments together.
// Rebuilt 12 Nov 2026 (Harry: "all entries you want to click on don't work… the diary is depressing to look at"):
//  • every entry opens a panel with the full details (job description, who, when, the house) and what you can do next
//  • a normal-looking week: Monday first, hours down the side, white and off-white bands, weekends shaded,
//    today marked, a line for "now", entries sized to how long they take
//  • Today at the top (the old "Map view" only ever showed the office pin, and its "Scheduled today" listed the week)
//  • the rest of the week underneath, day by day — also clickable

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { diaryTabs } from '@/lib/diaryTabs'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import SidePanel from '@/app/components/SidePanel'
import { withContractors } from '@/lib/contractors'
import LineIcon from '@/components/LineIcon'

type Kind = 'repair' | 'clean' | 'viewing' | 'appointment'

/** One diary entry, whatever it came from. */
interface Entry {
  key: string
  id: string
  kind: Kind
  date: string            // yyyy-mm-dd
  start: number | null    // minutes after midnight; null = time not set
  end: number | null
  timeLabel: string
  title: string           // what it is
  who: string             // contractor / cleaner / visitor
  propertyId: string | null
  place: string           // first line of the house
  room: string
  detail: string          // the full description / notes
  facts: [string, string][]
  status: string
  raw: any
}

const KIND: Record<Kind, { label: string; bar: string; tint: string; ink: string; glyph: string }> = {
  repair:      { label: 'Repair',      bar: '#2F6FB2', tint: '#E9F1FA', ink: '#173A5E', glyph: '🔧' },
  clean:       { label: 'Clean',       bar: '#2F855A', tint: '#E7F4EC', ink: '#1C4A33', glyph: '🧹' },
  viewing:     { label: 'Viewing',     bar: '#7A4FB8', tint: '#F1EAFA', ink: '#40266A', glyph: '👀' },
  appointment: { label: 'Appointment', bar: '#C0661A', tint: '#FCEFE2', ink: '#5E300A', glyph: '📋' },
}

const APPT_TYPES: Record<string, string> = {
  landlord: 'Landlord visit', lettings: 'Lettings', contractor: 'Contractor', cleaner: 'Cleaner', delivery: 'Delivery',
  inspection: 'Inspection', gas_safety: 'Gas safety check', electrical: 'Electrical check', fire_door: 'Fire door check',
  smoke_alarm: 'Smoke alarm check', management_visit: 'Management visit', viewing: 'Viewing', other: 'Appointment',
}

// contractor/cleaner rows carry first/last (and older full_name) — never .name
const whoName = (p: any) => ([p?.salutation, p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || '')
const firstLine = (s: string | null | undefined) => String(s ?? '').split(/\n|,/)[0].replace(/\s+[-–—]\s+.*$/, '').trim()
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const nice = (m: number) => { const h = Math.floor(m / 60), mm = m % 60, h12 = ((h + 11) % 12) + 1; return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}` }
const longDate = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const words = (s: string | null | undefined) => String(s ?? '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

/** "09:30:00" → 570; "9-12" / "15-18" (repair slots) → 540–720 */
function parseTime(t: string | null | undefined, minutes: number): { start: number | null; end: number | null } {
  const s = String(t ?? '').trim()
  const slot = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/)
  if (slot) return { start: Number(slot[1]) * 60, end: Number(slot[2]) * 60 }
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return { start: null, end: null }
  const start = Number(m[1]) * 60 + Number(m[2])
  return { start, end: start + minutes }
}

function mondayOf(d: Date) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }

export default function AgencyDiaryPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [entries, setEntries] = useState<Entry[]>([])
  const [outstandingJobs, setOutstandingJobs] = useState<any[]>([])
  const [showOutstanding, setShowOutstanding] = useState(false)
  const [showBookMenu, setShowBookMenu] = useState(false)
  const [open, setOpen] = useState<Entry | null>(null)
  const [cleanOpen, setCleanOpen] = useState<any | null>(null)
  const [hidden, setHidden] = useState<Set<Kind>>(new Set())
  const [now, setNow] = useState(() => new Date())
  const [isAdmin, setIsAdmin] = useState(false)   // repairs open in Maintenance, which lettings can't see

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t) }, [])

  useEffect(() => {
    let live = true
    async function load() {
      const data = await getCurrentUser()
      const role = data?.assignment?.role
      if (!data || !(role === 'administrator' || role === 'lettings')) { router.push('/login'); return }
      setIsAdmin(role === 'administrator')
      const from = ymd(weekStart)
      const toD = new Date(weekStart); toD.setDate(toD.getDate() + 7)
      const to = ymd(toD)
      try {
        const [maint, cleans, appts, views, outstanding] = await Promise.all([
          supabase.from('maintenance_tickets').select('*, property:properties(name, address), room:rooms(name)').gte('booked_date', from).lt('booked_date', to).order('booked_date'),
          supabase.from('cleans').select('*, property:properties(name, address), room:rooms(name), cleaner:cleaner_id(full_name, salutation, first_name, last_name, phone)').gte('clean_date', from).lt('clean_date', to).neq('status', 'cancelled').order('clean_date'),
          supabase.from('property_appointments').select('*, property:properties(name, address)').gte('appointment_date', from).lt('appointment_date', to).order('appointment_date'),
          // viewings.property_id has no FK, so no embed — names are looked up below
          supabase.from('viewings').select('*').gte('viewing_date', from).lt('viewing_date', to).or('viewing_status.is.null,viewing_status.not.in.(cancelled,closed)'),
          supabase.from('maintenance_tickets').select('*, property:properties(name, address), room:rooms(name)').eq('status', 'assigned').is('booked_date', null).order('created_at'),
        ])
        const jobs = (await withContractors(supabase as any, (maint.data ?? []) as any)) as any[]
        const viewRows = (views.data ?? []) as any[]
        const ids = [...new Set(viewRows.map(v => v.property_id).filter(Boolean))]
        const roomIds = [...new Set(viewRows.map(v => v.room_id).filter(Boolean))]
        const [{ data: vp }, { data: vr }] = await Promise.all([
          ids.length ? supabase.from('properties').select('id, name, address').in('id', ids) : Promise.resolve({ data: [] as any[] }),
          roomIds.length ? supabase.from('rooms').select('id, name').in('id', roomIds) : Promise.resolve({ data: [] as any[] }),
        ]) as any
        const propOf = new Map(((vp ?? []) as any[]).map(p => [p.id, p]))
        const roomOf = new Map(((vr ?? []) as any[]).map(r => [r.id, r.name]))

        const out: Entry[] = []
        for (const j of jobs) {
          const t = parseTime(j.booked_slot, 180)
          const who = whoName(j.contractor)
          out.push({
            key: `r-${j.id}`, id: j.id, kind: 'repair', date: j.booked_date, ...t,
            timeLabel: t.start == null ? (j.booked_slot || 'Time not set') : `${nice(t.start)}–${nice(t.end!)}`,
            title: j.title || 'Repair', who: who || 'No contractor yet', propertyId: j.property_id, place: firstLine(j.property?.name || j.property?.address), room: j.room?.name ?? '',
            detail: j.description || '',
            facts: [['Priority', words(j.priority)], ['Status', words(j.status)], ['Contractor', who || 'Not assigned'], ...(j.access_notes ? [['Access', j.access_notes] as [string, string]] : [])],
            status: j.status, raw: j,
          })
        }
        for (const c of (cleans.data ?? []) as any[]) {
          const t = parseTime(c.clean_time, Math.round((Number(c.duration_hours) || 2) * 60))
          const who = whoName(c.cleaner)
          const todos = Array.isArray(c.tenant_todos) ? c.tenant_todos.map((x: any) => typeof x === 'string' ? x : x?.text ?? x?.label).filter(Boolean) : []
          const special = Array.isArray(c.special_jobs) ? c.special_jobs.map((x: any) => typeof x === 'string' ? x : x?.text ?? x?.label).filter(Boolean) : []
          out.push({
            key: `c-${c.id}`, id: c.id, kind: 'clean', date: c.clean_date, ...t,
            timeLabel: t.start == null ? 'Time not set' : `${nice(t.start)}–${nice(t.end!)}`,
            title: c.clean_type ? `${words(c.clean_type)} clean` : 'Clean', who: who || 'No cleaner yet', propertyId: c.property_id, place: firstLine(c.property?.name || c.property?.address), room: c.room?.name ?? '',
            detail: [c.notes, c.admin_note && `Office note: ${c.admin_note}`, c.cleaner_note && `Cleaner’s note: ${c.cleaner_note}`, special.length && `Extra jobs: ${special.join(', ')}`, todos.length && `Tenants asked for: ${todos.join(', ')}`].filter(Boolean).join('\n\n'),
            facts: [['Cleaner', who || 'Not assigned'], ['Status', words(c.status)], ['Length', `${Number(c.duration_hours) || 2} hours`], ...(c.cleaner?.phone ? [['Phone', c.cleaner.phone] as [string, string]] : [])],
            status: c.status, raw: c,
          })
        }
        for (const a of (appts.data ?? []) as any[]) {
          const t = parseTime(a.appointment_time, Number(a.duration_minutes) || 60)
          const type = APPT_TYPES[a.appointment_type] ?? words(a.appointment_type)
          out.push({
            key: `a-${a.id}`, id: a.id, kind: a.appointment_type === 'viewing' ? 'viewing' : 'appointment', date: a.appointment_date, ...t,
            timeLabel: t.start == null ? 'Time not set' : `${nice(t.start)}–${nice(t.end!)}`,
            title: type, who: [a.visitor_name, a.visitor_company].filter(Boolean).join(', ') || '—', propertyId: a.property_id, place: firstLine(a.property?.name || a.property?.address), room: '',
            detail: a.notes || '',
            facts: [['Type', type], ['Who', [a.visitor_name, a.visitor_company].filter(Boolean).join(', ') || '—'], ...(a.visitor_phone ? [['Phone', a.visitor_phone] as [string, string]] : []), ['Tenants told', a.notify_tenants ? 'Yes' : 'No']],
            status: '', raw: a,
          })
        }
        for (const v of viewRows) {
          const t = parseTime(v.viewing_slot, Number(v.duration_minutes) || 15)
          const p = propOf.get(v.property_id)
          out.push({
            key: `v-${v.id}`, id: v.id, kind: 'viewing', date: v.viewing_date, ...t,
            timeLabel: t.start == null ? (v.viewing_slot || 'Time not set') : nice(t.start),
            title: 'Viewing', who: v.visitor_name || 'Viewer', propertyId: v.property_id, place: firstLine(p?.name || p?.address), room: v.room_id ? roomOf.get(v.room_id) ?? '' : '',
            detail: [v.notes, v.feedback && `Feedback: ${v.feedback}`].filter(Boolean).join('\n\n'),
            facts: [['Viewer', v.visitor_name || '—'], ...(v.visitor_phone ? [['Phone', v.visitor_phone] as [string, string]] : []), ...(v.visitor_email ? [['Email', v.visitor_email] as [string, string]] : []), ['Status', words(v.viewing_status || 'booked')]],
            status: v.viewing_status ?? '', raw: v,
          })
        }
        out.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? -1) - (b.start ?? -1))
        if (!live) return
        setEntries(out)
        setOutstandingJobs((await withContractors(supabase as any, (outstanding.data ?? []) as any)) as any)
      } catch (e) { console.error('Diary', e) }
      if (live) setLoading(false)
    }
    load()
    return () => { live = false }
  }, [router, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d }), [weekStart])
  const shown = entries.filter(e => !hidden.has(e.kind))
  const today = todayYmd()
  const todays = shown.filter(e => e.date === today)

  // the hours shown: 8am–7pm, stretched to fit anything earlier or later
  const timed = shown.filter(e => e.start != null)
  const firstHour = Math.min(8, ...timed.map(e => Math.floor(e.start! / 60)))
  const lastHour = Math.max(19, ...timed.map(e => Math.ceil((e.end ?? e.start! + 60) / 60)))
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)
  const HOUR = 52
  const nowMin = now.getHours() * 60 + now.getMinutes()

  if (loading) return <GenericPageSkeleton />

  const weekLabel = `${days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} – ${days[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
  const move = (n: number) => { const d = new Date(weekStart); d.setDate(d.getDate() + n * 7); setWeekStart(d) }
  const isThisWeek = ymd(weekStart) === ymd(mondayOf(new Date()))

  const Row = ({ e, showDate }: { e: Entry; showDate?: boolean }) => (
    <button type="button" onClick={() => setOpen(e)} className="group flex w-full items-stretch gap-md px-md py-sm text-left transition hover:bg-[#F7F5F0] focus-visible:bg-[#F7F5F0] focus-visible:outline-none">
      <span className="w-1 shrink-0 rounded-full" style={{ background: KIND[e.kind].bar }} />
      <span className="w-24 shrink-0 pt-px text-sm font-semibold tabular-nums text-neutral-900">{showDate ? new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }) + ' · ' : ''}{e.start == null ? '—' : nice(e.start)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-neutral-900">{e.title}{e.place ? <span className="font-normal text-neutral-600"> · {e.place}{e.room ? `, ${e.room}` : ''}</span> : null}</span>
        <span className="block truncate text-xs text-neutral-500">{KIND[e.kind].label} · {e.who}{e.detail ? ` · ${e.detail.replace(/\s+/g, ' ')}` : ''}</span>
      </span>
      <span className="self-center text-xs font-semibold text-neutral-400 group-hover:text-neutral-900">Open →</span>
    </button>
  )

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/appointments" />} />
      <PageHero title="Diary" subtitle="Everything: viewings, repairs, cleans and appointments in one place" tabs={diaryTabs('all')} />
      {cleanOpen && <CancelClean clean={cleanOpen} onClose={() => setCleanOpen(null)} onDone={() => { setEntries(es => es.filter(x => !(x.kind === 'clean' && x.id === cleanOpen.id))); setCleanOpen(null); setOpen(null) }} />}

      <main className="mx-auto max-w-6xl px-lg py-xl">
        {/* controls */}
        <div className="mb-lg flex flex-wrap items-center gap-sm">
          <div className="relative">
            <button onClick={() => setShowBookMenu(!showBookMenu)} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800">+ Book</button>
            {showBookMenu && (
              <div className="absolute left-0 top-full z-20 mt-sm min-w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                {[['/admin/agency-diary/book-maintenance', 'Repair visit', 'Choose from approved jobs'], ['/admin/agency-diary/book-clean', 'Clean', 'Book a cleaner'], ['/admin/agency-diary/book-appointment', 'Other appointment', 'Inspections, landlord visits and so on']].map(([h, t, s]) => (
                  <Link key={h} href={h} className="block border-b border-neutral-100 px-lg py-md last:border-0 hover:bg-neutral-50"><div className="font-semibold text-neutral-900">{t}</div><div className="text-xs text-neutral-500">{s}</div></Link>
                ))}
              </div>
            )}
          </div>
          {outstandingJobs.length > 0 && (
            <button onClick={() => setShowOutstanding(!showOutstanding)} className="inline-flex items-center gap-xs rounded-lg border border-amber-300 bg-amber-50 px-md py-sm text-sm font-semibold text-amber-900 hover:bg-amber-100">
              <LineIcon glyph="⚠️" /> {outstandingJobs.length} repair{outstandingJobs.length === 1 ? '' : 's'} to book
            </button>
          )}
          <div className="ml-auto flex items-center gap-xs">
            <button onClick={() => move(-1)} aria-label="Previous week" className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50">←</button>
            {!isThisWeek && <button onClick={() => setWeekStart(mondayOf(new Date()))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50">This week</button>}
            <span className="min-w-[13rem] text-center text-sm font-semibold text-neutral-900">{weekLabel}</span>
            <button onClick={() => move(1)} aria-label="Next week" className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50">→</button>
          </div>
        </div>

        {/* filters = legend */}
        <div className="mb-lg flex flex-wrap gap-xs">
          {(Object.keys(KIND) as Kind[]).map(k => {
            const n = entries.filter(e => e.kind === k).length, off = hidden.has(k)
            return (
              <button key={k} type="button" aria-pressed={!off} onClick={() => { const s = new Set(hidden); off ? s.delete(k) : s.add(k); setHidden(s) }}
                className={`inline-flex items-center gap-xs rounded-full border px-md py-xs text-xs font-semibold transition ${off ? 'border-neutral-300 bg-white text-neutral-400' : 'border-transparent'}`}
                style={off ? undefined : { background: KIND[k].tint, color: KIND[k].ink }}>
                <span className="h-2 w-2 rounded-full" style={{ background: off ? '#C9C6BE' : KIND[k].bar }} />{KIND[k].label}s <span className="tabular-nums opacity-70">{n}</span>
              </button>
            )
          })}
        </div>

        {showOutstanding && outstandingJobs.length > 0 && (
          <div className="mb-lg overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <p className="border-b border-neutral-100 px-md py-sm text-sm font-bold text-neutral-900">Approved repairs waiting for a date</p>
            <div className="max-h-64 divide-y divide-neutral-100 overflow-y-auto">
              {outstandingJobs.map((job: any) => (
                <div key={job.id} className="flex items-center gap-md px-md py-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/maintenance?ticket=${job.id}`} className="block truncate text-sm font-semibold text-neutral-900 hover:underline">{job.title}</Link>
                    <p className="truncate text-xs text-neutral-500">{firstLine(job.property?.name)}{job.room ? `, ${job.room.name}` : ''}{whoName(job.contractor) ? ` · ${whoName(job.contractor)}` : ''}</p>
                  </div>
                  <Link href={`/admin/agency-diary/book-maintenance?job=${job.id}`} className="shrink-0 rounded-md bg-neutral-900 px-sm py-xs text-xs font-semibold text-white">Book</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* today */}
        {isThisWeek && (
          <section className="mb-lg overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <header className="flex items-baseline justify-between border-b border-neutral-100 px-md py-sm">
              <h2 className="text-base font-bold text-neutral-900">Today <span className="font-normal text-neutral-500">· {longDate(today).replace(/ \d{4}$/, '')}</span></h2>
              <span className="text-xs text-neutral-500">{todays.length ? `${todays.length} booked` : ''}</span>
            </header>
            {todays.length ? <div className="divide-y divide-neutral-100">{todays.map(e => <Row key={e.key} e={e} />)}</div>
              : <p className="px-md py-md text-sm text-neutral-500">Nothing booked today.</p>}
          </section>
        )}

        {/* the week */}
        <section className="hidden overflow-hidden rounded-xl border border-neutral-200 bg-white md:block">
          <div className="grid border-b border-neutral-200" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
            <div />
            {days.map(d => {
              const s = ymd(d), isToday = s === today, weekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div key={s} className={`border-l border-neutral-200 px-sm py-sm text-center ${weekend ? 'bg-[#F4F2EC]' : ''}`}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? 'text-[#B5361F]' : 'text-neutral-500'}`}>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                  <div className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums ${isToday ? 'bg-[#B5361F] text-white' : 'text-neutral-900'}`}>{d.getDate()}</div>
                </div>
              )
            })}
          </div>
          {/* entries with no time */}
          {shown.some(e => e.start == null) && (
            <div className="grid border-b border-neutral-200 bg-[#FAF9F6]" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
              <div className="px-xs py-xs text-right text-[10px] uppercase tracking-wide text-neutral-400">Any time</div>
              {days.map(d => (
                <div key={ymd(d)} className="space-y-0.5 border-l border-neutral-200 p-0.5">
                  {shown.filter(e => e.date === ymd(d) && e.start == null).map(e => (
                    <button key={e.key} type="button" onClick={() => setOpen(e)} className="block w-full truncate rounded px-xs py-0.5 text-left text-[11px] font-semibold" style={{ background: KIND[e.kind].tint, color: KIND[e.kind].ink, borderLeft: `3px solid ${KIND[e.kind].bar}` }}>{e.title} · {e.place}</button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="relative grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
            {/* hour labels + white / off-white bands */}
            <div>
              {hours.map(h => <div key={h} style={{ height: HOUR }} className="relative pr-xs text-right"><span className="relative -top-2 bg-white px-0.5 text-[11px] tabular-nums text-neutral-400">{h === firstHour ? '' : nice(h * 60)}</span></div>)}
            </div>
            {days.map(d => {
              const s = ymd(d), isToday = s === today, weekend = d.getDay() === 0 || d.getDay() === 6
              const list = shown.filter(e => e.date === s && e.start != null)
              // side by side when they overlap
              const lanes: Entry[][] = []
              const laneOf = new Map<string, number>()
              for (const e of list) {
                let i = lanes.findIndex(l => (l[l.length - 1].end ?? 0) <= e.start!)
                if (i < 0) { lanes.push([]); i = lanes.length - 1 }
                lanes[i].push(e); laneOf.set(e.key, i)
              }
              const width = 100 / Math.max(1, lanes.length)
              return (
                <div key={s} className="relative border-l border-neutral-200">
                  {/* two tones, the usual way: working hours (9–6, Mon–Fri) white, the rest off-white; dotted half hours */}
                  {hours.map((h, i) => <div key={h} style={{ height: HOUR, background: `linear-gradient(to bottom, transparent calc(50% - 0.5px), #F2F0EB calc(50% - 0.5px), #F2F0EB calc(50% + 0.5px), transparent calc(50% + 0.5px)) ${weekend || h < 9 || h >= 18 ? '#F6F4EF' : '#FFFFFF'}` }} className={i ? 'border-t border-neutral-200' : ''} />)}
                  {isToday && nowMin >= firstHour * 60 && nowMin <= lastHour * 60 && (
                    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: ((nowMin - firstHour * 60) / 60) * HOUR }}>
                      <div className="relative h-[2px] bg-[#B5361F]"><span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-[#B5361F]" /></div>
                    </div>
                  )}
                  {list.map(e => {
                    const top = ((e.start! - firstHour * 60) / 60) * HOUR
                    const h = Math.max(34, (((e.end ?? e.start! + 30) - e.start!) / 60) * HOUR - 2)
                    const lane = laneOf.get(e.key)!
                    const k = KIND[e.kind]
                    return (
                      <button key={e.key} type="button" onClick={() => setOpen(e)} title={`${e.title} — ${e.place}`}
                        className="absolute overflow-hidden rounded-md px-xs py-0.5 text-left text-[11px] leading-tight shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:z-20 hover:shadow-md focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900"
                        style={{ top: top + 1, height: h, left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)`, background: k.tint, color: k.ink, borderLeft: `3px solid ${k.bar}` }}>
                        <span className="block font-semibold tabular-nums">{nice(e.start!)}</span>
                        <span className="block truncate font-semibold">{e.title}</span>
                        {h > 44 && <span className="block truncate opacity-80">{e.place}</span>}
                        {h > 60 && <span className="block truncate opacity-70">{e.who}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </section>

        {/* the week, day by day (and the whole diary on a phone) */}
        <section className="mt-lg overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <header className="border-b border-neutral-100 px-md py-sm"><h2 className="text-base font-bold text-neutral-900">This week, day by day</h2></header>
          {days.map((d, i) => {
            const s = ymd(d), list = shown.filter(e => e.date === s)
            return (
              <div key={s} className={i % 2 ? 'bg-[#FBFAF7]' : 'bg-white'}>
                <p className={`px-md pb-xs pt-sm text-xs font-bold uppercase tracking-wider ${s === today ? 'text-[#B5361F]' : 'text-neutral-500'}`}>{d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}{s === today ? ' · today' : ''}</p>
                {list.length ? <div className="divide-y divide-neutral-100 pb-xs">{list.map(e => <Row key={e.key} e={e} />)}</div>
                  : <p className="px-md pb-sm text-sm text-neutral-400">Nothing booked</p>}
              </div>
            )
          })}
        </section>
      </main>

      <SidePanel open={!!open} onClose={() => setOpen(null)} eyebrow={open ? `${KIND[open.kind].label} · ${longDate(open.date)}` : ''} title={open?.title ?? ''}
        footer={open && (
          <div className="flex flex-wrap gap-sm">
            {open.kind === 'repair' && isAdmin && <Link href={`/admin/maintenance?ticket=${open.id}`} className="rounded-full bg-[#F3F0E6] px-md py-sm text-sm font-semibold text-[#23261A]">Open the job</Link>}
            {open.kind === 'clean' && <button type="button" onClick={() => setCleanOpen(open.raw)} className="rounded-full border border-[#F3F0E6]/40 px-md py-sm text-sm font-semibold">Cancel this clean</button>}
            {open.kind === 'viewing' && <Link href="/admin/lettings" className="rounded-full bg-[#F3F0E6] px-md py-sm text-sm font-semibold text-[#23261A]">Open Lettings</Link>}
            {open.kind === 'appointment' && <Link href="/admin/appointments" className="rounded-full bg-[#F3F0E6] px-md py-sm text-sm font-semibold text-[#23261A]">Move it in the week view</Link>}
            {open.propertyId && <Link href={`/admin/properties/${open.propertyId}`} className="rounded-full border border-[#F3F0E6]/40 px-md py-sm text-sm font-semibold">Open the house</Link>}
          </div>
        )}>
        {open && (
          <div className="space-y-md text-sm">
            <div className="rounded-xl bg-[#F3F0E6]/10 p-md">
              <p className="text-lg font-semibold">{open.timeLabel}</p>
              <p className="opacity-80">{open.place}{open.room ? `, ${open.room}` : ''}</p>
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-md gap-y-xs">
              {open.facts.filter(([, v]) => v).map(([k, v]) => (<Fragment key={k}><dt className="opacity-60">{k}</dt><dd className="break-words">{/^(\+?\d[\d\s]{8,})$/.test(v) ? <a href={`tel:${v.replace(/\s/g, '')}`} className="underline">{v}</a> : /@/.test(v) ? <a href={`mailto:${v}`} className="underline">{v}</a> : v}</dd></Fragment>))}
            </dl>
            <div>
              <p className="mb-xs text-[11px] font-bold uppercase tracking-wider opacity-60">{open.kind === 'repair' ? 'The job' : 'Notes'}</p>
              <p className="whitespace-pre-wrap leading-relaxed">{open.detail || <span className="opacity-60">{open.kind === 'repair' ? 'No description on the job.' : 'No notes.'}</span>}</p>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  )
}

/** Cancel a clean from the diary (12 Nov 2026): reason kept; the cleaner is texted, the tenants get the usual
 *  "clean cancelled" message (/api/cleans/<id>/cancel). */
function CancelClean({ clean, onClose, onDone }: { clean: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [tellCleaner, setTellCleaner] = useState(true)
  const [tellTenants, setTellTenants] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const when = clean.clean_date ? new Date(`${clean.clean_date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : ''
  async function go() {
    setBusy(true); setErr('')
    const r = await fetch(`/api/cleans/${clean.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, tellCleaner, tellTenants }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || 'Couldn’t cancel it'); return }
    onDone()
  }
  return (
    <div className="fixed inset-0 z-[170] flex items-end justify-center bg-black/60 p-lg sm:items-center" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-lg text-neutral-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Cleaning — {firstLine(clean.property?.name)}</h2>
        <p className="text-sm text-neutral-600">{when}{clean.clean_time ? ` · ${String(clean.clean_time).slice(0, 5)}` : ''}</p>
        <p className="mt-md text-xs font-bold uppercase tracking-wide text-neutral-500">Cancel this clean — why? (kept on the record)</p>
        <div className="mt-xs flex flex-wrap gap-xs">{['Cleaner unavailable', 'House empty', 'Moved to another day', 'Not needed this week'].map(r => <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full border px-sm py-0.5 text-xs ${reason === r ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700'}`}>{r}</button>)}</div>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Or write the reason" className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
        {clean.cleaner_id && <label className="mt-sm flex items-center gap-sm text-sm"><input type="checkbox" checked={tellCleaner} onChange={e => setTellCleaner(e.target.checked)} /> Text the cleaner it’s off</label>}
        <label className="mt-xs flex items-center gap-sm text-sm"><input type="checkbox" checked={tellTenants} onChange={e => setTellTenants(e.target.checked)} /> Tell the tenants</label>
        {err && <p className="mt-sm text-sm text-red-700">{err}</p>}
        <div className="mt-md flex gap-sm">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-neutral-300 py-sm text-sm font-semibold">Keep it</button>
          <button type="button" onClick={go} disabled={busy || reason.trim().length < 3} className="flex-1 rounded-xl bg-red-700 py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Cancelling…' : 'Cancel the clean'}</button>
        </div>
      </div>
    </div>
  )
}

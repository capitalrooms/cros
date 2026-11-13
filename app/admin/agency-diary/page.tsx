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
import { TimeGrid, DayList, AgendaRow, WeekNav, type CalEntry } from '@/components/calendar/Calendar'
import { TONES, ymd, todayYmd, niceTime as nice, parseTime, mondayOf } from '@/components/calendar/look'

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

const KIND: Record<Kind, { label: string; bar: string; tint: string; ink: string }> = {
  repair: TONES.repair, clean: TONES.clean, viewing: TONES.viewing, appointment: TONES.appointment,
}

const APPT_TYPES: Record<string, string> = {
  landlord: 'Landlord visit', lettings: 'Lettings', contractor: 'Contractor', cleaner: 'Cleaner', delivery: 'Delivery',
  inspection: 'Inspection', gas_safety: 'Gas safety check', electrical: 'Electrical check', fire_door: 'Fire door check',
  smoke_alarm: 'Smoke alarm check', management_visit: 'Management visit', viewing: 'Viewing', other: 'Appointment',
}

// contractor/cleaner rows carry first/last (and older full_name) — never .name
const whoName = (p: any) => ([p?.salutation, p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || '')
const firstLine = (s: string | null | undefined) => String(s ?? '').split(/\n|,/)[0].replace(/\s+[-–—]\s+.*$/, '').trim()
const longDate = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const words = (s: string | null | undefined) => String(s ?? '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())



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
  const [isAdmin, setIsAdmin] = useState(false)   // repairs open in Maintenance, which lettings can't see


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


  // the shared calendar's entries — every one opens the panel
  const cal = (e: Entry): CalEntry => ({ key: e.key, date: e.date, start: e.start, end: e.end, title: e.title, line2: [e.place, e.room].filter(Boolean).join(', '), line3: `${KIND[e.kind].label} · ${e.who}`, tone: e.kind, onClick: () => setOpen(e) })
  const calShown = shown.map(cal)

  if (loading) return <GenericPageSkeleton />

  const isThisWeek = ymd(weekStart) === ymd(mondayOf(new Date()))

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
          <div className="ml-auto"><WeekNav monday={weekStart} onChange={setWeekStart} /></div>
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
            {todays.length ? <div>{todays.map(e => <AgendaRow key={e.key} e={cal(e)} />)}</div>
              : <p className="px-md py-md text-sm text-neutral-500">Nothing booked today.</p>}
          </section>
        )}

        {/* the week — the one calendar used across CROS (components/calendar) */}
        <div className="hidden md:block"><TimeGrid days={days} entries={calShown} /></div>

        {/* the week, day by day (and the whole diary on a phone) */}
        <div className="mt-lg"><DayList days={days} entries={calShown} title="This week, day by day" /></div>
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

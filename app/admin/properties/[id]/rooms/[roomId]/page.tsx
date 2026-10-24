'use client'

// The room page (option D — Harry, 24 Oct 2026: "go with D, build it"). One page per room, reached by tapping the room
// in All Units: Needs you (worked out from the records, most urgent first), the current tenancy, rent, one timeline of
// messages and activity with a box to write from, the re-let plan, the room itself, repairs and spend, safety, and the
// expired tenancies. A strip across the top steps through the other rooms in the house. Wording: Current tenancy /
// Expired tenancies, dates in full, names with titles. The old room page lives on at …/edit for photos, details,
// advert text, notes and checks. Data: GET /api/admin/rooms/[roomId] (lib/rooms/roomOverview).
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { StoredImg } from '@/components/StoredImg'
import { adminFetch } from '@/lib/adminFetch'
import type { RoomOverview, Need, TimelineItem } from '@/lib/rooms/roomOverview'

const gbp = (n: number | null | undefined) => n == null ? '—' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const full = (iso: string | null | undefined) => iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const dayHead = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
const monthName = (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const initials = (name: string) => name.replace(/^(Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Rev)\.?\s+/i, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const yearsMonths = (n: number) => { const y = Math.floor(n / 365), m = Math.floor((n % 365) / 30.44); return [y ? `${y} year${y === 1 ? '' : 's'}` : '', m ? `${m} month${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || `${n} days` }

const DOT: Record<string, string> = { let: 'bg-green-400', notice: 'bg-amber-400', changeover: 'bg-blue-400', let_agreed: 'bg-blue-400', void: 'bg-red-400' }
const LEVEL: Record<Need['level'], { bar: string; text: string; label: string }> = {
  urgent: { bar: 'bg-red-600', text: 'text-red-800', label: 'urgent' },
  week: { bar: 'bg-amber-500', text: 'text-amber-800', label: 'this week' },
  tidy: { bar: 'bg-neutral-400', text: 'text-neutral-600', label: 'tidy-ups' },
}
const STAGE_PILL: Record<string, { cls: string; label: (o: RoomOverview) => string }> = {
  on_notice: { cls: 'bg-amber-100 text-amber-900', label: o => `Notice received · tenancy ends ${full(o.current?.end)}` },
  live: { cls: 'bg-green-100 text-green-900', label: () => 'Current tenancy' },
  let_agreed: { cls: 'bg-blue-100 text-blue-900', label: o => `Let agreed · tenancy starts ${full(o.incoming?.start)}` },
  void: { cls: 'bg-red-100 text-red-900', label: o => o.voids.at(-1) && !o.voids.at(-1)!.to ? `Void since ${full(o.voids.at(-1)!.from)}` : 'Void' },
  ended: { cls: 'bg-neutral-200 text-neutral-800', label: () => 'Tenancy ended' },
}
const APPLICANT_STEPS = ['invited', 'applied', 'offer_sent', 'referencing', 'referencing_passed', 'docs_uploaded']
const KIND_ICON: Record<TimelineItem['kind'], string> = { email: '✉', sms: '💬', app: '🔔', event: '•', note: '✎', money: '£', repair: '🔧', viewing: '👁', offer: '✉', feedback: '★' }
const btnDark = 'inline-flex min-h-[40px] items-center justify-center rounded-lg bg-neutral-900 px-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'
const btnLight = 'inline-flex min-h-[40px] items-center justify-center rounded-lg border border-neutral-300 bg-white px-md text-sm font-bold text-neutral-900 hover:bg-neutral-50'
const card = 'rounded-2xl border border-neutral-200 bg-white'

export default function RoomPage({ params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id: propertyId, roomId } = use(params)
  const [o, setO] = useState<RoomOverview | null>(null)
  const [error, setError] = useState('')
  const [wide, setWide] = useState(true)
  const composeRef = useRef<HTMLTextAreaElement>(null!)

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/admin/rooms/${roomId}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not open this room'); return }
    setO(d); setError('')
  }, [roomId])
  useEffect(() => { setO(null); load() }, [load])
  useEffect(() => { const m = window.matchMedia('(min-width: 768px)'); const on = () => setWide(m.matches); on(); m.addEventListener('change', on); return () => m.removeEventListener('change', on) }, [])

  const message = () => { const el = document.getElementById('messages'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (el instanceof HTMLDetailsElement) el.open = true; setTimeout(() => composeRef.current?.focus(), 400) }

  if (error) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/active-rooms" />} />
      <div className="mx-auto max-w-6xl px-lg py-xl"><p className="rounded-xl bg-red-50 p-md text-sm font-semibold text-red-800">{error}</p></div>
    </div>
  )
  if (!o) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/active-rooms" />} />
      <div className="h-64 animate-pulse bg-[#181614]" />
      <div className="mx-auto max-w-6xl space-y-md px-lg py-xl">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white" />)}</div>
    </div>
  )

  const cur = o.current
  const pill = STAGE_PILL[o.stage] ?? STAGE_PILL.live
  const photo = o.room.photos[0]?.src ?? null
  const reletDue = !!(cur?.end && !o.incoming) || o.stage === 'void'
  const facts = [o.room.unitCode, o.room.type, o.room.ensuite ? 'en suite' : o.room.sharedBathroom === false ? '' : 'shared bathroom', o.property.furnished, o.property.bills ? 'bills included' : ''].filter(Boolean).join(' · ')

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/active-rooms" />} />

      {/* ── hero ─────────────────────────────────────────────────────────────────────────────── */}
      <section className="bg-[#181614] text-[#F6F3EC]">
        <div className="mx-auto max-w-6xl px-lg pt-lg">
          <div className="flex flex-wrap items-end justify-between gap-md">
            <div className="flex min-w-0 flex-[1_1_420px] items-center gap-md md:items-end">
              <StoredImg src={photo} alt={`${o.room.name} photo`} className="h-16 w-16 flex-none rounded-xl object-cover md:h-[90px] md:w-[120px]" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F6F3EC]/55">{facts}</p>
                <div className="flex flex-wrap items-center gap-sm">
                  <h1 className="text-[28px] font-extrabold leading-none md:text-[34px]" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{o.room.name}</h1>
                  <span className={`rounded-full px-sm py-0.5 text-[11px] font-black uppercase tracking-wide ${pill.cls}`}>{pill.label(o)}</span>
                </div>
                {cur && <p className="mt-0.5 text-sm text-[#F6F3EC]/80">Current tenancy: <b className="text-[#F6F3EC]">{cur.tenant.name}</b> · {full(cur.start)} – {cur.end ? full(cur.end) : 'periodic, no end date'}</p>}
                {!cur && o.incoming && <p className="mt-0.5 text-sm text-[#F6F3EC]/80">Incoming tenancy: <b className="text-[#F6F3EC]">{o.incoming.tenant}</b> · tenancy start date {full(o.incoming.start)}</p>}
                <p className="mt-0.5 text-[13px] text-[#F6F3EC]/65">
                  <Link href={`/admin/properties/${propertyId}`} className="font-bold text-[#F6F3EC] underline-offset-2 hover:underline">{o.property.name}</Link>
                  {o.property.type === 'hmo' && ` · HMO, ${o.property.roomCount} rooms`}
                  {o.landlord && <> · Landlord: <Link href={`/admin/landlord/${o.landlord.id}`} className="hover:underline">{o.landlord.name}{o.landlord.company ? `, ${o.landlord.company}` : ''}</Link></>}
                  {o.fee.label && ` · ${o.fee.label}`}
                </p>
              </div>
            </div>
            <div className="hidden flex-wrap gap-sm md:flex">
              {cur && <button type="button" onClick={message} className="rounded-lg bg-[#F6F3EC] px-md py-sm text-sm font-black text-[#181614]">Message {cur.tenant.name}</button>}
              <Link href="/admin/maintenance/new" className="rounded-lg border border-[#F6F3EC]/25 px-md py-sm text-sm font-bold">Report a job</Link>
              <Link href={`/lettings/listing/${roomId}?from=${encodeURIComponent(`/admin/properties/${propertyId}/rooms/${roomId}`)}`} className="rounded-lg border border-[#F6F3EC]/25 px-md py-sm text-sm font-bold">Marketing view</Link>
              <Link href={`/admin/properties/${propertyId}/rooms/${roomId}/edit`} className="rounded-lg border border-[#F6F3EC]/25 px-md py-sm text-sm font-bold">Edit room</Link>
            </div>
          </div>

          <div className="mt-md grid grid-cols-2 gap-sm md:grid-cols-4">
            <Stat value={gbp(cur?.rent ?? o.incoming?.rent ?? o.room.askingRent)} label={cur ? `Rent per month · due on the ${ordinal(cur.dueDay)}` : 'Asking rent per month'} />
            {cur?.balance != null && cur.balance > 0.004
              ? <Stat value={gbp(cur.balance)} label="Owed on the rent account" tone="text-red-300" />
              : <Stat value={cur ? gbp(0) : '—'} label={cur ? 'Owed on the rent account' : 'No current tenancy'} />}
            <Stat value={o.occupancy ? `${o.occupancy.pct}%` : '—'} label={o.occupancy ? `Let since ${full(o.occupancy.since)} · ${o.occupancy.voidDays} void days` : 'No tenancies yet'} />
            <Stat value={gbp(o.spend)} label={`Spent on this room · ${o.repairs.filter(r => !['completed', 'cancelled'].includes(r.status)).length} repair${o.repairs.filter(r => !['completed', 'cancelled'].includes(r.status)).length === 1 ? '' : 's'} open`} />
          </div>

          <nav aria-label={`Rooms at ${o.property.name}`} className="-mx-lg mt-md flex gap-0.5 overflow-x-auto px-lg" style={{ scrollbarWidth: 'none' }}>
            {o.strip.map(r => {
              const on = r.id === roomId
              return (
                <Link key={r.id} href={`/admin/properties/${propertyId}/rooms/${r.id}`} aria-current={on ? 'page' : undefined}
                  className={`flex min-w-[148px] flex-none flex-col gap-0.5 rounded-t-xl px-md py-sm text-left ${on ? 'bg-neutral-100 text-neutral-900' : 'text-[#F6F3EC]/75 hover:text-[#F6F3EC]'}`}>
                  <span className="flex items-center gap-xs text-[13px] font-black"><span className={`h-2 w-2 rounded-full ${DOT[r.state] ?? 'bg-neutral-400'}`} />{r.name}{r.rent ? ` · ${gbp(r.rent)}` : ''}</span>
                  <span className="truncate text-xs">{r.tenant ?? 'No tenancy'}</span>
                  <span className={`truncate text-[11px] ${on ? 'text-neutral-500' : 'text-[#F6F3EC]/50'}`}>{r.line}</span>
                </Link>
              )
            })}
            <Link href={`/admin/properties/${propertyId}`} className="flex min-w-[148px] flex-none flex-col gap-0.5 rounded-t-xl border-l border-[#F6F3EC]/15 px-md py-sm text-[#F6F3EC]/75 hover:text-[#F6F3EC]">
              <span className="text-[13px] font-black">The house</span><span className="text-xs">Shared areas, certificates</span><span className="text-[11px] text-[#F6F3EC]/50">{o.property.roomCount} rooms</span>
            </Link>
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-lg px-lg py-xl pb-[120px] md:pb-xl">
        <NeedsYou needs={o.needs} today={o.today} reload={load} />

        <div className="flex flex-wrap items-start gap-lg">
          <div className="min-w-0 flex-[999_1_560px] space-y-lg">
            {cur ? <CurrentTenancy o={o} wide={wide} onMessage={message} /> : (
              <Section title="Current tenancy" summary="No current tenancy" wide={wide} open>
                <p className="text-sm text-neutral-600">{o.incoming ? <>Incoming tenancy: <b>{o.incoming.tenant}</b>, tenancy start date {full(o.incoming.start)}. <Link className="font-bold underline" href={`/admin/lettings/${o.incoming.id}`}>Letting file</Link></> : 'Nobody has a tenancy of this room today.'}</p>
              </Section>
            )}
            <Rent o={o} wide={wide} />
            <Messages o={o} wide={wide} composeRef={composeRef} roomId={roomId} reload={load} />
          </div>
          <div className="min-w-0 flex-[1_1_340px] space-y-lg">
            {(reletDue || o.incoming || o.applicants.length > 0) && <Relet o={o} wide={wide} />}
            <TheRoom o={o} wide={wide} propertyId={propertyId} />
            <Repairs o={o} wide={wide} />
            <Safety o={o} wide={wide} propertyId={propertyId} />
          </div>
        </div>

        <Expired o={o} wide={wide} />
      </div>

      {/* phone: the two things you most often do here, above the tab bar */}
      <div className="sticky bottom-0 z-30 grid grid-cols-[1fr_1fr_auto] gap-sm border-t border-neutral-200 bg-neutral-100/95 px-md py-sm backdrop-blur md:hidden">
        {cur && <button type="button" onClick={message} className={`${btnDark} col-span-3`}>Message {cur.tenant.name}</button>}
        <Link href="/admin/maintenance/new" className={`${btnLight} col-span-2`}>Report a job</Link>
        <Link href={`/admin/properties/${propertyId}/rooms/${roomId}/edit`} className={btnLight} aria-label="Edit room">Edit</Link>
      </div>
    </div>
  )
}

function ordinal(n: number) { return n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th') }

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="rounded-2xl px-md py-sm" style={{ backgroundColor: 'rgba(246,243,236,0.07)' }}>
      <p className={`text-xl font-bold tabular-nums md:text-2xl ${tone ?? ''}`} style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{value}</p>
      <p className="text-[11px] uppercase tracking-[0.06em] text-[#F6F3EC]/55">{label}</p>
    </div>
  )
}

/** A section: always open on a computer; on a phone it folds, with a one-line summary when closed. */
function Section({ id, title, summary, wide, open, children, tone = 'border-neutral-200', right }: { id?: string; title: string; summary?: React.ReactNode; wide: boolean; open?: boolean; children: React.ReactNode; tone?: string; right?: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(!!open)
  useEffect(() => { if (wide) setIsOpen(true) }, [wide])
  return (
    <details id={id} open={wide || isOpen} onToggle={e => { if (!wide) setIsOpen((e.target as HTMLDetailsElement).open) }} className={`overflow-hidden rounded-2xl border bg-white ${tone}`}>
      <summary className={`flex list-none items-center gap-sm px-lg py-md [&::-webkit-details-marker]:hidden ${wide ? 'pointer-events-none' : 'cursor-pointer'}`}>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-black text-neutral-900">{title}</span>
          {summary && (!isOpen || wide) && <span className="block text-xs text-neutral-500">{summary}</span>}
        </span>
        {wide && right ? <span className="pointer-events-auto">{right}</span> : null}
        {!wide && <span aria-hidden className={`text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>}
      </summary>
      <div className="border-t border-neutral-100">{children}</div>
    </details>
  )
}

function NeedsYou({ needs, today, reload }: { needs: Need[]; today: string; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const counts = (['urgent', 'week', 'tidy'] as const).map(l => [l, needs.filter(n => n.level === l).length] as const).filter(([, n]) => n > 0)
  async function run(n: Need) {
    if (n.op !== 'apply_move_in_rent' || !n.opTenancyId) return
    if (!confirm(`${n.title}\n\n${n.detail}\n\nMark this rent as paid from the move-in monies? It’s logged in the payment audit.`)) return
    setBusy(n.key); setMsg('')
    const r = await adminFetch(`/api/admin/lettings/${n.opTenancyId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply_move_in_rent' }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setMsg(d.error ?? 'Not marked paid'); return }
    setMsg(d.paid?.length ? `Marked paid: ${d.paid.map((p: any) => `${monthName(p.month)} ${gbp(p.amount)}`).join(', ')}` : d.note || 'Nothing to mark')
    await reload()
  }
  return (
    <section aria-labelledby="needs" className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-md gap-y-xs border-b border-neutral-100 bg-neutral-50 px-lg py-md">
        <div className="flex flex-wrap items-baseline gap-sm">
          <h2 id="needs" className="text-xl font-extrabold" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>Needs you · {needs.length}</h2>
          <span className="text-xs text-neutral-500">From this room’s records as at {full(today)}, most urgent first. Each clears itself once done.</span>
        </div>
        {counts.length > 0 && <span className="flex gap-md text-xs font-bold">{counts.map(([l, n]) => <span key={l} className={`inline-flex items-center gap-xs ${LEVEL[l].text}`}><span className={`h-2 w-2 rounded-full ${LEVEL[l].bar}`} />{n} {LEVEL[l].label}</span>)}</span>}
      </div>
      {msg && <p className="border-b border-neutral-100 bg-green-50 px-lg py-sm text-sm font-semibold text-green-800">{msg}</p>}
      {needs.length === 0 ? <p className="px-lg py-md text-sm text-neutral-500">Nothing needs doing on this room.</p> : (
        <ol>
          {needs.map(n => (
            <li key={n.key} className="flex items-stretch gap-md border-b border-neutral-100 pr-lg last:border-b-0">
              <span className={`w-1 flex-none rounded-r ${LEVEL[n.level].bar}`} />
              {/* phone: category over the title, two lines of detail, deadline and a small button; computer: columns */}
              <div className="flex min-w-0 flex-1 items-center gap-x-lg py-sm sm:flex-wrap sm:gap-y-xs sm:py-md">
                <span className="hidden w-[120px] flex-none text-[10.5px] font-black uppercase tracking-[0.08em] text-neutral-500 sm:block">{n.category}</span>
                <span className="min-w-0 flex-1 sm:flex-[1_1_300px]">
                  <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-neutral-400 sm:hidden">{n.category}</span>
                  <b className="block text-[14px] leading-tight text-neutral-900 sm:text-[14.5px]">{n.title}</b>
                  <span className="line-clamp-2 text-[12.5px] leading-snug text-neutral-600 sm:line-clamp-none sm:text-[13px]">{n.detail}</span>
                  <span className={`mt-0.5 block text-[11.5px] font-bold sm:hidden ${LEVEL[n.level].text}`}>{n.due}</span>
                </span>
                <span className={`hidden w-[170px] flex-none text-xs font-bold sm:block ${LEVEL[n.level].text}`}>{n.due}</span>
                {n.op
                  ? <button type="button" disabled={busy === n.key} onClick={() => run(n)} className={`${btnDark} max-w-[124px] flex-none px-sm text-center text-xs leading-tight sm:w-[190px] sm:max-w-none sm:px-md sm:text-sm`}>{busy === n.key ? 'Working…' : n.action}</button>
                  : n.href?.startsWith('#')
                    ? <a href={n.href} className={`${n.level === 'urgent' ? btnDark : btnLight} max-w-[124px] flex-none px-sm text-center text-xs leading-tight sm:w-[190px] sm:max-w-none sm:px-md sm:text-sm`}>{n.action}</a>
                    : <Link href={n.href ?? '#'} className={`${n.level === 'urgent' ? btnDark : btnLight} max-w-[124px] flex-none px-sm text-center text-xs leading-tight sm:w-[190px] sm:max-w-none sm:px-md sm:text-sm`}>{n.action}</Link>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function CurrentTenancy({ o, wide, onMessage }: { o: RoomOverview; wide: boolean; onMessage: () => void }) {
  const c = o.current!
  const holdOver = c.hold && c.rent ? Math.round((c.hold.amount - Math.floor(c.rent * 12 / 52 * 100) / 100) * 100) / 100 : 0
  const steps = c.steps.filter(s => s.id !== 'offer' && s.id !== 'move_in')
  const row = (label: string, value: React.ReactNode, tone = '') => <><dt className="text-neutral-500">{label}</dt><dd className={tone}>{value}</dd></>
  return (
    <Section title="Current tenancy" wide={wide} open summary={`${c.tenant.name} · ${full(c.start)} – ${c.end ? full(c.end) : 'periodic'}`}>
      <div className="flex flex-wrap items-center justify-between gap-md border-b border-neutral-100 px-lg py-md">
        <div className="flex min-w-0 items-center gap-md">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-amber-100 font-black text-amber-900">{initials(c.tenant.name)}</span>
          <div className="min-w-0">
            <p className="text-lg font-black text-neutral-900">{c.tenant.name}</p>
            <p className="text-[13px] text-neutral-500">{c.jointTenant ? `Joint tenancy with ${c.jointTenant.name}` : 'Sole tenant'}{c.tenant.occupation ? ` · ${c.tenant.occupation}` : ''}</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-sm sm:flex sm:w-auto">
          <button type="button" onClick={onMessage} className={btnDark}>Message</button>
          {c.tenant.phone ? <a href={`tel:${c.tenant.phone.replace(/\s+/g, '')}`} className={btnLight}>Call</a> : <span className={`${btnLight} opacity-40`}>No mobile</span>}
          <Link href={`/admin/lettings/${c.id}?from=${encodeURIComponent(`/admin/properties/${o.property.id}/rooms/${o.room.id}`)}`} className={btnLight}>Letting file</Link>
          {/* notice is recorded (or changed) in the letting file — the list rows no longer carry the button */}
          <Link href={`/admin/lettings/${c.id}?tab=notice${c.notice ? '' : '&mark=1'}`} className={`${btnLight} col-span-3 sm:col-span-1`}>{c.notice ? 'Notice' : 'Record notice'}</Link>
        </div>
      </div>
      <div className="grid gap-x-xl gap-y-sm px-lg py-md md:grid-cols-2">
        <dl className="grid grid-cols-[150px_1fr] gap-y-sm text-sm">
          {row('Tenancy start date', full(c.start), 'font-bold')}
          {row('Notice received', c.notice ? full(c.notice) : 'None')}
          {row('Tenancy end date', c.end ? <>{full(c.end)} <span className="font-normal text-neutral-500">({Math.round((Date.parse(c.end) - Date.parse(c.start)) / 86_400_000) + 1} days)</span></> : 'Periodic — no end date', 'font-bold')}
          {row('Agreement', [c.agreementType === 'assured_periodic' ? 'Assured periodic' : c.agreementType, c.agreementSigned ? `signed ${full(c.agreementSigned)}` : 'not signed'].filter(Boolean).join(' · '))}
          {row('Rent', c.rent ? `${gbp(c.rent)} per month, due on the ${ordinal(c.dueDay)}` : '—')}
          {row('Payment reference', c.paymentRef ?? 'None', 'tabular-nums')}
        </dl>
        <dl className="grid grid-cols-[150px_1fr] gap-y-sm text-sm">
          {row('Deposit', c.deposit ? [gbp(c.deposit), c.scheme, c.protectedAt ? `protected ${full(c.protectedAt)}` : 'not protected'].filter(Boolean).join(' · ') : 'None', c.deposit && !c.protectedAt ? 'font-bold text-red-700' : '')}
          {c.deposit > 0 && row('Prescribed info', c.prescribedAt ? `Served ${full(c.prescribedAt)}` : 'Not served', c.prescribedAt ? '' : 'font-bold text-amber-800')}
          {c.hold && row('Holding deposit', <>{c.hold.no} · {gbp(c.hold.amount)} received {full(c.hold.received)}{c.hold.outcomeOn ? ` · applied ${full(c.hold.outcomeOn)}` : ''}{holdOver > 0.004 && <span className="font-bold text-amber-800"> · {gbp(holdOver)} over the cap</span>}</>)}
          {row('Email', c.tenant.email ?? 'None')}
          {row('Mobile', c.tenant.phone ?? 'None')}
          {c.tenant.rightToRentUntil && row('Right to Rent', `Time-limited · recheck by ${full(c.tenant.rightToRentUntil)}`, 'text-amber-800')}
        </dl>
      </div>
      <div className="flex flex-wrap gap-xs px-lg pb-md">
        {steps.map(s => <span key={s.id} className={`rounded-full px-sm py-0.5 text-xs font-bold ${s.done ? 'bg-green-50 text-green-800' : 'bg-neutral-100 text-neutral-600'}`}>{s.done ? '✓' : '–'} {s.label}{s.done && s.date ? ` ${full(s.date)}` : s.done ? '' : ': no date recorded'}</span>)}
      </div>
    </Section>
  )
}

function Rent({ o, wide }: { o: RoomOverview; wide: boolean }) {
  const [all, setAll] = useState(false)
  const rows = all ? o.rent : o.rent.slice(0, 6)
  const owed = o.current?.balance
  const STATE: Record<string, [string, string]> = { paid: ['Paid', 'bg-green-50 text-green-800'], part: ['Part paid', 'bg-amber-50 text-amber-900'], overdue: ['Overdue', 'bg-red-50 text-red-800'], due: ['Not yet due', 'bg-neutral-100 text-neutral-600'], statement: ['Before CROS', 'bg-neutral-100 text-neutral-600'] }
  return (
    <Section title="Rent on this room" wide={wide} summary={owed && owed > 0.004 ? `${gbp(owed)} owed on the current tenancy` : o.fee.toLandlord != null ? `${gbp(o.fee.toLandlord)} per month to the landlord` : 'No rent recorded'}
      right={o.current ? <Link href={`/admin/lettings/${o.current.id}?tab=money`} className={btnLight}>Statement of account</Link> : null}>
      {o.rent.length === 0 ? <p className="px-lg py-md text-sm text-neutral-500">No rent charges on this room yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead><tr className="bg-neutral-50 text-left text-[10.5px] uppercase tracking-wide text-neutral-500"><th className="px-lg py-xs">Period</th><th className="px-sm py-xs">Tenant</th><th className="px-sm py-xs">Due date</th><th className="px-sm py-xs text-right">Due</th><th className="px-sm py-xs text-right">Received</th><th className="px-lg py-xs">Status</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`border-t border-neutral-100 ${r.state === 'overdue' ? 'bg-red-50/50' : ''}`}>
                  <td className="px-lg py-sm"><b>{monthName(r.month)}</b><span className="block text-[11.5px] text-neutral-500">{full(r.from)} – {full(r.to)}</span></td>
                  <td className="px-sm py-sm">{r.tenant || <span className="text-neutral-400">—</span>}</td>
                  <td className="px-sm py-sm">{full(r.dueOn)}</td>
                  <td className="px-sm py-sm text-right tabular-nums">{gbp(r.due)}</td>
                  <td className="px-sm py-sm text-right tabular-nums">{gbp(r.received)}</td>
                  <td className="px-lg py-sm"><span className={`rounded-full px-sm py-0.5 text-[11px] font-bold ${STATE[r.state]?.[1]}`}>{STATE[r.state]?.[0]}</span>{r.state === 'statement' && <span className="block text-[11px] text-neutral-500">on the landlord statement</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {o.rent.length > 6 && <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-neutral-100 py-sm text-sm font-bold text-neutral-700">{all ? 'Show fewer' : `Show all ${o.rent.length} months`}</button>}
      {o.fee.rent != null && o.fee.perMonth != null && (
        <p className="border-t border-neutral-100 px-lg py-sm text-[13px] text-neutral-600">Each full month: <b className="text-neutral-900">{gbp(o.fee.rent)}</b> rent → <b className="text-neutral-900">{gbp(o.fee.perMonth)}</b> management fee ({o.fee.label}) → <b className="text-neutral-900">{gbp(o.fee.toLandlord)}</b> to {o.landlord ? `${o.landlord.name}${o.landlord.company ? `, ${o.landlord.company}` : ''}` : 'the landlord'}</p>
      )}
      {o.voids.length > 0 && <p className="border-t border-neutral-100 px-lg py-sm text-[13px] text-amber-800">Void periods: {o.voids.map(v => `${full(v.from)} – ${v.to ? full(v.to) : 'today'} (${v.days} days, ${gbp(v.lost)} of rent)`).join(' · ')}</p>}
    </Section>
  )
}

function Messages({ o, wide, composeRef, roomId, reload }: { o: RoomOverview; wide: boolean; composeRef: React.RefObject<HTMLTextAreaElement>; roomId: string; reload: () => Promise<void> }) {
  type F = 'all' | 'current' | 'expired' | 'applicant' | 'mail' | 'office' | 'money'
  const [filter, setFilter] = useState<F>('all')
  const [shown, setShown] = useState(wide ? 15 : 5)
  const people = useMemo(() => [
    ...(o.current ? [{ id: o.current.tenant.id, name: o.current.tenant.name, email: o.current.tenant.email, phone: o.current.tenant.phone }] : []),
    ...(o.current?.jointTenant ? [{ id: o.current.jointTenant.id, name: o.current.jointTenant.name, email: o.current.jointTenant.email, phone: o.current.jointTenant.phone }] : []),
  ], [o])
  const [to, setTo] = useState(people[0]?.id ?? '')
  const [mode, setMode] = useState<'message' | 'note'>(people.length ? 'message' : 'note')
  const [ch, setCh] = useState({ email: true, sms: false, app: false })
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const who = people.find(p => p.id === to)

  const FILTERS: [F, string][] = [['all', 'All'], ['current', 'Current tenancy'], ['expired', 'Expired tenancies'], ['applicant', 'Applicants'], ['mail', 'Emails and texts'], ['office', 'Office notes'], ['money', 'Money']]
  const match = (t: TimelineItem) => filter === 'all' ? true : filter === 'mail' ? (t.kind === 'email' || t.kind === 'sms' || t.kind === 'app') : filter === 'money' ? t.kind === 'money' : filter === 'office' ? t.kind === 'note' : t.group === filter
  const items = o.timeline.filter(match)
  const visible = items.slice(0, shown)

  async function send() {
    setResult(null)
    if (mode === 'note') {
      if (!body.trim()) return
      setBusy(true)
      const r = await adminFetch(`/api/admin/rooms/${roomId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'note', content: body }) })
      const d = await r.json().catch(() => ({})); setBusy(false)
      if (!r.ok) { setResult({ ok: false, text: d.error ?? 'Not saved' }); return }
      setBody(''); setResult({ ok: true, text: 'Office note saved' }); await reload(); return
    }
    if (!who || !subject.trim() || !body.trim()) { setResult({ ok: false, text: 'Add a subject and a message' }); return }
    const how = [ch.email && 'email', ch.sms && 'text', ch.app && 'app'].filter(Boolean).join(' and ')
    if (!how) { setResult({ ok: false, text: 'Choose email, text or the app' }); return }
    if (!confirm(`Send this by ${how} to ${who.name}?\n\n${subject}\n\n${body}`)) return
    setBusy(true)
    const r = await adminFetch(`/api/admin/rooms/${roomId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message', personId: who.id, subject, body, ...ch }) })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setResult({ ok: false, text: d.error ?? 'Not sent' }); return }
    const parts = [ch.email ? (d.emailCount ? 'email sent' : 'email not sent') : '', ch.sms ? (d.smsCount ? 'text sent' : `text not sent${d.smsFailed?.length ? ` (${d.smsFailed.join(', ')})` : ''}`) : '', ch.app ? (d.pushCount ? 'app message delivered' : 'not on the app') : ''].filter(Boolean)
    setResult({ ok: true, text: `${who.name}: ${parts.join(' · ')}` }); setSubject(''); setBody(''); await reload()
  }

  return (
    <Section id="messages" title="Messages and activity" wide={wide} open summary={`${o.timeline.length} items · current tenancy, expired tenancies and applicants`}>
      <div className="space-y-sm px-lg py-md">
        <div className="overflow-hidden rounded-xl border border-neutral-300">
          <div className="flex flex-wrap items-center gap-sm border-b border-neutral-100 px-md py-sm text-xs">
            <span className="flex overflow-hidden rounded-lg border border-neutral-300">
              {people.length > 0 && <button type="button" onClick={() => setMode('message')} className={`px-sm py-1 font-bold ${mode === 'message' ? 'bg-neutral-900 text-white' : 'bg-white'}`}>Message</button>}
              <button type="button" onClick={() => setMode('note')} className={`px-sm py-1 font-bold ${mode === 'note' ? 'bg-neutral-900 text-white' : 'bg-white'}`}>Office note</button>
            </span>
            {mode === 'message' && (people.length > 1
              ? <label className="flex items-center gap-xs font-semibold text-neutral-600">To <select value={to} onChange={e => setTo(e.target.value)} className="rounded border border-neutral-300 bg-white px-xs py-0.5 text-neutral-900">{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              : <span className="font-semibold text-neutral-600">To {who?.name}</span>)}
          </div>
          {mode === 'message' && <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className="block w-full border-0 border-b border-neutral-100 px-md py-sm text-sm font-semibold outline-none" />}
          <textarea ref={composeRef} value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder={mode === 'note' ? 'A note for the office — kept on this room, never sent' : `Write to ${who?.name ?? 'the tenant'}…`} aria-label={mode === 'note' ? 'Office note' : 'Message'} className="block w-full resize-y border-0 px-md py-sm text-sm outline-none" />
          <div className="flex flex-wrap items-center justify-between gap-sm border-t border-neutral-100 bg-neutral-50 px-sm py-sm">
            {mode === 'message' ? (
              <div className="flex flex-wrap gap-xs">
                {([['email', 'Email', who?.email], ['sms', 'Text', who?.phone], ['app', 'App', true]] as const).map(([k, label, has]) => (
                  <button key={k} type="button" disabled={!has} onClick={() => setCh(c => ({ ...c, [k]: !c[k] }))} title={has ? undefined : `No ${k === 'email' ? 'email address' : 'mobile'} on file`}
                    className={`rounded-full px-sm py-1 text-xs font-bold ${ch[k] ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-700'} disabled:opacity-40`}>{label}</button>
                ))}
              </div>
            ) : <span className="text-xs text-neutral-500">Notes are only seen by the office</span>}
            <button type="button" disabled={busy} onClick={send} className={btnDark}>{busy ? 'Working…' : mode === 'note' ? 'Save note' : 'Send…'}</button>
          </div>
        </div>
        {result && <p className={`rounded-lg px-md py-sm text-sm font-semibold ${result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{result.text}</p>}
        {!o.messagesLogged && <p className="rounded-lg bg-amber-50 px-md py-sm text-xs text-amber-900">Emails and texts appear here once the message log (migration 242) has been run.</p>}
        <div role="group" aria-label="Show" className="-mx-lg flex gap-xs overflow-x-auto px-lg pb-xs" style={{ scrollbarWidth: 'none' }}>
          {FILTERS.map(([k, label]) => <button key={k} type="button" onClick={() => { setFilter(k); setShown(wide ? 15 : 5) }} className={`flex-none rounded-full px-sm py-1 text-xs font-bold ${filter === k ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-700'}`}>{label}{k === 'all' ? ` · ${o.timeline.length}` : ''}</button>)}
        </div>
      </div>
      {visible.length === 0 ? <p className="px-lg pb-md text-sm text-neutral-500">Nothing here yet.</p> : (
        <ol className="px-lg pb-sm">
          {visible.map((t, i) => {
            const head = dayHead(t.at), prev = i > 0 ? dayHead(visible[i - 1].at) : ''
            return (
              <li key={`${t.at}-${i}`}>
                {head !== prev && <p className="pb-xs pt-md text-[11px] font-black uppercase tracking-[0.1em] text-neutral-400">{head}</p>}
                <div className="grid grid-cols-[30px_1fr_auto] gap-sm border-t border-neutral-100 py-sm">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs ${t.failed ? 'bg-red-100 text-red-800' : t.kind === 'email' || t.kind === 'offer' ? 'bg-blue-50 text-blue-900' : t.kind === 'money' ? 'bg-amber-50 text-amber-900' : t.kind === 'repair' ? 'bg-orange-50 text-orange-900' : 'bg-neutral-100 text-neutral-700'}`} aria-hidden>{KIND_ICON[t.kind]}</span>
                  <div className="min-w-0">
                    {t.href ? <Link href={t.href} className="block text-sm font-bold text-neutral-900 hover:underline">{t.title}</Link> : <p className="text-sm font-bold text-neutral-900">{t.title}</p>}
                    {t.detail && <p className={`text-[13px] ${t.failed ? 'font-semibold text-red-700' : 'text-neutral-600'}`}>{t.detail}</p>}
                  </div>
                  <span className="text-xs tabular-nums text-neutral-400">{time(t.at)}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {items.length > shown && <button type="button" onClick={() => setShown(n => n + 25)} className="w-full border-t border-neutral-100 py-sm text-sm font-bold text-neutral-700">Show earlier ({items.length - shown} more)</button>}
    </Section>
  )
}

function Relet({ o, wide }: { o: RoomOverview; wide: boolean }) {
  const c = o.current
  const freeFrom = c?.end ? new Date(Date.parse(`${c.end}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : null
  const daily = (c?.rent ?? o.room.askingRent ?? 0) * 12 / 365
  const lead = o.lead
  const leadStep = lead ? Math.max(0, APPLICANT_STEPS.indexOf(lead.stage)) : -1
  const openRepairs = o.repairs.filter(r => !['completed', 'cancelled'].includes(r.status))
  const summary = o.incoming ? `Incoming tenancy: ${o.incoming.tenant} from ${full(o.incoming.start)}` : lead ? `Applicant ${lead.name} · ${lead.stage.replace(/_/g, ' ')}` : freeFrom ? `Room free from ${full(freeFrom)} · no applicant` : 'No applicant'
  return (
    <Section id="relet" title={o.incoming ? 'Incoming tenancy' : 'Re-let plan'} wide={wide} open tone="border-blue-200" summary={summary}>
      <div className="space-y-md px-lg py-md">
        {(freeFrom || o.stage === 'void') && !o.incoming && <p className="text-[13px] text-neutral-600">{freeFrom ? `Tenancy ends ${full(c!.end)} · room free from ${full(freeFrom)}` : 'The room is void'}{daily > 0 ? ` · each void day costs ${gbp(Math.round(daily * 100) / 100)}` : ''}</p>}
        {o.incoming ? (
          <div className="rounded-xl bg-blue-50 p-md">
            <p className="text-[10.5px] font-black uppercase tracking-[0.1em] text-blue-900">Incoming tenancy · let agreed</p>
            <p className="font-bold">{o.incoming.tenant}</p>
            <p className="text-[13px] text-neutral-600">Tenancy start date {full(o.incoming.start)}{o.incoming.rent ? ` · ${gbp(o.incoming.rent)} per month` : ''}</p>
            <Link href={`/admin/lettings/${o.incoming.id}`} className={`${btnDark} mt-sm`}>Open letting file</Link>
          </div>
        ) : lead ? (
          <div className="space-y-sm rounded-xl bg-blue-50 p-md">
            <p className="text-[10.5px] font-black uppercase tracking-[0.1em] text-blue-900">Incoming tenancy · not yet agreed</p>
            <div className="flex justify-between gap-sm"><b>{lead.name}{!lead.hasTitle && <span className="text-xs font-bold text-amber-800"> · title not recorded</span>}</b>{lead.offerRent != null && <span className="text-xs font-bold text-blue-900">{gbp(lead.offerRent)} offered</span>}</div>
            <div className="grid grid-cols-6 gap-[3px]" aria-label={`Stage: ${lead.stage.replace(/_/g, ' ')}`}>{APPLICANT_STEPS.map((s, i) => <span key={s} className={`h-1.5 rounded ${i <= leadStep ? 'bg-blue-700' : 'bg-slate-300'}`} />)}</div>
            <p className="text-xs text-neutral-600">Applied {full(lead.applied)}{lead.offerSentAt ? ` · offer sent ${full(lead.offerSentAt)}` : ''}{lead.stage !== 'offer_sent' || !lead.offerSentAt ? ` · ${lead.stage.replace(/_/g, ' ')}` : ' · not reserved yet'}</p>
            <div className="flex flex-wrap gap-sm"><Link href="/admin/applicants" className={btnDark}>Open applicant</Link></div>
            {o.applicants.length > 1 && <p className="text-xs text-neutral-600">{o.applicants.length - 1} more applicant{o.applicants.length === 2 ? '' : 's'} for this room: {o.applicants.filter(a => a.id !== lead.id).map(a => a.name).join(', ')}</p>}
          </div>
        ) : <p className="text-sm text-neutral-600">No applicants for this room.</p>}
        {!o.incoming && (
          <ol className="text-sm">
            {c?.notice && <Check done={false} label={`Confirm the notice and end date of ${full(c.end)} in writing`} href={`/admin/lettings/${c.id}?tab=notice`} action="Open" />}
            {c?.end && <Check done={false} label={`Check-out inspection and keys returned · ${full(c.end)}`} href="/admin/agency-diary/book-appointment" action="Book" />}
            {c?.end && <Check done={false} label={`End-of-tenancy clean · ${full(c.end)}`} href="/admin/agency-diary/book-clean" action="Book clean" />}
            {openRepairs.map(r => <Check key={r.id} done={false} label={`${r.title} · reported ${full(r.reported)}`} href="/admin/maintenance" action="Book" />)}
            {c?.end && c.deposit > 0 && <Check done={false} label={`Return ${c.tenant.name}’s ${gbp(c.deposit)} deposit after the check-out inspection`} />}
          </ol>
        )}
        {!o.incoming && (
          <div className="flex flex-wrap gap-sm border-t border-neutral-100 pt-md">
            <Link href={`/lettings/listing/${o.room.id}`} className={btnLight}>Advertise {o.room.name}</Link>
            <Link href="/admin/agency-diary/book-appointment" className={btnLight}>Book a viewing</Link>
            <Link href="/admin/invite-to-apply" className={btnLight}>Invite to apply</Link>
          </div>
        )}
        {o.viewings.length > 0 && <p className="text-[13px] text-neutral-600">Viewings booked: {o.viewings.map(v => `${full(v.date)}${v.slot ? ` ${String(v.slot).slice(0, 5)}` : ''} · ${v.name ?? 'visitor'}`).join(' · ')}</p>}
      </div>
    </Section>
  )
}

function Check({ done, label, href, action }: { done: boolean; label: string; href?: string; action?: string }) {
  return (
    <li className="flex min-h-[44px] items-center gap-sm border-t border-neutral-100 py-xs">
      <span className={`h-4 w-4 flex-none rounded-full border-2 ${done ? 'border-green-600 bg-green-600' : 'border-amber-500'}`} />
      <span className="flex-1">{label}</span>
      {href && action && <Link href={href} className="text-xs font-bold underline">{action}</Link>}
    </li>
  )
}

function TheRoom({ o, wide, propertyId }: { o: RoomOverview; wide: boolean; propertyId: string }) {
  const r = o.room
  const d: any = r.detected ?? {}
  const cap = (v: unknown) => { const t = String(v ?? ''); return t ? t[0].toUpperCase() + t.slice(1) : t }
  const facts: [string, React.ReactNode][] = [
    ['Unit code', r.unitCode ?? '—'],
    ['Type', r.type ?? '—'],
    ['Size', r.size ?? <span className="text-amber-800">Not measured</span>],
    ['Bathroom', r.ensuite ? 'En suite' : r.sharedBathroom === false ? '—' : 'Shared'],
    ...(r.location ? [['Location', r.location] as [string, React.ReactNode]] : []),
    ...(d.flooring ? [['Floor', cap(d.flooring)] as [string, React.ReactNode]] : []),
    ...(d.window_type || d.natural_light ? [['Window', cap([d.window_type, d.natural_light].filter(Boolean).join(', '))] as [string, React.ReactNode]] : []),
    ...(r.furnishings || d.wardrobe ? [['Furniture', cap(r.furnishings ?? d.wardrobe)] as [string, React.ReactNode]] : []),
    ...(Array.isArray(d.extras) && d.extras.length ? [['Extras', cap(d.extras.join(', '))] as [string, React.ReactNode]] : []),
    ['Asking rent', r.askingRent != null ? `${gbp(r.askingRent)} per month` : 'Not set'],
  ]
  return (
    <Section title="The room" wide={wide} summary={`${r.type ?? 'Room'} · ${r.photos.length} photo${r.photos.length === 1 ? '' : 's'}${r.size ? '' : ' · not measured'}`}
      right={<Link href={`/admin/properties/${propertyId}/rooms/${r.id}/edit`} className={btnLight}>Edit</Link>}>
      {r.photos[0] && <StoredImg src={r.photos[0].src} alt={`${r.name}: ${r.photos[0].caption ?? 'room photo'}`} className="h-48 w-full object-cover" />}
      <div className="space-y-sm px-lg py-md">
        <dl className="grid grid-cols-[110px_1fr] gap-y-xs text-sm">{facts.map(([k, v]) => <><dt key={`k-${k}`} className="text-neutral-500">{k}</dt><dd key={`v-${k}`}>{v}</dd></>)}</dl>
        {d && Object.keys(d).length > 0 && <p className="text-xs text-neutral-400">Some features were read from the room photo. Confirm them at the next inspection.</p>}
        <p className="border-t border-neutral-100 pt-sm text-[13px] text-neutral-600">{r.photos.length} photo{r.photos.length === 1 ? '' : 's'} · advert text {r.marketingDescription ? 'written' : <b className="text-amber-800">not written</b>} · {r.showOnWebsite ? 'on the website' : 'not on the website'}</p>
        <div className="flex flex-wrap gap-sm">
          <Link href={`/admin/properties/${propertyId}/rooms/${r.id}/edit`} className={btnLight}>Photos and details</Link>
          <Link href={`/lettings/listing/${r.id}`} className={btnLight}>Marketing view</Link>
        </div>
      </div>
    </Section>
  )
}

function Repairs({ o, wide }: { o: RoomOverview; wide: boolean }) {
  const open = o.repairs.filter(r => !['completed', 'cancelled'].includes(r.status))
  const done = o.repairs.filter(r => r.status === 'completed').slice(0, 5)
  return (
    <Section title="Repairs and spend" wide={wide} summary={`${open.length} open · ${gbp(o.spend)} spent`} right={<Link href="/admin/maintenance/new" className={btnLight}>Report a job</Link>}>
      <ul className="px-lg py-sm text-sm">
        {open.map(r => <li key={r.id} className="flex justify-between gap-sm border-b border-neutral-100 py-sm"><span><b>{r.title}</b><span className="block text-xs text-neutral-500">Reported {full(r.reported)} · {r.priority} priority · {r.booked ? `booked ${full(r.booked)}` : 'no date booked'}</span></span><span className="self-start rounded-full bg-amber-50 px-sm py-0.5 text-[11px] font-bold text-amber-900">Open</span></li>)}
        {done.map(r => <li key={r.id} className="flex justify-between gap-sm border-b border-neutral-100 py-sm text-neutral-600"><span>{r.title}<span className="block text-xs">Completed {full(r.completed)}</span></span><span className="tabular-nums">{r.price != null ? gbp(r.price) : ''}</span></li>)}
        {o.purchases.map(p => <li key={p.id} className="flex justify-between gap-sm border-b border-neutral-100 py-sm"><span>{p.name}<span className="block text-xs text-neutral-500">{p.category}{p.date ? ` · ${full(p.date)}` : ''}</span></span><span className="tabular-nums">{gbp(p.cost)}</span></li>)}
        <li className="flex justify-between gap-sm py-sm"><span className="text-neutral-500">Spent on {o.room.name}{o.occupancy ? ` since ${full(o.occupancy.since)}` : ''}</span><b className="tabular-nums">{gbp(o.spend)}</b></li>
      </ul>
    </Section>
  )
}

function Safety({ o, wide, propertyId }: { o: RoomOverview; wide: boolean; propertyId: string }) {
  const today = o.today
  const last = o.safety.checks.find((c: { answered: string | null }) => c.answered)
  return (
    <Section title="Safety" wide={wide} summary={`${o.safety.certs.every((c: { expiry: string }) => c.expiry >= today) ? 'House certificates in date' : 'A house certificate has expired'} · ${last ? `last monthly check ${full(last.answered)}` : 'no monthly checks yet'}`}>
      <div className="space-y-sm px-lg py-md text-sm">
        <div className="flex justify-between gap-sm"><span>Monthly smoke alarm and fire door check</span><span className={`text-right text-xs font-bold ${last ? 'text-neutral-700' : 'text-amber-800'}`}>{last ? `Answered ${full(last.answered)}` : 'None recorded'}</span></div>
        <dl className="grid grid-cols-[1fr_auto] gap-y-xs border-t border-neutral-100 pt-sm text-[13px]">
          {o.safety.certs.map((c: { label: string; expiry: string }) => <><dt key={`k-${c.label}`}>{c.label}</dt><dd key={`v-${c.label}`} className={`text-right font-bold ${c.expiry < today ? 'text-red-700' : 'text-green-800'}`}>{c.expiry < today ? 'expired' : 'expires'} {full(c.expiry)}</dd></>)}
        </dl>
        <Link href={`/admin/properties/${propertyId}?tab=compliance`} className="text-[13px] font-bold underline">All certificates for {o.property.name}</Link>
      </div>
    </Section>
  )
}

function Expired({ o, wide }: { o: RoomOverview; wide: boolean }) {
  const rows: ({ kind: 'tenancy'; x: RoomOverview['expired'][number] } | { kind: 'void'; v: RoomOverview['voids'][number] })[] = [
    ...o.expired.map(x => ({ kind: 'tenancy' as const, x })), ...o.voids.map(v => ({ kind: 'void' as const, v })),
  ].sort((a, b) => (b.kind === 'tenancy' ? b.x.start : b.v.from).localeCompare(a.kind === 'tenancy' ? a.x.start : a.v.from))
  const spanStart = o.occupancy?.since
  return (
    <Section title="Expired tenancies" wide={wide} summary={`${o.expired.length} expired tenanc${o.expired.length === 1 ? 'y' : 'ies'} · ${o.voids.length} void period${o.voids.length === 1 ? '' : 's'}${o.occupancy ? ` · let ${o.occupancy.pct}% since ${full(o.occupancy.since)}` : ''}`}>
      {spanStart && <Timeline o={o} />}
      {rows.length === 0 ? <p className="px-lg py-md text-sm text-neutral-500">No expired tenancies on this room.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="bg-neutral-50 text-left text-[10.5px] uppercase tracking-wide text-neutral-500"><th className="px-lg py-xs">Tenant</th><th className="px-sm py-xs">Tenancy start date</th><th className="px-sm py-xs">Tenancy end date</th><th className="px-sm py-xs">Length</th><th className="px-sm py-xs">Notice received</th><th className="px-sm py-xs text-right">Rent</th><th className="px-sm py-xs">Deposit</th><th className="px-lg py-xs"></th></tr></thead>
            <tbody>
              {rows.map(r => r.kind === 'void' ? (
                <tr key={`v-${r.v.from}`} className="border-t border-neutral-100 bg-amber-50/50 text-amber-900"><td className="px-lg py-sm font-bold">Void</td><td className="px-sm py-sm">{full(r.v.from)}</td><td className="px-sm py-sm">{r.v.to ? full(r.v.to) : 'today'}</td><td className="px-sm py-sm">{r.v.days} days</td><td className="px-sm py-sm"></td><td className="px-sm py-sm text-right tabular-nums">−{gbp(r.v.lost)}</td><td className="px-sm py-sm"></td><td className="px-lg py-sm"></td></tr>
              ) : (
                <tr key={r.x.id} className="border-t border-neutral-100">
                  <td className="px-lg py-sm font-bold">{r.x.tenant}</td>
                  <td className="px-sm py-sm">{full(r.x.start)}</td>
                  <td className="px-sm py-sm">{full(r.x.end)}</td>
                  <td className="px-sm py-sm">{r.x.days} days<span className="block text-[11px] text-neutral-500">{yearsMonths(r.x.days)}</span></td>
                  <td className="px-sm py-sm">{r.x.notice ? full(r.x.notice) : <span className="text-neutral-400">No date recorded</span>}</td>
                  <td className="px-sm py-sm text-right tabular-nums">{gbp(r.x.rent)}</td>
                  <td className="px-sm py-sm">{r.x.deposit ? <>{gbp(r.x.deposit)}{r.x.scheme ? ` · ${r.x.scheme}` : ''} · {r.x.depositReturn ? <span>{r.x.depositReturn.status}{r.x.depositReturn.returnedOn ? ` ${full(r.x.depositReturn.returnedOn)}` : ''}</span> : <b className="text-amber-800">return not recorded</b>}</> : 'None'}</td>
                  <td className="whitespace-nowrap px-lg py-sm text-right"><Link href={`/admin/lettings/${r.x.id}`} className="font-bold underline">Letting file</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {o.current?.end && <p className="border-t border-neutral-100 px-lg py-sm text-xs text-neutral-500">The current tenancy moves into this list after its tenancy end date, {full(o.current.end)}.</p>}
    </Section>
  )
}

/** Tenancies and voids along one bar, oldest on the left. */
function Timeline({ o }: { o: RoomOverview }) {
  const segs = [
    ...o.expired.map(x => ({ from: x.start, to: x.end, label: x.tenant, cls: 'bg-neutral-500 text-white' })),
    ...o.voids.map(v => ({ from: v.from, to: v.to ?? o.today, label: '', cls: 'bg-amber-400' })),
    ...(o.current ? [{ from: o.current.start, to: o.current.end && o.current.end > o.today ? o.current.end : o.today, label: 'Current', cls: 'bg-green-700 text-white' }] : []),
  ].sort((a, b) => a.from.localeCompare(b.from))
  if (!segs.length) return null
  const len = (s: { from: string; to: string }) => Math.max(1, (Date.parse(s.to) - Date.parse(s.from)) / 86_400_000 + 1)
  return (
    <div className="px-lg py-md">
      <div className="flex h-7 overflow-hidden rounded-lg text-xs font-bold" role="img" aria-label={segs.map(s => `${s.label || 'Void'} ${full(s.from)} to ${full(s.to)}`).join('; ')}>
        {segs.map((s, i) => <div key={i} className={`flex min-w-[8px] items-center overflow-hidden whitespace-nowrap px-sm ${s.cls}`} style={{ flex: len(s) }} title={`${s.label || 'Void'} · ${full(s.from)} – ${full(s.to)}`}>{len(s) > 60 ? s.label : ''}</div>)}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-neutral-400"><span>{full(segs[0].from)}</span><span>{full(segs.at(-1)!.to)}</span></div>
    </div>
  )
}

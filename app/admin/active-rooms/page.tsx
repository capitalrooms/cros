'use client'

// All Properties (renamed from All Units 30 Oct 2026; managed and let-only houses together, with a filter). Restyled 12 Oct 2026 — Harry picked "A · Ledger"). Every managed house as a light card: its landlord and
// fee, rooms let, rent and management fee a month (a summary of current rents — not a money screen), the next
// certificate due and open repairs; then each room. A room shows who lives there now; once they've left it shows the
// LAST tenant and their rent (greyed) until someone new is set up to move in, who then takes their place in the row.
// Lets that fell through are ignored; practice (demo) houses are shown but left out of the totals.
import { lettingFeeRule } from '@/lib/fees/lettingFee'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { isOfficeRole } from '@/lib/access/areas'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { resolveFee, feeAmount, describeFee } from '@/lib/fees/managementFee'
import { PROPERTY_CERTIFICATES } from '@/lib/propertyCertificates'
import { landlordName } from '@/lib/people'
import { fullAddressLine } from '@/lib/formatAddress'

type RoomState = 'let' | 'leaving' | 'let_agreed' | 'empty'
interface Who { tenancyId: string; name: string; short: string; rent: number | null; start: string | null; end: string | null }
interface Row {
  id: string; name: string; code: string | null
  state: RoomState
  shown: Who | null              // the person in the row: current, else the incoming, else the last tenant
  last: boolean                  // shown is the last tenant (they've left)
  incoming: Who | null           // set up to move in (shown separately while the current tenant is still there)
  rent: number | null            // current/incoming rent; for an empty room the last rent
  asking: number | null
  emptyDays: number | null
  fee: number                    // management fee a month on a current tenancy
}
interface House {
  id: string; name: string; displayName: string | null; postcode: string | null; code: string | null; type: string; demo: boolean
  landlord: string; feeLabel: string; rows: Row[]; letOnly: boolean
  rentMonth: number; feeMonth: number; fullRent: number; let: number
  cert: { label: string; date: string; tone: 'red' | 'amber' | 'grey' } | null
  repairs: number
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const gbp2 = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// dates in full — "1 June 2026" (Harry, 12 Oct)
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000))
// names with their title ("Mr Danielo Maglente"); short = title + surname for "… moves in" ("Mr Maglente")
const personName = (p: any) => { const n = p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email || 'Tenant') : 'Tenant'; return p?.salutation ? `${p.salutation} ${n}` : n }
const personShort = (p: any) => p?.salutation && p?.last_name ? `${p.salutation} ${p.last_name}` : personName(p)
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0]

const STATE: Record<RoomState, { label: string; cls: string }> = {
  let:        { label: 'Let',             cls: 'bg-green-50 text-green-800' },
  leaving:    { label: 'Notice received', cls: 'bg-amber-100 text-amber-900' },
  let_agreed: { label: 'Let agreed',      cls: 'bg-blue-100 text-blue-900' },
  empty:      { label: 'Void',            cls: 'bg-red-50 text-red-800' },
}
const TONE = { red: 'bg-red-50 text-red-800', amber: 'bg-amber-50 text-amber-900', grey: 'bg-neutral-100 text-neutral-600' }

type Filter = 'all' | 'void' | 'notice' | 'agreed'
type Kind = 'all' | 'managed' | 'let_only'

/** What happens next for a room — one wording for the desktop table and the phone list. */
function nextFor(r: Row): { text: string; cls: string } {
  if (r.state === 'let') return r.incoming ? { text: `Incoming tenancy from ${day(r.incoming.start!)}`, cls: 'font-semibold text-blue-800' } : { text: 'Periodic tenancy', cls: 'text-neutral-500' }
  if (r.state === 'leaving') return r.incoming
    ? { text: `Ends ${day(r.shown!.end!)} · incoming tenancy from ${day(r.incoming.start!)}`, cls: 'font-semibold text-blue-800' }
    : { text: `Ends ${day(r.shown!.end!)} · not re-let yet`, cls: 'font-semibold text-amber-800' }
  if (r.state === 'let_agreed') return { text: `Let agreed${r.rent != null ? ` at ${gbp2(r.rent)}` : ''}`, cls: 'text-blue-800' }
  return { text: `${r.emptyDays != null ? `Void ${r.emptyDays} day${r.emptyDays === 1 ? '' : 's'}` : 'Void'}${r.asking != null ? ` · asking ${gbp2(r.asking)}` : ' · no asking rent set'}`, cls: 'font-semibold text-red-800' }
}
function tenantNote(r: Row): string {
  if (!r.shown) return ''
  if (r.last && r.shown.end) return `ended ${day(r.shown.end)}`
  if (r.state === 'let_agreed' && r.shown.start) return `tenancy start date ${day(r.shown.start)}`
  if (r.state === 'leaving' && r.shown.end) return `ends ${day(r.shown.end)}`
  return r.shown.start ? `from ${day(r.shown.start)}` : ''
}

export default function AllUnitsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [houses, setHouses] = useState<House[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [kind, setKind] = useState<Kind>('all')
  // the top-bar figures are links (#void, #notice, #agreed, #let-only) — the page reads the hash so they can be shared
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace('#', '')
      if (h === 'let-only') { setKind('let_only'); setFilter('all') }
      else if (h === 'managed') { setKind('managed'); setFilter('all') }
      else if (['void', 'notice', 'agreed', 'all'].includes(h)) setFilter(h as Filter)
    }
    read(); window.addEventListener('hashchange', read); return () => window.removeEventListener('hashchange', read)
  }, [])

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !isOfficeRole(u.assignment?.role)) { router.push('/login'); return }
      await load()
      setLoading(false)
    })()
  }, [router])   // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const sb = createClient()
    const certCols = PROPERTY_CERTIFICATES.map(([c]) => c).join(', ')
    const [props, rooms, tens, jobs] = await Promise.all([
      sb.from('properties').select(`id, name, address, postcode, property_code, property_type, letting_type, letting_fee_pct, letting_fee_flat, is_demo, landlord_id, has_gas, management_fee_type, management_fee_pct, management_fee_fixed, ${certCols}`),
      sb.from('rooms').select('id, name, unit_code, current_asking_rent, available_date, property_id'),
      sb.from('tenancies').select('id, room_id, start_date, end_date, notice_received_date, let_cancelled_at, rent_amount, management_fee_type, management_fee_pct, management_fee_fixed, people!person_id(salutation, first_name, last_name, full_name, email), co:people!co_tenant_id(salutation, first_name, last_name, full_name, email)'),
      sb.from('maintenance_tickets').select('property_id, status'),
    ])
    const allProps = (props.data ?? []) as any[]
    const managed = allProps   // let-only houses too, marked and filterable (30 Oct 2026)
    const { data: landlords } = await sb.from('people').select('id, salutation, first_name, last_name, full_name, company, letting_fee_pct, letting_fee_flat').in('id', [...new Set(managed.map(p => p.landlord_id).filter(Boolean))].concat(['00000000-0000-0000-0000-000000000000']))
    const now = today(), in60 = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
    const live = ((tens.data ?? []) as any[]).filter(t => !t.let_cancelled_at && t.room_id)
    const openJobs = ((jobs.data ?? []) as any[]).filter(j => !['completed', 'closed', 'cancelled'].includes(j.status))
    // a joint tenancy names both
    const who = (t: any): Who => ({ tenancyId: t.id, name: [personName(t.people), t.co ? personName(t.co) : ''].filter(Boolean).join(' & '), short: [personShort(t.people), t.co ? personShort(t.co) : ''].filter(Boolean).join(' & '), rent: t.rent_amount != null ? Number(t.rent_amount) : null, start: t.start_date ?? null, end: t.end_date ?? null })

    const out: House[] = managed.map(p => {
      const rows: Row[] = ((rooms.data ?? []) as any[]).filter(r => r.property_id === p.id).map(r => {
        const ts = live.filter(t => t.room_id === r.id).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
        const current = [...ts].reverse().find(t => t.start_date && t.start_date <= now && (!t.end_date || t.end_date >= now))
        const incoming = ts.find(t => t.start_date && t.start_date > now && (!current || t.id !== current.id))
        const past = [...ts].reverse().find(t => t.end_date && t.end_date < now)
        let state: RoomState, shown: Who | null, last = false, inc: Who | null = null, rent: number | null, emptyDays: number | null = null
        if (current) {
          shown = who(current); rent = shown.rent
          state = current.notice_received_date && current.end_date ? 'leaving' : 'let'
          if (incoming) inc = who(incoming)
        } else if (incoming) {
          shown = who(incoming); rent = shown.rent; state = 'let_agreed'          // the new tenant replaces the last one here
        } else {
          state = 'empty'; shown = past ? who(past) : null; last = !!past; rent = shown?.rent ?? null
          const from = past?.end_date ?? r.available_date ?? null
          emptyDays = from ? daysBetween(from, now) : null
        }
        const fee = current && p.letting_type !== 'let_only' ? (feeAmount(resolveFee(current, p), { received: Number(current.rent_amount || 0), charged: Number(current.rent_amount || 0) }) ?? 0) : 0
        return { id: r.id, name: r.name, code: r.unit_code, state, shown, last, incoming: inc, rent, asking: r.current_asking_rent != null ? Number(r.current_asking_rent) : null, emptyDays, fee }
      }).sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', undefined, { numeric: true }))

      // the certificate coming up first (gas only where the house has gas)
      const dated = PROPERTY_CERTIFICATES.filter(([c]) => p[c] && !(c === 'gas_safe_cert_expiry' && p.has_gas === false)).map(([c, label]) => ({ label, date: String(p[c]).slice(0, 10) }))
        .sort((a, b) => a.date.localeCompare(b.date))
      const next = dated[0]
      const cert = next ? { ...next, tone: (next.date < now ? 'red' : next.date <= in60 ? 'amber' : 'grey') as 'red' | 'amber' | 'grey' } : null
      const l = ((landlords ?? []) as any[]).find(x => x.id === p.landlord_id)
      const houseFee = resolveFee(null, p)
      const letOnly = p.letting_type === 'let_only'
      const lf = letOnly ? lettingFeeRule(p, l) : null
      return {
        // the full postal address — the display name is marketing wording and is only shown alongside when it differs
        id: p.id, name: fullAddressLine(p), displayName: firstLine(p.name) || null, postcode: p.postcode ?? null, code: p.property_code ?? null, demo: !!p.is_demo,
        type: (p.property_type || 'hmo').replace('_', ' ').toUpperCase(),
        letOnly,
        landlord: l ? landlordName(l) : 'No landlord set', feeLabel: letOnly ? `Let only · ${lf?.pct != null ? `${lf.pct}% letting fee` : lf?.flat != null ? `£${lf.flat} letting fee` : 'letting fee not set'}` : houseFee.source === 'none' ? 'fee not set' : describeFee(houseFee).replace(' of rent received', '').replace(' of rent charged', ' of rent due'),
        rows,
        let: rows.filter(r => r.state === 'let' || r.state === 'leaving').length,
        rentMonth: rows.filter(r => r.state === 'let' || r.state === 'leaving').reduce((n, r) => n + (r.rent ?? 0), 0),
        feeMonth: rows.reduce((n, r) => n + r.fee, 0),
        fullRent: rows.reduce((n, r) => n + (r.state === 'empty' ? (r.asking ?? r.rent ?? 0) : (r.rent ?? 0)), 0),
        cert, repairs: openJobs.filter(j => j.property_id === p.id).length,
      }
    })
    setHouses(sortPropertiesNumerically(out as any) as any)
  }

  const q = query.toLowerCase().trim()
  const shownHouses = useMemo(() => houses.map(h => {
    const houseHit = !q || [h.name, h.displayName, h.postcode, h.code, h.landlord].some(v => String(v ?? '').toLowerCase().includes(q))
    const rows = h.rows.filter(r =>
      (houseHit || [r.name, r.code, r.shown?.name, r.incoming?.name].some(v => String(v ?? '').toLowerCase().includes(q))) &&
      (filter === 'all' || (filter === 'void' ? r.state === 'empty' : filter === 'notice' ? r.state === 'leaving' && !r.incoming : r.state === 'let_agreed' || !!r.incoming)))
    return { ...h, rows }
  }).filter(h => kind === 'all' || (kind === 'let_only') === h.letOnly)
    .filter(h => h.rows.length > 0 || (!q && filter === 'all')), [houses, q, filter, kind])

  if (loading) return <GenericPageSkeleton />

  const real = houses.filter(h => !h.demo && (kind === 'all' || (kind === 'let_only') === h.letOnly))
  const letOnlyCount = houses.filter(h => h.letOnly && !h.demo).length
  const rooms = real.flatMap(h => h.rows)
  const counts = {
    let: rooms.filter(r => r.state === 'let' || r.state === 'leaving').length,
    empty: rooms.filter(r => r.state === 'empty').length,
    leaving: rooms.filter(r => r.state === 'leaving' && !r.incoming).length,
    agreed: rooms.filter(r => r.state === 'let_agreed' || !!r.incoming).length,
  }
  const chip = (on: boolean) => `rounded-full border px-md py-xs text-xs font-bold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50'}`

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} />
      <PageHero
        title="All Properties"
        subtitle={<>{real.length} house{real.length === 1 ? '' : 's'} · {rooms.length} rooms · tap a room for its page · a name opens the letting file</>}
        stats={[
          // each figure opens that list (30 Oct 2026)
          { label: 'Void', value: counts.empty, tone: counts.empty ? 'bad' : 'good', href: '#void' },
          { label: 'On notice', value: counts.leaving, tone: 'warn', href: '#notice' },
          { label: 'Let agreed', value: counts.agreed, tone: 'info', href: '#agreed' },
        ]}
      />

      <main className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div className="flex flex-wrap items-center gap-sm">
          <label className="flex min-w-[260px] flex-1 items-center gap-sm rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm shadow-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a house, room, tenant or landlord…" aria-label="Search"
              className="flex-1 bg-transparent text-neutral-900 placeholder:text-neutral-400 focus:outline-none" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-neutral-400 hover:text-neutral-700">✕</button>}
          </label>
          <button type="button" onClick={() => setKind('all')} className={chip(kind === 'all')}>All houses</button>
          <button type="button" onClick={() => setKind('managed')} className={chip(kind === 'managed')}>Managed</button>
          <button type="button" onClick={() => setKind('let_only')} className={chip(kind === 'let_only')}>Let only · {letOnlyCount}</button>
          <span className="mx-xs h-5 w-px bg-neutral-300" aria-hidden="true" />
          <button type="button" onClick={() => setFilter('all')} className={chip(filter === 'all')}>All rooms</button>
          <button type="button" onClick={() => setFilter('void')} className={chip(filter === 'void')}>Void · {counts.empty}</button>
          <button type="button" onClick={() => setFilter('notice')} className={chip(filter === 'notice')}>On notice · {counts.leaving}</button>
          <button type="button" onClick={() => setFilter('agreed')} className={chip(filter === 'agreed')}>Let agreed · {counts.agreed}</button>
        </div>

        {kind === 'let_only' && <p className="text-xs text-neutral-500">Let-only houses: the landlord manages. <Link href="/admin/let-only-properties/room-list" className="font-bold underline">Update from a landlord’s room list</Link></p>}
        {shownHouses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">{q ? `Nothing matches “${query}”.` : 'Nothing to show for this filter.'}</div>
        ) : shownHouses.map(h => (
          <article key={h.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <header className="flex flex-wrap items-center gap-x-lg gap-y-sm border-b border-neutral-100 px-lg py-md">
              {h.code && <span className="rounded-md bg-[#181614] px-2 py-0.5 font-mono text-[11px] font-bold text-[#F6F3EC]">{h.code}</span>}
              <div className="min-w-0 flex-1 basis-60">
                <Link href={`/admin/properties/${h.id}`} className="text-lg font-bold text-neutral-900 hover:underline" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{h.name}</Link>
                {h.demo && <span className="ml-sm rounded-full bg-amber-100 px-sm py-0.5 text-[11px] font-bold text-amber-900">Practice house</span>}
                <p className="text-xs text-neutral-500">{[h.displayName && !h.name.toLowerCase().startsWith(String(h.displayName).toLowerCase()) ? `Advertised as “${h.displayName}”` : '', h.landlord, h.feeLabel, h.type].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-sm text-xs">
                <span className="text-neutral-700"><b>{h.let}/{h.rows.length}</b> let</span>
                {h.letOnly ? <span className="rounded-full bg-[#181614] px-sm py-0.5 font-bold text-[#F6F3EC]">Let only</span> : <>
                <span className="rounded-full bg-neutral-100 px-sm py-0.5 font-semibold text-neutral-800" title="Rent of the tenants living there now">Rent {gbp(h.rentMonth)}/mo</span>
                <span className="rounded-full bg-neutral-100 px-sm py-0.5 font-semibold text-neutral-800" title="Management fee on those rents">Fee {gbp(h.feeMonth)}/mo</span>
                {h.fullRent > h.rentMonth + 0.5 && <span className="text-neutral-500" title="With the empty rooms let at their asking (or last) rent">{gbp(h.fullRent)} when full</span>}</>}
                {h.cert && <span className={`rounded-full px-sm py-0.5 font-semibold ${TONE[h.cert.tone]}`}>{h.cert.label} {h.cert.tone === 'red' ? 'expired' : 'due'} {day(h.cert.date)}</span>}
                {!h.letOnly && <span className="rounded-full bg-neutral-100 px-sm py-0.5 text-neutral-600">{h.repairs ? `${h.repairs} repair${h.repairs === 1 ? '' : 's'} open` : 'No repairs open'}</span>}
              </div>
            </header>
            {h.rows.length === 0 ? (
              <p className="px-lg py-md text-sm italic text-neutral-400">No rooms set up yet.</p>
            ) : (<>
              {/* phone: one compact block per room */}
              <ul className="divide-y divide-neutral-100 md:hidden">
                {h.rows.map(r => (
                  <li key={r.id}>
                    <Link href={`/admin/properties/${h.id}/rooms/${r.id}`} className="block px-md py-sm active:bg-neutral-50">
                      <div className="flex items-center justify-between gap-sm">
                        <span className="text-sm"><b className="text-neutral-900">{r.name}</b> <span role="link" tabIndex={0} onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/lettings/listing/${r.id}?from=/admin/active-rooms`) }} className="ml-xs rounded border border-neutral-300 px-1 py-px text-[10.5px] font-semibold text-neutral-600">Listing</span></span>
                        <span className={`shrink-0 rounded-full px-sm py-0.5 text-[11px] font-semibold ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-sm text-sm">
                        <span className={`min-w-0 truncate ${r.last || !r.shown ? 'italic text-neutral-400' : 'font-semibold text-neutral-900'}`}>{r.shown ? (r.last ? `Expired tenancy: ${r.shown.name}` : r.shown.name) : 'No tenant on record yet'} <span className="text-[11px] font-normal not-italic text-neutral-400">{tenantNote(r)}</span></span>
                        <span className={`shrink-0 tabular-nums ${r.state === 'empty' ? 'text-neutral-400' : 'text-neutral-900'}`}>{r.rent != null ? gbp2(r.rent) : '—'}</span>
                      </div>
                      <p className={`mt-0.5 text-[12px] ${nextFor(r).cls}`}>{nextFor(r).text}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                  <colgroup><col className="w-[17%]" /><col className="w-[35%]" /><col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[22%]" /></colgroup>
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-neutral-400">
                      <th className="px-lg py-xs font-semibold">Room</th>
                      <th className="px-sm py-xs font-semibold">Tenant</th>
                      <th className="px-sm py-xs text-right font-semibold">Rent</th>
                      <th className="px-sm py-xs font-semibold">Status</th>
                      <th className="px-lg py-xs font-semibold">Next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.rows.map(r => (
                      <tr key={r.id} onClick={() => router.push(`/admin/properties/${h.id}/rooms/${r.id}`)} className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="whitespace-nowrap px-lg py-sm"><b className="text-neutral-900">{r.name}</b>
                          {/* the room's listing — photos, details, share link (17 Oct 2026) */}
                          <Link href={`/lettings/listing/${r.id}?from=/admin/active-rooms`} onClick={e => e.stopPropagation()} className="ml-sm rounded border border-neutral-300 px-1 py-px text-[10.5px] font-semibold text-neutral-600 hover:bg-white">Listing</Link></td>
                        <td className="px-sm py-sm">
                          {r.shown ? <>
                            <Link href={`/admin/lettings/${r.shown.tenancyId}?from=/admin/active-rooms`} onClick={e => e.stopPropagation()}
                              className={r.last ? 'italic text-neutral-400 hover:underline' : 'font-semibold text-neutral-900 hover:underline'}>{r.last ? `Expired tenancy: ${r.shown.name}` : r.shown.name}</Link>
                            <span className="ml-xs text-[11.5px] text-neutral-400">{tenantNote(r)}</span>
                          </> : <span className="italic text-neutral-400">No tenant on record yet</span>}
                        </td>
                        <td className="whitespace-nowrap px-sm py-sm text-right tabular-nums">
                          {r.rent != null ? <span className={r.state === 'empty' ? 'text-neutral-400' : 'text-neutral-900'}>{gbp2(r.rent)}</span> : <span className="text-neutral-300">—</span>}
                          {r.state === 'empty' && r.rent != null && <span className="block text-[10.5px] text-neutral-400">last rent</span>}
                        </td>
                        <td className="whitespace-nowrap px-sm py-sm"><span className={`rounded-full px-sm py-0.5 text-[11px] font-semibold ${STATE[r.state].cls}`}>{STATE[r.state].label}</span></td>
                        <td className="px-lg py-sm text-[12.5px]"><span className={nextFor(r).cls}>{nextFor(r).text}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
          </article>
        ))}
      </main>
    </div>
  )
}

'use client'

/**
 * /admin/rent-roll — step 1 of the monthly cycle.
 * Every room's rent for the month: what was due, what arrived (date, receipt number, bank file), what's missing,
 * and — per property — the rent received and not yet paid over, with "Prepare statement" (step 2) and a link to
 * the payment run (step 3). Months before CROS took over collecting show what the previous agent's statements say.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { getCurrentUser } from '@/lib/auth'
import { adminFetch } from '@/lib/adminFetch'
import AppBar from '@/components/AppBar'
import HeroMonthPicker from '@/components/HeroMonthPicker'
import { financeTabs } from '@/lib/financeTabs'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'
import type { RentRoll, RollRoom } from '@/lib/finance/rentRoll'

const gbp = (n: number | null | undefined) => (n == null ? '' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const monthLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const shortDate = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')

const STATUS: Record<RollRoom['status'], { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-800' },
  part: { label: 'Part paid', cls: 'bg-amber-100 text-amber-800' },
  missing: { label: 'Missing', cls: 'bg-red-100 text-red-700' },
  over: { label: 'Paid more', cls: 'bg-blue-100 text-blue-800' },
  no_charge: { label: 'No charge raised', cls: 'bg-neutral-200 text-neutral-700' },
  collected_by_previous_agent: { label: 'Collected by previous agent', cls: 'bg-neutral-100 text-neutral-600' },
}

export default function RentRollPage({ searchParams }: { searchParams: PageSearchParams }) {
  return <RentRollScreen initialMonth={one(use(searchParams).month)} />
}

function RentRollScreen({ initialMonth }: { initialMonth?: string }) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [roll, setRoll] = useState<RentRoll | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention' | 'ready'>('all')
  const [sel, setSel] = useState<string | null>(null)   // the property open on the right

  const load = useCallback(async (m: string) => {
    setLoading(true); setError('')
    const r = await adminFetch(`/api/admin/rent-roll?month=${m}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not load the rent roll'); setRoll(null) } else setRoll(j)
    setLoading(false)
  }, [])

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !['administrator', 'admin'].includes(u.assignment?.role || '')) { router.push('/login'); return }
      load(month)
    })()
  }, [router, load, month])

  const go = (m: string) => { setMonth(m); router.replace(`/admin/rent-roll?month=${m}`) }
  const props = useMemo(() => (roll?.properties ?? []).filter(p =>
    filter === 'all' ? true
      : filter === 'ready' ? p.readyForStatement > 0
      : p.rooms.some(r => ['missing', 'part', 'over', 'no_charge'].includes(r.status))), [roll, filter])

  const exportRows = useMemo(() => props.flatMap(p => p.rooms.map(r => ({
    property: p.name, landlord: p.landlord, room: r.room, tenant: r.tenant, reference: r.reference ?? '', due: r.due, received: r.received,
    difference: r.difference, status: STATUS[r.status].label, date: r.receipts.map(x => x.date).filter(Boolean).join(' / '),
    receipt: r.receipts.map(x => [x.number, x.file].filter(Boolean).join(' · ') || x.how).join(' / '), statement: r.statement ?? '',
  }))), [props])
  const prevAgent = roll?.source === 'previous_agent'

  const selected = props.find(p => p.id === sel) ?? props[0] ?? null
  const pick = (id: string) => {
    setSel(id)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setTimeout(() => document.getElementById('rr-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const paidCount = (p: (typeof props)[number]) => p.rooms.filter(r => r.status === 'paid' || r.status === 'over' || r.status === 'collected_by_previous_agent').length

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Rent roll" />
      <PageHero
        eyebrow="Step 1 of 3 · monthly cycle"
        title="Rent roll"
        subtitle={<>{monthLabel(month)} — what’s due, what’s in, what’s missing. Then prepare each property’s statement, then the payment run.</>}
        actions={<>
          <HeroMonthPicker month={month} onChange={go} />
          <HeroButton href="/admin/bank-import" primary>Import bank CSV</HeroButton>
        </>}
        stats={roll ? [
          { label: prevAgent ? 'Rent collected' : 'Rent due', value: gbp(prevAgent ? roll.totals.received : roll.totals.due) },
          { label: 'Received', value: gbp(roll.totals.received), tone: 'good' },
          { label: 'Missing', value: gbp(roll.totals.missing), tone: roll.totals.missing > 0 ? 'bad' : undefined },
          { label: 'Ready for statements', value: gbp(roll.totals.ready), tone: 'warn' },
        ] : undefined}
        tabs={financeTabs('rent-roll', month)}
      />
      <div className="mx-auto max-w-6xl px-lg py-lg">
        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}
        {prevAgent && <p className="mb-md rounded-xl border border-neutral-200 bg-white px-lg py-md text-sm text-neutral-600">{monthLabel(month)} is before CROS took over collecting rent ({shortDate(roll!.takeover)}). This shows the rent on the statements imported from the previous agent — they collected it and paid the landlords.</p>}

        <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
          <div className="inline-flex rounded-xl bg-white p-0.5 text-xs font-semibold">
            {([['all', 'All properties'], ['attention', 'Needs attention'], ['ready', 'Ready for a statement']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-md py-xs ${filter === k ? 'bg-[#181614] text-white' : 'text-neutral-600'}`}>{l}</button>
            ))}
          </div>
          <ExportButtons title={`Rent roll ${monthLabel(month)}`} filename={`rent-roll-${month}`}
            columns={[{ key: 'property', label: 'Property' }, { key: 'room', label: 'Room' }, { key: 'tenant', label: 'Tenant' }, { key: 'reference', label: 'Ref' },
              { key: 'due', label: 'Due', money: true }, { key: 'received', label: 'Received', money: true }, { key: 'difference', label: 'Diff', money: true },
              { key: 'date', label: 'Date in' }, { key: 'receipt', label: 'Receipt · file' }, { key: 'status', label: 'Status' }, { key: 'statement', label: 'Statement' }]}
            rows={exportRows} totals={roll ? { property: 'Total', due: roll.totals.due, received: roll.totals.received } : undefined} />
        </div>

        <div className="grid grid-cols-1 gap-md lg:grid-cols-[minmax(0,1fr)_420px]">
          {/* ── Properties ── */}
          <section className="overflow-hidden rounded-2xl bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_110px] sm:grid-cols-[minmax(0,1fr)_90px_110px_110px] gap-sm border-b border-neutral-200 px-md py-sm text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              <span>Property</span><span className="hidden sm:block">Rooms</span><span className="hidden sm:block text-right">{prevAgent ? '' : 'Due'}</span><span className="text-right">Received</span>
            </div>
            {loading && <p className="px-md py-xl text-center text-sm text-neutral-500">Loading…</p>}
            {!loading && props.map(p => {
              const on = selected?.id === p.id
              return (
                <button key={p.id} type="button" onClick={() => pick(p.id)} aria-pressed={on}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_110px] sm:grid-cols-[minmax(0,1fr)_90px_110px_110px] items-center gap-sm border-b border-neutral-100 px-md py-sm text-left text-sm ${on ? 'bg-[#181614] text-[#F6F3EC]' : 'hover:bg-neutral-50'}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className={`block truncate text-xs ${on ? 'text-[#F6F3EC]/55' : 'text-neutral-500'}`}>{p.landlord}{p.missing > 0 ? ' · ' : ''}{p.missing > 0 && <span className={on ? 'text-[#F28B82]' : 'text-red-700'}>{gbp(p.missing)} missing</span>}{p.readyForStatement > 0 && !prevAgent ? <span className={on ? 'text-[#E8B06B]' : 'text-amber-700'}> · ready {gbp(p.readyForStatement)}</span> : null}</span>
                  </span>
                  <span className={`hidden sm:block text-xs ${on ? 'text-[#F6F3EC]/70' : 'text-neutral-600'}`}>{paidCount(p)}/{p.rooms.length} paid</span>
                  <span className="hidden sm:block text-right tabular-nums">{prevAgent ? '' : gbp(p.due)}</span>
                  <span className="text-right tabular-nums">{gbp(p.received)}<span className={`block text-[11px] sm:hidden ${on ? 'text-[#F6F3EC]/55' : 'text-neutral-500'}`}>{prevAgent ? '' : `of ${gbp(p.due)} · `}{paidCount(p)}/{p.rooms.length} paid</span></span>
                </button>
              )
            })}
            {!loading && roll && !props.length && <p className="px-md py-xl text-center text-sm text-neutral-500">Nothing to show for {monthLabel(month)} with this filter.</p>}
          </section>

          {/* ── The selected property ── */}
          <aside id="rr-detail" className="h-fit space-y-md rounded-2xl bg-white p-lg lg:sticky lg:top-md">
            {!selected ? <p className="text-sm text-neutral-500">Choose a property.</p> : <>
              <div>
                {selected.code && <p className="font-mono text-[11px] text-neutral-500">{selected.code}</p>}
                <h2 className="text-xl font-extrabold text-neutral-900" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{selected.name}</h2>
                <p className="text-sm text-neutral-600">{selected.landlord} · {selected.rooms.length} room{selected.rooms.length === 1 ? '' : 's'}{prevAgent ? '' : ` · ${gbp(selected.due)} due`} · {gbp(selected.received)} in</p>
              </div>
              <ul className="divide-y divide-neutral-100 rounded-xl bg-neutral-50">
                {selected.rooms.map((r, i) => (
                  <li key={i} className="px-md py-sm text-sm">
                    <div className="flex items-baseline justify-between gap-sm">
                      <span className="min-w-0"><b>{r.room}</b> · {r.tenancyId ? <Link href={`/admin/lettings/${r.tenancyId}?tab=money&from=${encodeURIComponent(`/admin/rent-roll?month=${month}`)}`} className="text-blue-700 hover:underline">{r.tenant}</Link> : r.tenant}</span>
                      <span className="shrink-0 tabular-nums">{gbp(r.received)}{!prevAgent && r.due != null ? <span className="text-neutral-400"> / {gbp(r.due)}</span> : null}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-sm gap-y-0.5 text-[11px] text-neutral-500">
                      <span className={`rounded-full px-sm py-0.5 font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                      {r.reference && <span className="font-mono">{r.reference}</span>}
                      {r.chargeNo && <span className="font-mono">{r.chargeNo}</span>}
                      {r.receipts.map((x, k) => <span key={k} className="font-mono">{[shortDate(x.date), x.number, x.file].filter(Boolean).join(' · ') || x.how}</span>)}
                      {r.difference != null && Math.abs(r.difference) >= 0.01 && r.received > 0 && <span className={r.difference < 0 ? 'text-amber-700' : 'text-blue-700'}>{r.difference < 0 ? `${gbp(-r.difference)} short` : `${gbp(r.difference)} over`}</span>}
                      {r.statement && <span>on {r.statement}</span>}
                    </div>
                  </li>
                ))}
              </ul>
              {selected.statements.length > 0 && (
                <p className="text-xs text-neutral-600">Statements: {selected.statements.map(st => `${st.reference} · ${st.state === 'paid' ? 'paid' : st.state}${st.source === 'import' ? ' (imported)' : ''}`).join(' · ')}</p>
              )}
              {!prevAgent && (selected.readyForStatement > 0
                ? <Link href={`/admin/statements/prepare?property=${selected.id}&month=${month}`} className="block rounded-xl bg-[#181614] py-sm text-center text-sm font-bold text-white hover:bg-black">Prepare statement · {gbp(selected.readyForStatement)}</Link>
                : <p className="rounded-xl bg-neutral-50 py-sm text-center text-sm text-neutral-500">Nothing new to pay over</p>)}
              <div className="grid grid-cols-2 gap-sm text-sm font-semibold">
                <Link href={`/admin/properties/${selected.id}`} className="rounded-xl border border-neutral-300 py-xs text-center hover:bg-neutral-50">The property</Link>
                <Link href="/admin/arrears" className="rounded-xl border border-neutral-300 py-xs text-center hover:bg-neutral-50">Arrears</Link>
              </div>
            </>}
          </aside>
        </div>
        {roll && !prevAgent && roll.properties.some(p => p.rooms.some(r => r.status === 'no_charge')) && (
          <p className="mt-sm text-xs text-neutral-500">“No charge raised” — rent charges are raised automatically on the 1st. To raise them now, use <Link href="/admin/rent-charges" className="underline">Rent charges</Link>.</p>
        )}
      </div>
    </div>
  )
}

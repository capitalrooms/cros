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
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'
import type { RentRoll, RollRoom } from '@/lib/finance/rentRoll'

const gbp = (n: number | null | undefined) => (n == null ? '' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const monthLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const shift = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7) }
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
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<'all' | 'attention' | 'ready'>('all')

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

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Rent roll" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-md flex flex-wrap items-start justify-between gap-md">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Rent roll</h1>
            <p className="mt-xs text-sm text-neutral-500">Step 1 of the month: what’s due, what’s in, what’s missing. Then prepare each property’s statement, then the <Link href={`/admin/payment-run?month=${month}`} className="font-semibold text-neutral-900 underline">payment run</Link>.</p>
          </div>
          <div className="flex items-center gap-sm">
            <button onClick={() => go(shift(month, -1))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" aria-label="Previous month">‹</button>
            <input type="month" value={month} onChange={e => e.target.value && go(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900" />
            <button onClick={() => go(shift(month, 1))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" aria-label="Next month">›</button>
            <Link href="/admin/bank-import" className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white">Import bank CSV</Link>
          </div>
        </div>

        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}
        {prevAgent && <p className="mb-md rounded-xl border border-neutral-200 bg-white px-lg py-md text-sm text-neutral-600">{monthLabel(month)} is before CROS took over collecting rent ({shortDate(roll!.takeover)}). This shows the rent on the statements imported from the previous agent — they collected it and paid the landlords.</p>}

        {roll && (
          <div className="mb-md grid grid-cols-2 gap-sm md:grid-cols-4">
            {[
              { label: prevAgent ? 'Rent collected' : 'Rent due', value: gbp(prevAgent ? roll.totals.received : roll.totals.due), cls: 'text-neutral-900' },
              { label: 'Received', value: gbp(roll.totals.received), cls: 'text-green-700' },
              { label: 'Missing', value: gbp(roll.totals.missing), cls: roll.totals.missing > 0 ? 'text-red-700' : 'text-neutral-900' },
              { label: 'Ready for statements', value: gbp(roll.totals.ready), cls: 'text-neutral-900' },
            ].map(c => (
              <div key={c.label} className="rounded-xl bg-white px-md py-sm">
                <p className="text-xs text-neutral-500">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
          <div className="inline-flex rounded-lg bg-white p-0.5 text-xs font-semibold">
            {([['all', 'All properties'], ['attention', 'Needs attention'], ['ready', 'Ready for a statement']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-md py-xs ${filter === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button>
            ))}
          </div>
          <ExportButtons title={`Rent roll ${monthLabel(month)}`} filename={`rent-roll-${month}`}
            columns={[{ key: 'property', label: 'Property' }, { key: 'room', label: 'Room' }, { key: 'tenant', label: 'Tenant' }, { key: 'reference', label: 'Ref' },
              { key: 'due', label: 'Due', money: true }, { key: 'received', label: 'Received', money: true }, { key: 'difference', label: 'Diff', money: true },
              { key: 'date', label: 'Date in' }, { key: 'receipt', label: 'Receipt · file' }, { key: 'status', label: 'Status' }, { key: 'statement', label: 'Statement' }]}
            rows={exportRows} totals={roll ? { property: 'Total', due: roll.totals.due, received: roll.totals.received } : undefined} />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs font-bold text-white">
              <tr>
                <th className="px-md py-sm">Property / room</th><th className="px-md py-sm">Tenant · ref</th>
                <th className="px-md py-sm text-right">Due</th><th className="px-md py-sm text-right">Received</th>
                <th className="px-md py-sm">Date in</th><th className="px-md py-sm">Receipt · bank file</th><th className="px-md py-sm">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-md py-xl text-center text-neutral-500">Loading…</td></tr>}
              {!loading && props.map(p => {
                const isOpen = open[p.id] ?? true
                const paid = p.rooms.filter(r => r.status === 'paid' || r.status === 'over' || r.status === 'collected_by_previous_agent').length
                return [
                  <tr key={p.id} className="border-t border-neutral-200 bg-neutral-50">
                    <td className="px-md py-sm">
                      <button onClick={() => setOpen({ ...open, [p.id]: !isOpen })} className="font-bold text-neutral-900" aria-expanded={isOpen}>{isOpen ? '▾' : '▸'} {p.name}</button>
                      <span className="ml-sm text-xs text-neutral-500">{p.landlord}</span>
                    </td>
                    <td className="px-md py-sm text-xs text-neutral-600">{p.rooms.length} room{p.rooms.length === 1 ? '' : 's'} · {paid} paid</td>
                    <td className="px-md py-sm text-right font-semibold tabular-nums">{prevAgent ? '' : gbp(p.due)}</td>
                    <td className="px-md py-sm text-right font-semibold tabular-nums">{gbp(p.received)}</td>
                    <td colSpan={2} className="px-md py-sm text-xs text-neutral-600">
                      {p.statements.map(st => <span key={st.id} className="mr-sm whitespace-nowrap">{st.reference} · {st.state === 'paid' ? 'paid' : st.state}{st.source === 'import' ? ' (imported)' : ''}</span>)}
                    </td>
                    <td className="px-md py-sm">
                      {!prevAgent && p.readyForStatement > 0
                        ? <Link href={`/admin/statements/prepare?property=${p.id}&month=${month}`} className="whitespace-nowrap rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white">Prepare statement · {gbp(p.readyForStatement)}</Link>
                        : !prevAgent ? <span className="text-xs text-neutral-400">Nothing new to pay over</span> : null}
                    </td>
                  </tr>,
                  ...(isOpen ? p.rooms.map((r, i) => (
                    <tr key={p.id + i} className="border-t border-neutral-100">
                      <td className="px-md py-xs pl-xl text-neutral-900">{r.room}{r.chargeNo ? <span className="ml-sm font-mono text-[11px] text-neutral-400">{r.chargeNo}</span> : null}</td>
                      <td className="px-md py-xs text-neutral-700">{r.tenant}{r.reference ? <span className="ml-sm font-mono text-[11px] text-neutral-500">{r.reference}</span> : null}</td>
                      <td className="px-md py-xs text-right tabular-nums">{gbp(r.due)}</td>
                      <td className="px-md py-xs text-right tabular-nums">{gbp(r.received)}{r.difference != null && Math.abs(r.difference) >= 0.01 && r.received > 0 ? <span className={`block text-[11px] ${r.difference < 0 ? 'text-amber-700' : 'text-blue-700'}`}>{r.difference < 0 ? `${gbp(-r.difference)} short` : `${gbp(r.difference)} over`}</span> : null}</td>
                      <td className="whitespace-nowrap px-md py-xs text-xs">{r.receipts.map(x => shortDate(x.date)).filter(Boolean).join(', ')}</td>
                      <td className="px-md py-xs font-mono text-[11px] text-neutral-600">{r.receipts.map((x, k) => <span key={k} className="block">{[x.number, x.file].filter(Boolean).join(' · ') || x.how}</span>)}{r.statement ? <span className="block text-neutral-400">on {r.statement}</span> : null}</td>
                      <td className="px-md py-xs"><span className={`whitespace-nowrap rounded-full px-sm py-0.5 text-[11px] font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                    </tr>
                  )) : []),
                ]
              })}
              {!loading && roll && !props.length && <tr><td colSpan={7} className="px-md py-xl text-center text-sm text-neutral-500">Nothing to show for {monthLabel(month)} with this filter.</td></tr>}
            </tbody>
          </table>
        </div>
        {roll && !prevAgent && roll.properties.some(p => p.rooms.some(r => r.status === 'no_charge')) && (
          <p className="mt-sm text-xs text-neutral-500">“No charge raised” — rent charges are raised automatically on the 1st. To raise them now, use <Link href="/admin/rent-charges" className="underline">Rent charges</Link>.</p>
        )}
      </div>
    </div>
  )
}

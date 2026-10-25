'use client'

/**
 * /admin/rent-roll — step 1 of the monthly cycle.
 * Every room's rent for the month: what was due, what arrived (date, receipt number, bank file), what's missing,
 * and — per property — the rent received and not yet paid over, with "Prepare statement" (step 2) and a link to
 * the payment run (step 3). Months before CROS took over collecting show what the previous agent's statements say.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import RentSortOut from '@/components/RentSortOut'
import { isOfficeRole } from '@/lib/access/areas'
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
const shortDate = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '')

const STATUS: Record<RollRoom['status'], { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-800' },
  part: { label: 'Part paid', cls: 'bg-amber-100 text-amber-800' },
  missing: { label: 'Missing', cls: 'bg-red-100 text-red-700' },
  over: { label: 'Paid more', cls: 'bg-blue-100 text-blue-800' },
  no_charge: { label: 'No charge raised', cls: 'bg-neutral-200 text-neutral-700' },
  collected_by_previous_agent: { label: 'Imported — before go-live', cls: 'bg-neutral-100 text-neutral-600' },
}

export default function RentRollPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  return <RentRollScreen initialMonth={one(sp.month)} practice={one(sp.practice) === '1'} />
}

function RentRollScreen({ initialMonth, practice }: { initialMonth?: string; practice: boolean }) {
  const P = practice ? '&practice=1' : ''
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [roll, setRoll] = useState<RentRoll | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention' | 'ready'>('all')
  const [sel, setSel] = useState<string | null>(null)   // the property open on the right

  const load = useCallback(async (m: string) => {
    setLoading(true); setError('')
    const r = await adminFetch(`/api/admin/rent-roll?month=${m}${P}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not load the rent roll'); setRoll(null) } else setRoll(j)
    setLoading(false)
  }, [P])

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !isOfficeRole(u.assignment?.role)) { router.push('/login'); return }
      load(month)
    })()
  }, [router, load, month])

  const go = (m: string) => { setMonth(m); router.replace(`/admin/rent-roll?month=${m}${P}`) }
  // practice only: raise the demo houses' rent for the month, and record a tenant's payment (as the bank import would)
  const [busyPractice, setBusyPractice] = useState('')
  const [sortFor, setSortFor] = useState<string | null>(null)   // tenancy whose rent is being sorted out
  async function raisePractice() {
    setBusyPractice('raise')
    const r = await adminFetch('/api/accounts/generate-charges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: `${month}-01`, practice: true }) })
    const j = await r.json().catch(() => ({}))
    setBusyPractice(''); if (!r.ok) setError(j.error || 'Could not raise the rent'); else load(month)
  }
  async function recordPractice(chargeId: string, due: number, received: number) {
    const v = prompt('Practice payment received (£):', String(Math.max(0, Math.round((due - received) * 100) / 100)))
    if (!v || !(Number(v) > 0)) return
    setBusyPractice(chargeId)
    const r = await adminFetch(`/api/admin/rent-charges/${chargeId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount_received: Number(v), payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), payment_method: 'bank_transfer', payment_notes: 'Practice payment' }) })
    const j = await r.json().catch(() => ({}))
    setBusyPractice(''); if (!r.ok) setError(j.error || 'Could not record it'); else load(month)
  }
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
    <div className="min-h-screen fin">
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} title="Rent roll" />
      {practice && <div className="border-b-4 border-amber-400 bg-amber-300 px-lg py-sm text-center text-sm font-bold text-amber-950">PRACTICE MODE — demo houses only. Nothing here is real money; every entry gets an X number (XRENT, XLS, XPAY…) and stays out of the real books.</div>}
      <PageHero
        eyebrow={practice ? 'PRACTICE · step 1 of 3 · monthly cycle' : 'Step 1 of 3 · monthly cycle'}
        title="Rent roll"
        subtitle={<>{monthLabel(month)} — what’s due, what’s in, what’s missing. Then prepare each property’s statement, then the payment run.</>}
        actions={<>
          <HeroMonthPicker month={month} onChange={go} />
          {practice
            ? <><HeroButton primary onClick={raisePractice}>{busyPractice === 'raise' ? 'Raising…' : 'Raise this month’s practice rent'}</HeroButton><HeroButton onClick={async () => { const r = await adminFetch('/api/admin/rent-roll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'practice_refs' }) }); const j = await r.json().catch(() => ({})); alert(r.ok ? `${j.filled} practice tenanc${j.filled === 1 ? 'y' : 'ies'} given a payment reference` : j.error); load(month) }}>Give practice tenants references</HeroButton><HeroButton href="/admin/bank-import?practice=1">Practice bank import</HeroButton><HeroButton href={`/admin/rent-roll?month=${month}`}>Leave practice</HeroButton></>
            : <><HeroButton href="/admin/bank-import" primary>Import bank CSV</HeroButton><HeroButton href={`/admin/rent-roll?month=${month}&practice=1`}>Practice mode</HeroButton></>}
        </>}
        stats={roll ? [
          { label: prevAgent ? 'Rent collected' : 'Rent due', value: gbp(prevAgent ? roll.totals.received : roll.totals.due) },
          { label: 'Received', value: gbp(roll.totals.received), tone: 'good' },
          { label: 'Missing', value: gbp(roll.totals.missing), tone: roll.totals.missing > 0 ? 'bad' : undefined },
          { label: 'Ready to pay', value: gbp(roll.totals.ready), tone: 'warn' },
        ] : undefined}
        tabs={financeTabs('rent-roll', month)}
      />
      <div className="mx-auto max-w-6xl px-lg py-lg">
        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}
        {prevAgent && <p className="mb-md rounded-xl border border-neutral-200 bg-white px-lg py-md text-sm text-neutral-600">{monthLabel(month)} is before CROS took over collecting rent ({shortDate(roll!.takeover)}). This shows the rent on the statements imported for that month — collected and paid to landlords before CROS went live.</p>}

        <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
          <div className="inline-flex rounded-xl bg-white p-0.5 text-xs font-semibold">
            {([['all', 'All properties'], ['attention', 'Needs attention'], ['ready', 'Ready to pay']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-md py-xs ${filter === k ? 'bg-[#181614] text-white' : 'text-neutral-600'}`}>{l}</button>
            ))}
          </div>
          <ExportButtons title={`Rent roll ${monthLabel(month)}`} filename={`rent-roll-${month}`}
            columns={[{ key: 'property', label: 'Property' }, { key: 'room', label: 'Room' }, { key: 'tenant', label: 'Tenant' }, { key: 'reference', label: 'Ref' },
              { key: 'due', label: 'Due', money: true }, { key: 'received', label: 'Received', money: true }, { key: 'difference', label: 'Diff', money: true },
              { key: 'date', label: 'Date in' }, { key: 'receipt', label: 'Receipt · file' }, { key: 'status', label: 'Status' }, { key: 'statement', label: 'Statement' }]}
            rows={exportRows} totals={roll ? { property: 'Total', due: roll.totals.due, received: roll.totals.received } : undefined} />
        </div>

        <div className="grid grid-cols-1 gap-md lg:grid-cols-[minmax(0,1fr)_460px]">
          {/* ── Properties — a ledger table (17 Oct 2026) ── */}
          <section className="ledger-card h-fit">
            <div className="overflow-x-auto">
              <table>
                <thead><tr>
                  <th>Property</th><th className="hidden sm:table-cell">Rooms</th>
                  {!prevAgent && <th className="text-right">Due</th>}<th className="text-right">Received</th>{!prevAgent && <th className="text-right">Missing</th>}
                </tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={5} className="text-center text-neutral-500">Loading…</td></tr>}
                  {!loading && props.map(p => {
                    const on = selected?.id === p.id
                    return (
                      <tr key={p.id} onClick={() => pick(p.id)} aria-selected={on} className={`cursor-pointer ${on ? '[&>td]:!bg-[#181614] [&>td]:!text-[#F6F3EC]' : ''}`}>
                        <td className="max-w-[260px]">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className={`block truncate text-[11px] ${on ? 'opacity-60' : 'text-neutral-500'}`}>{p.landlord}{p.readyForStatement > 0 && !prevAgent ? <span className={on ? 'text-[#E8B06B]' : 'text-amber-700'}> · ready {gbp(p.readyForStatement)}</span> : null}</span>
                        </td>
                        <td className="hidden sm:table-cell whitespace-nowrap">{paidCount(p)}/{p.rooms.length} paid</td>
                        {!prevAgent && <td className="text-right">{gbp(p.due)}</td>}
                        <td className="text-right font-semibold">{gbp(p.received)}</td>
                        {!prevAgent && <td className={`text-right ${p.missing > 0 ? (on ? 'text-[#F28B82]' : 'text-red-700 font-semibold') : 'text-neutral-400'}`}>{p.missing > 0 ? gbp(p.missing) : '—'}</td>}
                      </tr>
                    )
                  })}
                  {!loading && roll && !props.length && <tr><td colSpan={5} className="text-center text-neutral-500">Nothing to show for {monthLabel(month)} with this filter.</td></tr>}
                </tbody>
                {!loading && props.length > 0 && (
                  <tfoot><tr>
                    <td>{props.length} propert{props.length === 1 ? 'y' : 'ies'}</td><td className="hidden sm:table-cell">{props.reduce((n, p) => n + paidCount(p), 0)}/{props.reduce((n, p) => n + p.rooms.length, 0)} paid</td>
                    {!prevAgent && <td className="text-right">{gbp(props.reduce((n, p) => n + p.due, 0))}</td>}<td className="text-right">{gbp(props.reduce((n, p) => n + p.received, 0))}</td>
                    {!prevAgent && <td className="text-right">{gbp(props.reduce((n, p) => n + p.missing, 0))}</td>}
                  </tr></tfoot>
                )}
              </table>
            </div>
          </section>

          {/* ── The selected property ── */}
          <aside id="rr-detail" className="h-fit space-y-md rounded-[10px] border border-[#D6DCE3] bg-white p-md lg:sticky lg:top-md">
            {!selected ? <p className="text-sm text-neutral-500">Choose a property.</p> : <>
              <div>
                {selected.code && <p className="font-mono text-[11px] text-neutral-500">{selected.code}</p>}
                <h2 className="text-xl font-extrabold text-neutral-900" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{selected.name}</h2>
                <p className="text-sm text-neutral-600">{selected.landlord} · {selected.rooms.length} room{selected.rooms.length === 1 ? '' : 's'}{prevAgent ? '' : ` · ${gbp(selected.due)} due`} · {gbp(selected.received)} in</p>
              </div>
              <div className="ledger-card overflow-x-auto">
                <table>
                  <thead><tr><th>Room</th><th>Tenant</th><th>Status</th>{!prevAgent && <th className="text-right">Due</th>}<th className="text-right">In</th></tr></thead>
                  <tbody>
                    {selected.rooms.map((r, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap font-semibold">{r.room}</td>
                        <td className="max-w-[150px]">
                          <span className="block truncate">{r.tenancyId ? <Link href={`/admin/lettings/${r.tenancyId}?tab=money&from=${encodeURIComponent(`/admin/rent-roll?month=${month}`)}`} className="text-blue-700 hover:underline">{r.tenant}</Link> : r.tenant}</span>
                          <span className="block text-[10.5px] text-neutral-500">
                            {[r.reference, r.chargeNo, ...r.receipts.map(x => [shortDate(x.date), x.number].filter(Boolean).join(' ') || x.how), r.statement ? `on ${r.statement}` : ''].filter(Boolean).join(' · ')}
                            {r.difference != null && Math.abs(r.difference) >= 0.01 && r.received > 0 && <span className={r.difference < 0 ? ' text-amber-700' : ' text-blue-700'}> · {r.difference < 0 ? `${gbp(-r.difference)} short` : `${gbp(r.difference)} over`}</span>}
                          </span>
                          {(!prevAgent && r.tenancyId) || (practice && r.chargeId && r.due != null && r.received < r.due) ? (
                            <span className="mt-0.5 flex gap-1">
                              {!prevAgent && r.tenancyId && <button type="button" onClick={() => setSortFor(r.tenancyId)} className="rounded border border-neutral-300 bg-white px-1.5 text-[10.5px] font-semibold text-neutral-800 hover:bg-neutral-100">Adjust account…</button>}
                              {practice && r.chargeId && r.due != null && r.received < r.due && <button type="button" disabled={!!busyPractice} onClick={() => recordPractice(r.chargeId!, r.due!, r.received)} className="rounded border border-amber-400 bg-amber-50 px-1.5 text-[10.5px] font-semibold text-amber-900">{busyPractice === r.chargeId ? 'Recording…' : 'Record practice payment'}</button>}
                            </span>
                          ) : null}
                        </td>
                        <td><span className={`whitespace-nowrap rounded px-1.5 py-px text-[10.5px] font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                        {!prevAgent && <td className="text-right">{r.due != null ? gbp(r.due) : '—'}</td>}
                        <td className="text-right font-semibold">{gbp(r.received)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected.statements.length > 0 && (
                <p className="text-xs text-neutral-600">Statements: {selected.statements.map(st => `${st.reference} · ${st.state === 'paid' ? 'paid' : st.state}${st.source === 'import' ? ' (imported)' : ''}`).join(' · ')}</p>
              )}
              {!prevAgent && (selected.readyForStatement > 0
                ? <Link href={`/admin/statements/prepare?property=${selected.id}&month=${month}${P}`} className="block rounded-xl bg-[#181614] py-sm text-center text-sm font-bold text-white hover:bg-black">Prepare statement · {gbp(selected.readyForStatement)}</Link>
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
      {sortFor && <RentSortOut tenancyId={sortFor} onClose={() => setSortFor(null)} onChanged={() => load(month)} />}
    </div>
  )
}

'use client'

/**
 * /admin/rents-due — Rents due (3 Nov 2026, look C). Every active tenancy whose rent isn't fully in this month,
 * grouped by house: nothing in, part paid, or no charge raised yet (Harry: "if their tenancy is active rent is due",
 * up to the end date, pro rata). Tick tenants and "Chase selected" opens Rent Chase with just them; each line goes
 * to the tenancy's Messages and Money tabs. Data: /api/admin/finance-dashboard.
 */

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { getCurrentUser } from '@/lib/auth'
import { isOfficeRole } from '@/lib/access/areas'
import { adminFetch } from '@/lib/adminFetch'
import AppBar from '@/components/AppBar'
import HeroMonthPicker from '@/components/HeroMonthPicker'
import BackButton from '@/app/components/BackButton'
import { C, display, PageHead, Pill } from '@/app/components/financeLook'

interface Item { property: string; propertyId: string; room: string; tenant: string; tenancyId: string | null; owed: number; status: string; received: number; ends: string | null }
type Filter = 'missing' | 'part' | 'no_charge'

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const full = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const LABEL: Record<Filter, string> = { missing: 'Nothing in', part: 'Part paid', no_charge: 'Not raised' }

export default function RentsDuePage({ searchParams }: { searchParams: PageSearchParams }) {
  return <RentsDue initialMonth={one(use(searchParams).month)} />
}

function RentsDue({ initialMonth }: { initialMonth?: string }) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [items, setItems] = useState<Item[] | null>(null)
  const [paid, setPaid] = useState(0)
  const [collects, setCollects] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter | null>(null)
  const [tick, setTick] = useState<Record<string, boolean>>({})

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !isOfficeRole(u.assignment?.role)) { router.push('/login'); return }
      setItems(null); setError(''); setTick({})
      const r = await adminFetch(`/api/admin/finance-dashboard?month=${month}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Could not load'); return }
      setItems(j.due.items); setPaid(j.due.paid ?? 0); setCollects(j.collectsRent !== false)
    })()
  }, [router, month])

  const go = (m: string) => { setMonth(m); router.replace(`/admin/rents-due?month=${m}`) }
  const count = (f: Filter) => (items ?? []).filter(i => i.status === f).length
  const houses = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of (items ?? []).filter(i => !filter || i.status === filter)) m.set(i.property, [...(m.get(i.property) ?? []), i])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  }, [items, filter])
  const chosen = Object.keys(tick).filter(k => tick[k])

  const note = (i: Item) => {
    const end = i.ends && i.ends.slice(0, 7) === month ? ` · ends ${full(i.ends)}, pro rata` : ''
    if (i.status === 'no_charge') return `No rent raised yet${end}`
    if (i.status === 'part') return `Part paid ${gbp(i.received)}${end}`
    return `Nothing in yet${end}`
  }

  return (
    <div className={`min-h-screen ${C.ground}`}>
      <AppBar left={<BackButton href={`/admin/finance?month=${month}`} label="Agency accounts" />} title="Rents due" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <PageHead eyebrow="Every active tenancy whose rent isn’t fully in" title="Rents due" right={
          <div className="flex flex-wrap items-center gap-sm">
            <span className="inline-flex rounded-full bg-[#4A5320] px-sm py-[2px]"><HeroMonthPicker month={month} onChange={go} /></span>
            {collects && <Pill tone="mustard" href={`/admin/rent-chase${chosen.length ? `?only=${chosen.join(',')}` : ''}`}>{chosen.length ? `Chase ${chosen.length} selected` : 'Chase'}</Pill>}
            <Pill tone="paper" second href="/admin/bank-import">Import bank CSV</Pill>
            {collects && count('no_charge') > 0 && <Pill tone="paper" second href="/admin/rent-charges">Raise {count('no_charge')} rents</Pill>}
          </div>
        } />
        {!collects && <p className={`mb-md rounded-2xl px-lg py-md text-sm ${C.paper}`}><b>Statements only.</b> Rent is collected in your other system — this list is for checking, nothing here chases or raises rent.</p>}
        {error && <p className="mb-md rounded-2xl bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}

        <div className="mb-lg flex flex-wrap gap-sm text-sm font-semibold">
          <button type="button" onClick={() => setFilter(null)} className={`rounded-full px-md py-xs ${!filter ? 'bg-[#E8B931]' : 'bg-[#FFFDF6]'}`}>All {items?.length ?? ''}</button>
          {(['missing', 'part', 'no_charge'] as Filter[]).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-md py-xs ${filter === f ? 'bg-[#E8B931]' : 'bg-[#FFFDF6]'}`}>{LABEL[f]} {items ? count(f) : ''}</button>
          ))}
          <Link href={`/admin/rent-roll?month=${month}`} className="rounded-full bg-[#FFFDF6] px-md py-xs">Paid {paid} ›</Link>
        </div>

        {!items && !error && <div className="h-40 animate-pulse rounded-[22px] bg-[#FFFDF6]" />}
        {items && !houses.length && <p className={`rounded-[22px] px-lg py-lg ${C.olive}`}>Every rent is in for this month.</p>}
        <div className="flex flex-col gap-md">
          {houses.map(([house, rows]) => (
            <section key={house} className={`rounded-[22px] px-lg py-md ${C.paper}`}>
              <div className={`${display.className} flex justify-between text-xl font-extrabold`}>
                <Link href={`/admin/properties/${rows[0].propertyId}`} className="hover:underline">{house}</Link>
                <span className="tabular-nums">{gbp(rows.reduce((t, r) => t + r.owed, 0))}</span>
              </div>
              <ul>
                {rows.map((r, i) => (
                  <li key={r.tenancyId ?? `${r.room}${i}`} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-md gap-y-xs border-t border-[#E7E2CF] py-sm text-sm sm:grid-cols-[1.5rem_1.4fr_1fr_7rem_auto]">
                    <input type="checkbox" disabled={!r.tenancyId} checked={!!(r.tenancyId && tick[r.tenancyId])} onChange={e => r.tenancyId && setTick(t => ({ ...t, [r.tenancyId!]: e.target.checked }))} className="h-4 w-4 accent-[#4A5320]" aria-label={`Select ${r.tenant || r.room}`} />
                    <span className="font-semibold">{r.room}{r.tenant ? ` · ${r.tenant}` : ''}</span>
                    <span className={`col-start-2 ${C.muted} sm:col-start-auto`}>{note(r)}</span>
                    <span className="row-start-1 text-right font-semibold tabular-nums sm:row-start-auto">{gbp(r.owed)}</span>
                    {r.tenancyId && (
                      <span className="col-start-2 flex gap-sm text-xs font-semibold text-[#4A5320] sm:col-start-auto">
                        <Link href={`/admin/lettings/${r.tenancyId}?tab=messages`} className="hover:underline">Messages</Link>
                        <Link href={`/admin/lettings/${r.tenancyId}?tab=money`} className="hover:underline">Money ›</Link>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * /admin/finance — Finance home (1 Nov 2026, Harry's sketch "Agency accounts summary"). Six tiles, each one process:
 * Ready to pay · Rents due · Expenses · Last statements · Import diary · Client account. Each shows its count and
 * opens in place to the list behind it, every line a link to the screen that deals with it. Kept minimal.
 * Data: /api/admin/finance-dashboard.
 */

import { use, useCallback, useEffect, useState } from 'react'
import { isOfficeRole } from '@/lib/access/areas'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { getCurrentUser } from '@/lib/auth'
import { adminFetch } from '@/lib/adminFetch'
import AppBar from '@/components/AppBar'
import HeroMonthPicker from '@/components/HeroMonthPicker'
import BackButton from '@/app/components/BackButton'

interface Dash {
  ready: { count: number; total: number; items: { id: string; name: string; landlord: string; amount: number; part: boolean }[] }
  due: { count: number; total: number; waitingHouses: number; notRaised: number; items: { property: string; propertyId: string; room: string; tenant: string; tenancyId: string | null; owed: number }[] }
  expenses: { count: number; total: number; houses: { propertyId: string; house: string; count: number; total: number }[] }
  statements: { items: { id: string; house: string; landlord: string; reference: string; date: string; net: number; state: string }[] }
  imports: { last: { at: string; from: string; to: string; file: string } | null; coveredTo: string | null; daysBehind: number | null }
  client: { held: number; agrees: boolean } | null
}

const gbp = (n: number | null | undefined) => (n == null ? '—' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const short = (d: string | null | undefined) => d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })

export default function FinanceHomePage({ searchParams }: { searchParams: PageSearchParams }) {
  return <FinanceHomeScreen initialMonth={one(use(searchParams).month)} />
}

function FinanceHomeScreen({ initialMonth }: { initialMonth?: string }) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [d, setD] = useState<Dash | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async (m: string) => {
    setError(''); setD(null)
    const r = await adminFetch(`/api/admin/finance-dashboard?month=${m}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setError(j.error || 'Could not load'); else setD(j)
  }, [])

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !isOfficeRole(u.assignment?.role)) { router.push('/login'); return }
      load(month)
    })()
  }, [router, load, month])

  const go = (m: string) => { setMonth(m); setOpen(null); router.replace(`/admin/finance?month=${m}`) }
  const q = `?month=${month}`
  const behind = d?.imports.daysBehind

  return (
    <div className="min-h-screen bg-[#F4F4F2]">
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} title="Finance" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900">Agency accounts</h1>
          <HeroMonthPicker month={month} onChange={go} />
        </div>
        {error && <p className="mb-md rounded-2xl bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}

        <div className="grid items-start gap-md md:grid-cols-2 lg:grid-cols-3">
          {!d && !error && [1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-48 animate-pulse rounded-3xl bg-white" />)}
          {d && <>
            <Tile id="ready" open={open} setOpen={setOpen} tone={d.ready.count ? 'green' : 'none'}
              title="Ready to pay" big={String(d.ready.count)} sub={d.ready.count ? `${gbp(d.ready.total)} · every rent in` : 'No house has all its rent in yet'}
              actions={[{ label: 'Payment run', href: `/admin/payment-run${q}` }]}>
              {d.ready.items.map(r => (
                <Row key={r.id} href={`/admin/statements/prepare?property=${r.id}&month=${month}`} left={r.name} sub={`${r.landlord}${r.part ? ' · paying part now' : ''}`} right={gbp(r.amount)} cta="Prepare" />
              ))}
            </Tile>

            <Tile id="due" open={open} setOpen={setOpen} tone={d.due.count || d.due.notRaised ? 'amber' : 'green'}
              title="Rents due" big={String(d.due.count)} sub={d.due.notRaised ? `${d.due.notRaised} room${d.due.notRaised === 1 ? '' : 's'} with no rent raised for this month yet${d.due.count ? ` · ${gbp(d.due.total)} outstanding` : ''}` : d.due.count ? `${gbp(d.due.total)} outstanding${d.due.waitingHouses ? ` · ${d.due.waitingHouses} house${d.due.waitingHouses === 1 ? '' : 's'} waiting` : ''}` : 'Every rent is in'}
              actions={[{ label: 'Import bank CSV', href: '/admin/bank-import' }, ...(d.due.count ? [{ label: 'Chase', href: '/admin/rent-chase' }] : []), ...(d.due.notRaised ? [{ label: `Raise ${d.due.notRaised} rents`, href: '/admin/rent-charges' }] : [])]}>
              {d.due.items.map((r, i) => (
                <Row key={i} href={r.tenancyId ? `/admin/lettings/${r.tenancyId}?tab=money` : `/admin/rent-roll${q}`} left={r.tenant || r.room} sub={`${r.room}, ${r.property}`} right={gbp(r.owed)} />
              ))}
            </Tile>

            <Tile id="exp" open={open} setOpen={setOpen} tone="none"
              title="Expenses" big={String(d.expenses.count)} sub={d.expenses.count ? `${gbp(d.expenses.total)} waiting to go on statements` : 'Nothing waiting'}
              actions={[{ label: 'Add expense', href: '/admin/expense-log' }, { label: 'Upload invoice', href: '/admin/capture' }]}>
              {d.expenses.houses.map(h => (
                <Row key={h.propertyId ?? h.house} href={`/admin/expense-log${h.propertyId ? `?property=${h.propertyId}` : ''}`} left={h.house} sub={`${h.count} expense${h.count === 1 ? '' : 's'}`} right={gbp(h.total)} />
              ))}
            </Tile>

            <Tile id="st" open={open} setOpen={setOpen} tone="none"
              title="Last statements" big={String(d.statements.items.length)} sub="The latest statement for each house"
              actions={[{ label: 'All statements', href: '/admin/statements' }]}>
              {d.statements.items.map(st => (
                <Row key={st.id} href={`/admin/statements?id=${st.id}`} left={st.house} sub={`${st.reference} · ${short(st.date)} · ${st.state}`} right={gbp(st.net)} />
              ))}
            </Tile>

            <Tile id="imp" open={open} setOpen={setOpen} tone={behind == null ? 'red' : behind > 1 ? 'amber' : 'green'}
              title="Import diary" big={d.imports.coveredTo ? short(d.imports.coveredTo) : 'None'}
              sub={d.imports.last ? `Covered to here · last import ${when(d.imports.last.at)}${behind ? ` · ${behind} day${behind === 1 ? '' : 's'} not imported` : ''}` : 'No bank statement imported yet'}
              actions={[{ label: 'Bank calendar', href: '/admin/bank-calendar' }, { label: 'Import', href: '/admin/bank-import' }]} />

            <Tile id="cl" open={open} setOpen={setOpen} tone={d.client ? (d.client.agrees ? 'green' : 'red') : 'none'}
              title="Client account" big={gbp(d.client?.held)} sub={d.client ? (d.client.agrees ? 'Ledgers agree' : 'Ledgers don’t agree — check') : ''}
              actions={[{ label: 'Reconcile', href: '/admin/client-money' }, { label: 'Reports', href: '/admin/reports/fees' }]} />
          </>}
        </div>
      </div>
    </div>
  )
}

const DOT = { red: 'bg-red-500', amber: 'bg-amber-400', green: 'bg-emerald-500', none: 'bg-neutral-300' }

function Tile({ id, open, setOpen, tone, title, big, sub, actions, children }: {
  id: string; open: string | null; setOpen: (v: string | null) => void; tone: keyof typeof DOT
  title: string; big: string; sub: string; actions: { label: string; href: string }[]; children?: React.ReactNode
}) {
  const list = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : []
  const isOpen = open === id
  return (
    <div className="flex flex-col rounded-3xl bg-white p-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[tone]}`} aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      </div>
      <p className="mt-sm text-4xl font-black tabular-nums tracking-tight text-neutral-900">{big}</p>
      <p className="mt-xs min-h-[1.25rem] text-sm text-neutral-600">{sub}</p>
      <div className="mt-md flex flex-wrap items-center gap-sm">
        {actions.map((a, i) => (
          <Link key={a.href} href={a.href} className={`rounded-full px-md py-xs text-sm font-semibold ${i === 0 ? 'bg-neutral-900 text-white hover:bg-black' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'}`}>{a.label}</Link>
        ))}
        {list.length > 0 && (
          <button type="button" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen} className="ml-auto text-sm font-semibold text-neutral-700 hover:text-neutral-900">
            {isOpen ? 'Hide' : `Show ${list.length}`} <span aria-hidden>{isOpen ? '▴' : '▾'}</span>
          </button>
        )}
      </div>
      {isOpen && <ul className="mt-md max-h-80 divide-y divide-neutral-100 overflow-y-auto border-t border-neutral-100">{list}</ul>}
    </div>
  )
}

function Row({ href, left, sub, right, cta }: { href: string; left: string; sub?: string; right: string; cta?: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-md py-sm hover:bg-neutral-50">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-neutral-900">{left}</span>
          {sub && <span className="block truncate text-xs text-neutral-500">{sub}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-sm">
          <span className="text-sm font-semibold tabular-nums">{right}</span>
          {cta && <span className="rounded-full bg-neutral-900 px-sm py-[2px] text-xs font-bold text-white">{cta}</span>}
        </span>
      </Link>
    </li>
  )
}

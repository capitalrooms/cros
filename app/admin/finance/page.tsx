'use client'

/**
 * /admin/finance — Finance home (1 Nov 2026, Harry: "just a list of tiles with processes in each large tile … way too
 * confusing and busy … minimal … more modern bank like"). One card for the client account, then one large tile per
 * process — money in, rent, paying landlords, expenses & invoices, the client account, reports — each with a single
 * line saying where it's at and the one or two things to do. Agency income lives under Reports.
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

interface Todo { key: string; tone: 'red' | 'amber' | 'green' | 'grey'; title: string; detail?: string; href: string; action: string }
interface Home {
  month: string; source: string; todos: Todo[]
  numbers: { due: number; received: number; missing: number; heldInClientAccount: number; agrees: boolean; toLandlords: number; statementRent?: number; fees: number; expenses?: number | null; statements?: number | null }
}
interface Tile { title: string; status: string; tone: 'red' | 'amber' | 'green' | 'none'; actions: { label: string; href: string }[] }

const gbp = (n: number | null | undefined) => (n == null ? '—' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const monthLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const DOT = { red: 'bg-red-500', amber: 'bg-amber-400', green: 'bg-emerald-500', none: 'bg-neutral-300' }

export default function FinanceHomePage({ searchParams }: { searchParams: PageSearchParams }) {
  return <FinanceHomeScreen initialMonth={one(use(searchParams).month)} />
}

function FinanceHomeScreen({ initialMonth }: { initialMonth?: string }) {
  const router = useRouter()
  const [month, setMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<Home | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (m: string) => {
    setError('')
    const r = await adminFetch(`/api/admin/finance-home?month=${m}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not load the month'); setData(null) } else setData(j)
  }, [])

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !isOfficeRole(u.assignment?.role)) { router.push('/login'); return }
      load(month)
    })()
  }, [router, load, month])

  // the month's accounts pack for the accountant (lib/finance/accountantPack): a zip, made when pressed
  const [packing, setPacking] = useState(false)
  async function pack() {
    setPacking(true)
    const r = await adminFetch(`/api/admin/accountant-pack?month=${month}&link=1`)
    const d = await r.json().catch(() => ({}))
    setPacking(false)
    if (!r.ok || !d.url) { setError(d.error || 'The pack couldn’t be made'); return }
    window.location.href = d.url
  }
  const go = (m: string) => { setMonth(m); router.replace(`/admin/finance?month=${m}`) }
  const n = data?.numbers
  const todo = (k: string) => data?.todos.find(t => t.key === k)
  const q = `?month=${month}`

  const tiles: Tile[] = !data || !n ? [] : [
    (() => {
      const t = todo('unmatched')
      return { title: 'Money in', tone: t ? 'amber' : 'green', status: t ? `${t.title} · ${t.detail}` : 'Every payment imported is matched',
        actions: [{ label: 'Import statement', href: '/admin/bank-import' }, { label: 'Bank calendar', href: '/admin/bank-calendar' }, ...(t ? [{ label: 'Match', href: '/admin/reconciliation' }] : [])] }
    })(),
    (() => {
      const arrears = todo('arrears')
      if (data.source !== 'cros') return { title: 'Rent', tone: 'none', status: `${gbp(n.statementRent ?? n.received)} collected by the previous agent`, actions: [{ label: 'Rent roll', href: `/admin/rent-roll${q}` }] }
      return { title: 'Rent', tone: n.missing > 0 ? (arrears?.tone === 'red' ? 'red' : 'amber') : 'green',
        status: n.missing > 0 ? `${gbp(n.received)} of ${gbp(n.due)} in · ${gbp(n.missing)} still to come` : `All ${gbp(n.due)} in`,
        actions: [{ label: 'Rent roll', href: `/admin/rent-roll${q}` }, ...(n.missing > 0 ? [{ label: 'Chase rent', href: '/admin/rent-chase' }] : [])] }
    })(),
    (() => {
      const ready = todo('ready'), drafts = todo('drafts'), pay = todo('pay')
      const next = pay ?? drafts ?? ready
      return { title: 'Pay landlords', tone: next ? 'amber' : 'green', status: next ? `${next.title}${next.detail ? ` · ${next.detail}` : ''}` : `${gbp(n.toLandlords)} paid this month`,
        actions: [{ label: 'Statements', href: `/admin/rent-roll${q}` }, { label: 'Payment run', href: `/admin/payment-run${q}` }] }
    })(),
    { title: 'Expenses & invoices', tone: 'none', status: `${gbp(n.expenses ?? 0)} charged to landlords this month`,
      actions: [{ label: 'Expenses', href: '/admin/expense-log' }, { label: 'Raise an invoice', href: '/admin/document-generator?mode=invoice' }, { label: 'Contractor invoices', href: '/admin/supplier-invoices' }] },
    (() => {
      const bad = todo('ledger'), deposits = todo('deposits'), close = todo('close')
      return { title: 'Client account', tone: bad || deposits ? 'red' : close ? 'amber' : 'green',
        status: bad ? 'Ledgers don’t agree — check' : deposits ? deposits.title : close ? close.title : 'Ledgers agree',
        actions: [{ label: 'Reconcile', href: '/admin/client-money' }, { label: 'Deposits', href: '/admin/deposits' }] }
    })(),
    { title: 'Reports', tone: 'none', status: `Agency income ${gbp(n.fees)} this month`,
      actions: [{ label: 'Agency income', href: '/admin/reports/fees' }, { label: 'MTD', href: '/admin/reports/mtd' }, { label: 'Accountant pack', href: '#pack' }] },
  ]

  return (
    <div className="min-h-screen bg-[#F4F4F2]">
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} title="Finance" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900">Finance</h1>
          <HeroMonthPicker month={month} onChange={go} />
        </div>

        {error && <p className="mb-md rounded-2xl bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}

        {/* the client account, like the top of a banking app */}
        <Link href="/admin/client-money" className="mb-lg block rounded-3xl bg-[#141414] px-xl py-xl text-white transition hover:bg-black">
          <p className="text-sm text-neutral-400">Client account · {monthLabel(month)}</p>
          <p className="mt-xs text-4xl font-black tabular-nums tracking-tight md:text-5xl">{n ? gbp(n.heldInClientAccount) : '—'}</p>
          {n && <p className={`mt-sm text-sm ${n.agrees ? 'text-emerald-400' : 'text-red-400'}`}>{n.agrees ? 'Ledgers agree' : 'Ledgers don’t agree — check'}</p>}
        </Link>

        <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
          {!data && !error && [1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-44 animate-pulse rounded-3xl bg-white" />)}
          {tiles.map(t => (
            <div key={t.title} className="flex min-h-[11rem] flex-col justify-between rounded-3xl bg-white p-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div>
                <div className="flex items-center gap-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${DOT[t.tone]}`} aria-hidden />
                  <h2 className="text-xl font-bold text-neutral-900">{t.title}</h2>
                </div>
                <p className="mt-sm text-[15px] leading-snug text-neutral-600">{t.status}</p>
              </div>
              <div className="mt-lg flex flex-wrap gap-sm">
                {t.actions.map((a, i) => a.href === '#pack' ? (
                  <button key={a.href} type="button" onClick={pack} disabled={packing} className="rounded-full bg-neutral-100 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-200 disabled:opacity-50">{packing ? 'Putting it together…' : a.label}</button>
                ) : (
                  <Link key={a.href} href={a.href} className={`rounded-full px-md py-xs text-sm font-semibold ${i === 0 ? 'bg-neutral-900 text-white hover:bg-black' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'}`}>{a.label}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

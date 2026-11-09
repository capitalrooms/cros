'use client'

/**
 * /admin/finance — Finance home, look C olive & mustard (3 Nov 2026) (1 Nov 2026, Harry's sketch "Agency accounts summary"). Six tiles, each one process:
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
import { C, display, Pill, type Tone } from '@/app/components/financeLook'

interface Dash {
  collectsRent: boolean
  ready: { count: number; total: number; items: { id: string; name: string; landlord: string; amount: number; part: boolean }[]; letOnly: { tenancyId: string; name: string; landlord: string; tenant: string; start: string; amount: number; step: 'pay' | 'record' | 'close' }[] }
  due: { count: number; total: number; waitingHouses: number; notRaised: number; items: { property: string; propertyId: string; room: string; tenant: string; tenancyId: string | null; owed: number; status: string; received: number; ends: string | null }[]; paid: number }
  expenses: { count: number; total: number; houses: { propertyId: string; house: string; count: number; total: number }[] }
  statements: { items: { id: string; house: string; landlord: string; reference: string; date: string; net: number; state: string }[] }
  imports: { last: { at: string; from: string; to: string; file: string } | null; coveredTo: string | null; daysBehind: number | null }
  client: { held: number; agrees: boolean } | null
  holdingToApply: { tenancyId: string; number: string; amount: number; house: string; tenant: string; moved: string }[]
  depositHolderMissing: number
  retainNotices: { applicantId: string | null; tenancyId: string | null; number: string; amount: number; who: string; decided: string; by: string }[]
  depositsToDps: { tenancyId: string; amount: number; house: string; tenant: string; received: string; days: number }[]
  holdingPastDeadline: { tenancyId: string | null; number: string; amount: number; house: string; tenant: string; received: string }[]
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

  // the figures start loading straight away; who's signed in is checked alongside (the admin layout checks it too)
  useEffect(() => {
    load(month)
    getCurrentUser().then(u => { if (!u || !isOfficeRole(u.assignment?.role)) router.push('/login') })
  }, [router, load, month])

  const go = (m: string) => { setMonth(m); setOpen(null); router.replace(`/admin/finance?month=${m}`) }
  const q = `?month=${month}`
  const behind = d?.imports.daysBehind

  const held = d?.client?.held
  return (
    <div className={`min-h-screen ${C.ground}`}>
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} title="Finance" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
          <div>
            <span className="inline-flex rounded-full bg-[var(--band,#1F3B2E)]"><HeroMonthPicker month={month} onChange={go} /></span>
            <h1 className={`${display.className} mt-xs text-4xl font-extrabold tracking-tight ${C.ink}`}>Agency accounts</h1>
          </div>
          <div className="flex items-center gap-md">
            {/* practice mode (migration 209): the demo house, X numbers, never the real books — try the whole cycle safely */}
            <Pill tone="paper" second href="/admin/rent-roll?practice=1">Practice mode</Pill>
            <More />
            <Link href="/admin/client-money" className={`rounded-[22px] px-lg py-md text-right ${C.olive}`}>
              <span className="block text-xs opacity-80">Client account{d?.client ? (d.client.agrees ? ' · ledgers agree' : ' · ledgers don’t agree') : ''}</span>
              <span className={`${display.className} block text-3xl font-extrabold tabular-nums`}>{held == null ? '—' : gbp(held)}</span>
            </Link>
          </div>
        </div>
        {d && !d.collectsRent && <p className={`mb-md rounded-2xl px-lg py-md text-sm ${C.paper}`}><b>Statements only.</b> Rent is collected in your other system; CROS mirrors the statements you add. Nothing here raises, chases or pays rent until you switch CROS to collecting rent.</p>}
        {error && <p className="mb-md rounded-2xl bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}

        <div className="grid items-start gap-md md:grid-cols-2 lg:grid-cols-3">
          {!d && !error && [1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-56 animate-pulse rounded-[28px] bg-[var(--paper,#FFFDF6)]" />)}
          {d && <>
            <Tile id="ready" open={open} setOpen={setOpen} tone="olive"
              title="Ready to pay" big={String(d.ready.count)} sub={d.ready.count ? [d.ready.items.length && `${d.ready.items.length} house${d.ready.items.length === 1 ? '' : 's'} with every rent in`, d.ready.letOnly.length && `${d.ready.letOnly.length} let-only move-in${d.ready.letOnly.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ') + (d.ready.total ? ` · ${gbp(d.ready.total)}` : '') : 'Nothing to pay out yet'}
              actions={[{ label: 'Rent Roll', href: `/admin/rent-roll${q}` }, { label: 'Payment run', href: `/admin/payment-run${q}` }]}>
              {d.ready.items.map(r => (
                <Row key={r.id} href={`/admin/statements/prepare?property=${r.id}&month=${month}`} left={r.name} sub={`${r.landlord}${r.part ? ' · paying part now' : ''}`} right={gbp(r.amount)} cta="Prepare" />
              ))}
              {d.ready.letOnly.map(l => (
                <Row key={l.tenancyId} href={`/admin/lettings/${l.tenancyId}?tab=money`} left={l.name} sub={`Let only · ${l.landlord} · ${l.tenant} from ${short(l.start)}${l.step === 'record' ? ' · record the move-in money' : l.step === 'close' ? ' · send the statement / move the fee to close' : ''}`} right={gbp(l.amount)} cta={l.step === 'pay' ? 'Pay' : l.step === 'close' ? 'Close' : 'Record'} />
              ))}
            </Tile>

            <Tile id="due" open={open} setOpen={setOpen} tone="mustard"
              title="Rents due" big={String(d.due.count)} sub={!d.collectsRent ? 'Collected in your other system — shown for checking only' : d.due.count ? `${gbp(d.due.total)} outstanding${d.due.notRaised ? ` · ${d.due.notRaised} not raised yet` : ''}` : 'Every rent is in'}
              actions={[{ label: 'Rents due', href: `/admin/rents-due${q}` }, ...(d.collectsRent && d.due.count ? [{ label: 'Chase', href: '/admin/rent-chase' }] : []), ...(d.collectsRent && d.due.notRaised ? [{ label: `Raise ${d.due.notRaised} rents`, href: '/admin/rent-charges' }] : [])]}>
              {d.due.items.map((r, i) => (
                <Row key={i} href={r.tenancyId ? `/admin/lettings/${r.tenancyId}?tab=money` : `/admin/rents-due${q}`} left={r.tenant || r.room} sub={`${r.room}, ${r.property}${r.status === 'no_charge' ? ' · not raised' : ''}`} right={gbp(r.owed)} />
              ))}
            </Tile>

            <Tile id="exp" open={open} setOpen={setOpen} tone="paper"
              title="Expenses" big={String(d.expenses.count)} sub={d.expenses.count ? `${gbp(d.expenses.total)} waiting to go on statements` : 'Nothing waiting'}
              actions={[{ label: 'Add expense', href: '/admin/expense-log' }, { label: 'Upload invoice', href: '/admin/capture' }]}>
              {d.expenses.houses.map(h => (
                <Row key={h.propertyId ?? h.house} href={`/admin/expense-log${h.propertyId ? `?property=${h.propertyId}` : ''}`} left={h.house} sub={`${h.count} expense${h.count === 1 ? '' : 's'}`} right={gbp(h.total)} />
              ))}
            </Tile>

            <Tile id="st" open={open} setOpen={setOpen} tone="paper"
              title="Last statements" big={String(d.statements.items.length)} sub="The latest statement for each house"
              actions={[{ label: 'All statements', href: '/admin/statements' }]}>
              {d.statements.items.map(st => (
                <Row key={st.id} href={`/admin/statements?id=${st.id}`} left={st.house} sub={`${st.reference} · ${short(st.date)} · ${st.state}`} right={gbp(st.net)} />
              ))}
            </Tile>

            <Tile id="imp" open={open} setOpen={setOpen} tone="paper" warn={d.collectsRent && (behind == null || behind > 1)}
              title="Import diary" big={d.imports.coveredTo ? short(d.imports.coveredTo) : 'None'}
              sub={!d.imports.last && !d.collectsRent ? 'No bank statement imported — not needed while CROS is on statements only' : d.imports.last ? `Covered to here · last import ${when(d.imports.last.at)}${behind ? ` · ${behind} day${behind === 1 ? '' : 's'} not imported` : ''}` : 'No bank statement imported yet'}
              actions={[{ label: 'Bank calendar', href: '/admin/bank-calendar' }, { label: 'Import', href: '/admin/bank-import' }]} />

            <Tile id="cl" open={open} setOpen={setOpen} tone="paper" warn={(!!d.client && !d.client.agrees) || d.holdingToApply.length > 0 || d.holdingPastDeadline.length > 0 || d.depositsToDps.some(x => x.days > 30) || d.retainNotices.length > 0}
              title="Client account & income" big={gbp(d.client?.held)} sub={[d.client ? (d.client.agrees ? 'Ledgers agree' : 'Ledgers don’t agree — check') : '', d.holdingToApply.length ? `${d.holdingToApply.length} holding deposit${d.holdingToApply.length === 1 ? '' : 's'} to put towards move-in money` : '', d.retainNotices.length ? `${d.retainNotices.length} kept holding deposit${d.retainNotices.length === 1 ? '' : 's'} needing written reasons` : '', d.depositsToDps.length ? `${d.depositsToDps.length} deposit${d.depositsToDps.length === 1 ? '' : 's'} to send to the DPS` : '', d.holdingPastDeadline.length ? `${d.holdingPastDeadline.length} holding deposit${d.holdingPastDeadline.length === 1 ? '' : 's'} past the 15-day signing deadline` : '', d.depositHolderMissing ? `${d.depositHolderMissing} older tenancies set up without a deposit holder` : ''].filter(Boolean).join(' · ')}
              actions={[{ label: 'Reconcile', href: '/admin/client-money' }, ...(d.depositHolderMissing ? [{ label: 'Set deposit holders', href: '/admin/finance-check' }] : []), { label: 'Income', href: '/admin/income' }]}>
              {d.holdingToApply.map(h => (
                <Row key={h.number} href={`/admin/lettings/${h.tenancyId}?tab=money`} left={`${h.tenant} · ${h.house}`} sub={`${h.number} still held · moved in ${short(h.moved)}`} right={gbp(h.amount)} cta="Apply" />
              ))}
              {d.retainNotices.map(h => (
                <Row key={h.number} href={h.tenancyId ? `/admin/lettings/${h.tenancyId}?tab=money` : '/admin/applicants'} left={`${h.who} · ${h.number}`} sub={`Kept ${short(h.decided)} · written reasons due by ${short(h.by)}`} right={gbp(h.amount)} cta="Letter" />
              ))}
              {d.depositsToDps.map(x => (
                <Row key={x.tenancyId} href={`/admin/lettings/${x.tenancyId}?tab=money`} left={`${x.tenant} · ${x.house}`} sub={`Deposit received ${short(x.received)} · ${x.days} day${x.days === 1 ? '' : 's'} held${x.days > 30 ? ' — past the 30-day limit' : ' — send within 30'}`} right={gbp(x.amount)} cta="DPS" />
              ))}
              {d.holdingPastDeadline.map(h => (
                <Row key={h.number} href={h.tenancyId ? `/admin/lettings/${h.tenancyId}?tab=progress` : '/admin/lettings'} left={`${h.tenant} · ${h.house}`} sub={`${h.number} taken ${short(h.received)} · agreement not signed in 15 days — sign, agree a new date in writing, or refund within 7 days`} right={gbp(h.amount)} cta="Check" />
              ))}
            </Tile>
          </>}
        </div>
      </div>
    </div>
  )
}

// Everything else in finance, alphabetical (Harry: menus always alphabetical), so no screen is more than two clicks away
const MORE = [
  ['Income', '/admin/income'],
  ['Arrears letters', '/admin/arrears'], ['Bank', '/admin/bank-calendar'], ['Cashbook', '/admin/reports/cashbook'], ['Deposits', '/admin/deposits'],
  ['Expenses report', '/admin/reports/expenses'], ['Finance health check', '/admin/finance-check'], ['Landlord income', '/admin/reports/landlord-income'],
  ['Making Tax Digital', '/admin/reports/mtd'], ['Rent analysis', '/admin/reports/rent-analysis'],
  ['Rent charges', '/admin/rent-charges'], ['Rent Chase', '/admin/rent-chase'], ['Rent demands', '/admin/reports/rent-demands'], ['Rent increase', '/admin/rent-increase'],
  ['Rent Roll', '/admin/rent-roll'], ['Reports (all)', '/admin/reports'], ['Tax year', '/admin/reports/tax-year'],
  ['Tenant balances', '/admin/reports/tenant-balances'], ['Utilities', '/admin/reports/utilities'], ['Voids', '/admin/reports/voids'],
].sort((a, b) => a[0].localeCompare(b[0]))

function More() {
  const [o, setO] = useState(false)
  return (
    <div className="relative">
      <Pill tone="paper" second onClick={() => setO(!o)}>More {o ? '▴' : '▾'}</Pill>
      {o && (
        <ul className="absolute right-0 z-20 mt-sm max-h-96 w-60 overflow-y-auto rounded-2xl bg-[var(--paper,#FFFDF6)] p-xs shadow-lg ring-1 ring-black/5">
          {MORE.map(([l, h]) => <li key={h}><Link href={h} className="block rounded-xl px-md py-xs text-sm text-[var(--ink,#23261A)] hover:bg-[var(--line,#EDE8D6)]">{l}</Link></li>)}
        </ul>
      )}
    </div>
  )
}

const TONE = { olive: C.olive, mustard: C.mustard, paper: C.paper }

function Tile({ id, open, setOpen, tone, warn, title, big, sub, actions, children }: {
  id: string; open: string | null; setOpen: (v: string | null) => void; tone: Tone; warn?: boolean
  title: string; big: string; sub: string; actions: { label: string; href: string }[]; children?: React.ReactNode
}) {
  const list = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : []
  const isOpen = open === id
  return (
    <div className={`flex min-h-[15rem] flex-col rounded-[28px] p-lg shadow-[0_2px_0_rgba(35,38,26,0.12)] ${TONE[tone]} ${warn ? 'ring-2 ring-red-500' : ''}`}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-75">{title}</h2>
      <p className={`${display.className} mt-sm text-5xl font-extrabold tabular-nums tracking-tight`}>{big}</p>
      <p className="mt-xs min-h-[1.25rem] text-sm opacity-85">{sub}</p>
      <div className="mt-auto flex flex-wrap items-center gap-sm pt-md">
        {actions.map((a, i) => <Pill key={a.href} href={a.href} tone={tone} second={i > 0}>{a.label}</Pill>)}
        {list.length > 0 && (
          <button type="button" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen} className="ml-auto text-sm font-semibold">
            {isOpen ? 'Hide' : `Show ${list.length}`} <span aria-hidden>{isOpen ? '▴' : '▾'}</span>
          </button>
        )}
      </div>
      {isOpen && <ul className="-mx-sm mt-md max-h-80 overflow-y-auto rounded-2xl bg-[var(--paper,#FFFDF6)] px-md text-[var(--ink,#23261A)]">{list}</ul>}
    </div>
  )
}

function Row({ href, left, sub, right, cta }: { href: string; left: string; sub?: string; right: string; cta?: string }) {
  return (
    <li className="border-b border-[#E7E2CF] last:border-0">
      <Link href={href} className="flex items-center justify-between gap-md py-sm hover:bg-[var(--ground,#F3F0E6)]">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-neutral-900">{left}</span>
          {sub && <span className="block truncate text-xs text-neutral-500">{sub}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-sm">
          <span className="text-sm font-semibold tabular-nums">{right}</span>
          {cta && <span className="rounded-full bg-[var(--band,#1F3B2E)] px-sm py-[2px] text-xs font-bold text-white">{cta}</span>}
        </span>
      </Link>
    </li>
  )
}

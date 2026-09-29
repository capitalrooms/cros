'use client'

// Phone Money tab — this month's rent, arrears, empty rooms and what needs paying attention to.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

interface Money {
  month: string
  months: { month: string; due: number; received: number }[]
  arrears: { total: number; count: number; oldest: string | null }
  rooms: { total: number; occupied: number; empty: number; noTenancy: number }
  jobs: { open: number; toApprove: number }
  certificates: { expired: number; dueSoon: number }
}

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB')
const mon = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })

function Tile({ href, label, value, note, tone }: { href: string; label: string; value: string; note: string; tone?: 'red' | 'amber' }) {
  return (
    <Link href={href} className="rounded-2xl bg-white p-3.5 active:bg-neutral-50">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-500">{label}</p>
      <p className={`mt-1 text-[22px] font-bold tabular-nums ${tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-neutral-950'}`}>{value}</p>
      <p className="text-[12px] text-neutral-500">{note}</p>
    </Link>
  )
}

export default function AdminMoneyPage() {
  const [m, setM] = useState<Money | null>(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const res = await adminFetch('/api/admin/money')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not load figures')
      setM(d); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load figures') }
  }
  useEffect(() => { load() }, [])

  const cur = m?.months[m.months.length - 1]
  const pct = cur && cur.due ? Math.min(100, Math.round((cur.received / cur.due) * 100)) : 0
  const top = m ? Math.max(1, ...m.months.map(x => Math.max(x.due, x.received))) : 1

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-4">
        <h1 className="text-[26px] leading-tight font-bold text-neutral-950">Money</h1>

        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button className="underline ml-1" onClick={load}>Try again</button></div>}
        {!m && !error && <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-28 rounded-2xl bg-white animate-pulse" />)}</div>}

        {m && cur && (
          <>
            <Link href="/admin/rent-charges" className="block rounded-2xl bg-neutral-950 p-4 text-white">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">Rent · {new Date(m.month + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}</p>
              <p className="mt-1 text-[30px] font-bold tabular-nums leading-none">{gbp(cur.received)}<span className="text-base font-medium text-white/60"> of {gbp(cur.due)}</span></p>
              <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1.5 text-[12px] text-white/70">{cur.due ? `${pct}% collected · ${gbp(Math.max(0, cur.due - cur.received))} to come` : 'No charges raised for this month yet'}</p>
            </Link>

            {/* the bank statement upload — matches payments to rent by reference */}
            <Link href="/admin/bank-import" className="flex items-center justify-between rounded-2xl bg-white p-3.5 active:bg-neutral-50">
              <span><span className="block text-[15px] font-semibold text-neutral-900">Upload bank CSV</span><span className="block text-[12px] text-neutral-500">Match this month’s payments to rent</span></span>
              <span className="text-neutral-400" aria-hidden>›</span>
            </Link>

            <div className="grid grid-cols-2 gap-2">
              <Tile href="/admin/arrears" label="Arrears" value={gbp(m.arrears.total)} tone={m.arrears.total > 0 ? 'red' : undefined}
                note={m.arrears.count ? `${m.arrears.count} charge${m.arrears.count === 1 ? '' : 's'} · since ${mon(m.arrears.oldest!)}` : 'Nobody behind'} />
              <Tile href="/admin/available-and-lettings" label="Empty rooms" value={String(m.rooms.empty)} tone={m.rooms.empty > 0 ? 'amber' : undefined}
                note={m.rooms.noTenancy ? `${m.rooms.noTenancy} marked let have no tenancy on record` : `${m.rooms.occupied} of ${m.rooms.total} let`} />
              <Tile href="/admin/maintenance" label="Open jobs" value={String(m.jobs.open)}
                note={m.jobs.toApprove ? `${m.jobs.toApprove} to approve` : 'None waiting on you'} tone={m.jobs.toApprove ? 'amber' : undefined} />
              <Tile href="/admin/compliance?tab=certificates" label="Certificates" value={String(m.certificates.expired + m.certificates.dueSoon)}
                tone={m.certificates.expired ? 'red' : m.certificates.dueSoon ? 'amber' : undefined}
                note={m.certificates.expired ? `${m.certificates.expired} expired` : m.certificates.dueSoon ? 'Due in 30 days' : 'All in date'} />
            </div>

            <section className="rounded-2xl bg-white p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">Last six months</h2>
                <p className="flex items-center gap-3 text-[11px] text-neutral-500">
                  <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-neutral-200" />Due</span>
                  <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-neutral-900" />Received</span>
                </p>
              </div>
              <div className="mt-3 flex h-28 gap-2">
                {m.months.map(x => (
                  <div key={x.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="relative w-full flex-1">
                      <div className="absolute bottom-0 left-0 right-0 rounded-md bg-neutral-200" style={{ height: `${(x.due / top) * 100}%` }} />
                      <div className="absolute bottom-0 left-[22%] right-[22%] rounded-md bg-neutral-900" style={{ height: `${(x.received / top) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-neutral-500">{mon(x.month)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-1.5">
              <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">Finance</h2>
              <ul className="rounded-2xl bg-white divide-y divide-neutral-100 overflow-hidden">
                {[['Rent roll', '/admin/rent-roll'], ['Payment run', '/admin/payment-run'], ['Health check', '/admin/finance-check'], ['Rent charges', '/admin/rent-charges'], ['Arrears', '/admin/arrears'], ['Client money', '/admin/client-money'], ['Deposits', '/admin/deposits'], ['Accounts', '/admin/accounts'], ['Bank import', '/admin/bank-import'], ['Reconciliation', '/admin/reconciliation'], ['Reports', '/admin/reports']].map(([label, href]) => (
                  <li key={href}><Link href={href} className="flex items-center justify-between px-3.5 py-3 text-[15px] font-medium text-neutral-900 active:bg-neutral-50">{label}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-300"><path d="M9 6l6 6-6 6" /></svg></Link></li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

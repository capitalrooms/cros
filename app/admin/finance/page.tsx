'use client'

/**
 * /admin/finance — Finance home. The month at a glance: where it is in the cycle (rent roll → statements →
 * payment run → reconcile & close), the key numbers, and a to-do list where each item opens the screen that
 * deals with it. Tools used less often are under "Other tools".
 */

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { adminFetch } from '@/lib/adminFetch'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'

interface Step { n: number; label: string; href: string; status: string; done: boolean }
interface Todo { key: string; tone: 'red' | 'amber' | 'green' | 'grey'; title: string; detail?: string; href: string; action: string }
interface Home {
  month: string; source: string; steps: Step[]; current: number; todos: Todo[]
  numbers: { due: number; received: number; missing: number; heldInClientAccount: number; agrees: boolean; toLandlords: number; fees: number }
}

const gbp = (n: number | null | undefined) => (n == null ? '—' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const monthLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const shift = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7) }

const TONE: Record<Todo['tone'], { dot: string; label: string }> = {
  red: { dot: 'bg-red-600', label: 'Urgent' },
  amber: { dot: 'bg-amber-500', label: 'To do' },
  grey: { dot: 'bg-neutral-400', label: 'When ready' },
  green: { dot: 'bg-green-600', label: 'Done' },
}

const OTHER_TOOLS = [
  { label: 'Bank import', href: '/admin/bank-import', note: 'Upload a bank CSV' },
  { label: 'Rent charges', href: '/admin/rent-charges', note: 'Every charge raised' },
  { label: 'Fee income', href: '/admin/income', note: 'Management and letting fees' },
  { label: 'Landlord accounts', href: '/admin/accounts', note: 'Balance per landlord' },
  { label: 'Expense review', href: '/admin/expense-review', note: 'Invoices waiting to be checked' },
  { label: 'AutoLedger', href: '/admin/autoledger', note: 'Emailed invoices' },
  { label: 'MTD quarters', href: '/admin/reports/mtd', note: 'HMRC figures per landlord' },
  { label: 'Health check', href: '/admin/finance-check', note: 'Ledger and data checks' },
]

export default function FinanceHomePage() {
  return <Suspense fallback={null}><FinanceHomeScreen /></Suspense>
}

function FinanceHomeScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const [month, setMonth] = useState(params.get('month') || new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<Home | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (m: string) => {
    setLoading(true); setError('')
    const r = await adminFetch(`/api/admin/finance-home?month=${m}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not load the month'); setData(null) } else setData(j)
    setLoading(false)
  }, [])

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !['administrator', 'admin'].includes(u.assignment?.role || '')) { router.push('/login'); return }
      load(month)
    })()
  }, [router, load, month])

  const go = (m: string) => { setMonth(m); router.replace(`/admin/finance?month=${m}`) }
  const n = data?.numbers
  const prevAgent = data?.source === 'previous_agent'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Finance" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
          <h1 className="text-2xl font-bold text-neutral-900">{monthLabel(month)}</h1>
          <div className="flex items-center gap-sm">
            <button onClick={() => go(shift(month, -1))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" aria-label="Previous month">‹</button>
            <input type="month" value={month} onChange={e => e.target.value && go(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900" />
            <button onClick={() => go(shift(month, 1))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" aria-label="Next month">›</button>
          </div>
        </div>

        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}

        {/* the cycle */}
        <ol className="mb-lg grid grid-cols-2 gap-sm md:grid-cols-4">
          {(data?.steps ?? []).map(s => {
            const isCurrent = !s.done && s.n === data!.current
            return (
              <li key={s.n}>
                <Link href={s.href} className={`flex h-full flex-col rounded-xl border px-md py-sm transition hover:border-neutral-900 ${isCurrent ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-900'}`}>
                  <span className={`flex items-center gap-xs text-xs font-semibold ${isCurrent ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? 'bg-green-600 text-white' : isCurrent ? 'bg-white text-neutral-900' : 'bg-neutral-200 text-neutral-700'}`}>{s.done ? '✓' : s.n}</span>
                    Step {s.n}
                  </span>
                  <span className="mt-xs text-base font-bold">{s.label}</span>
                  <span className={`text-sm ${isCurrent ? 'text-neutral-200' : s.done ? 'text-green-700' : 'text-neutral-600'}`}>{s.status}</span>
                </Link>
              </li>
            )
          })}
          {loading && !data && [1, 2, 3, 4].map(i => <li key={i} className="h-24 animate-pulse rounded-xl bg-white" />)}
        </ol>

        {/* numbers */}
        {n && (
          <div className="mb-lg grid grid-cols-2 gap-sm md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: prevAgent ? 'Rent collected' : 'Rent due', value: gbp(n.due), cls: 'text-neutral-900', href: `/admin/rent-roll?month=${month}` },
              { label: 'Received', value: gbp(n.received), cls: 'text-green-700', href: `/admin/rent-roll?month=${month}` },
              { label: 'Missing', value: gbp(n.missing), cls: n.missing > 0 ? 'text-red-700' : 'text-neutral-900', href: `/admin/rent-roll?month=${month}` },
              { label: 'To landlords', value: gbp(n.toLandlords), cls: 'text-neutral-900', href: `/admin/payment-run?month=${month}` },
              { label: 'Our fees', value: gbp(n.fees), cls: 'text-neutral-900', href: `/admin/payment-run?month=${month}` },
              { label: n.agrees ? 'Client account · agrees' : 'Client account · check', value: gbp(n.heldInClientAccount), cls: n.agrees ? 'text-neutral-900' : 'text-red-700', href: '/admin/client-money' },
            ].map(c => (
              <Link key={c.label} href={c.href} className="rounded-xl bg-white px-md py-sm hover:ring-1 hover:ring-neutral-900">
                <p className="text-xs text-neutral-500">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.cls}`}>{c.value}</p>
              </Link>
            ))}
          </div>
        )}

        {/* to-do */}
        <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
          <h2 className="text-lg font-bold text-neutral-900">To do</h2>
          {data && (
            <ExportButtons title={`Finance to-do · ${monthLabel(month)}`} filename={`finance-todo-${month}`}
              columns={[{ key: 'priority', label: 'Priority' }, { key: 'title', label: 'Item' }, { key: 'detail', label: 'Detail' }, { key: 'screen', label: 'Screen' }]}
              rows={data.todos.map(t => ({ priority: TONE[t.tone].label, title: t.title, detail: t.detail ?? '', screen: t.href }))} />
          )}
        </div>
        <div className="mb-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {loading && <p className="px-lg py-xl text-center text-sm text-neutral-500">Loading…</p>}
          {!loading && (data?.todos ?? []).map((t, i) => (
            <div key={t.key} className={`flex flex-wrap items-center gap-md px-lg py-md ${i ? 'border-t border-neutral-100' : ''}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[t.tone].dot}`} aria-label={TONE[t.tone].label} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-neutral-900">{t.title}</p>
                {t.detail && <p className="truncate text-sm tabular-nums text-neutral-600">{t.detail}</p>}
              </div>
              <Link href={t.href} className={`rounded-lg px-md py-sm text-sm font-bold ${t.tone === 'green' ? 'border border-neutral-300 text-neutral-900' : 'bg-neutral-900 text-white'}`}>{t.action}</Link>
            </div>
          ))}
        </div>

        {/* other tools */}
        <h2 className="mb-sm text-lg font-bold text-neutral-900">Other tools</h2>
        <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
          {OTHER_TOOLS.map(t => (
            <Link key={t.href} href={t.href} className="rounded-xl border border-neutral-200 bg-white px-md py-sm hover:border-neutral-900">
              <p className="font-semibold text-neutral-900">{t.label}</p>
              <p className="text-xs text-neutral-500">{t.note}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

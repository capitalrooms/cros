'use client'

// Mark-ups (goods resold): every landlord expense in a period — what it cost us, what the landlord was charged, and
// the difference. For the accountant: "we spent £3,000 and recharged £3,500 — here is the £500".
import { useCallback, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'
import { adminFetch } from '@/lib/adminFetch'

const gbp = (n: number) => `${n < 0 ? '−' : ''}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const ym = (d: Date) => d.toISOString().slice(0, 10)

export default function ResoldReport() {
  const now = new Date()
  const [from, setFrom] = useState(ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))))
  const [to, setTo] = useState(ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))))
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const r = await adminFetch(`/api/admin/reports/resold?from=${from}&to=${to}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load the report'); return }
    setData(d)
  }, [from, to])
  useEffect(() => { load() }, [load])

  const rows: any[] = (data?.rows ?? []).filter((r: any) => !onlyMarked || r.margin !== 0)
  const t = data?.totals
  const shownTotals = { cost: rows.reduce((n, r) => n + r.cost, 0), charged: rows.reduce((n, r) => n + r.charged, 0), margin: rows.reduce((n, r) => n + r.margin, 0) }
  const inp = 'rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Mark-ups" />
      <PageHero eyebrow="Finance · Reports" title="Mark-ups (goods resold)" subtitle="What each landlord expense cost us beside what the landlord was charged. The difference is profit on goods resold." />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div className="flex flex-wrap items-end gap-md rounded-2xl border border-neutral-200 bg-white p-lg">
          <label className="text-xs font-semibold text-neutral-500">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${inp} mt-xs block`} /></label>
          <label className="text-xs font-semibold text-neutral-500">To<input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${inp} mt-xs block`} /></label>
          <label className="flex items-center gap-xs text-sm text-neutral-700"><input type="checkbox" checked={onlyMarked} onChange={e => setOnlyMarked(e.target.checked)} />Only the ones with a mark-up</label>
          <div className="ml-auto">
            <ExportButtons title="Mark-ups (goods resold)" subtitle={`${day(from)} – ${day(to)}${onlyMarked ? ' · mark-ups only' : ''}`} filename={`markups-${from}-to-${to}`}
              columns={[{ key: 'date', label: 'Date' }, { key: 'no', label: 'Expense' }, { key: 'house', label: 'House' }, { key: 'description', label: 'What' }, { key: 'supplier', label: 'Supplier' }, { key: 'cost', label: 'Cost to us', money: true, align: 'right' }, { key: 'charged', label: 'Charged', money: true, align: 'right' }, { key: 'margin', label: 'Difference', money: true, align: 'right' }]}
              rows={rows} totals={{ date: 'Total', ...shownTotals }} />
          </div>
        </div>
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{error}</p>}
        {t && (
          <section className="grid gap-md sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-lg"><p className="text-xs font-semibold text-neutral-500">Spent on landlords’ houses</p><p className="mt-xs text-2xl font-bold tabular-nums">{gbp(t.cost)}</p></div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-lg"><p className="text-xs font-semibold text-neutral-500">Charged to landlords</p><p className="mt-xs text-2xl font-bold tabular-nums">{gbp(t.charged)}</p></div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-lg"><p className="text-xs font-semibold text-neutral-500">Difference · {t.markedCount} item{t.markedCount === 1 ? '' : 's'} marked up</p><p className={`mt-xs text-2xl font-bold tabular-nums ${t.margin < 0 ? 'text-red-700' : 'text-green-700'}`}>{gbp(t.margin)}</p></div>
          </section>
        )}
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold text-neutral-500">
              <th className="px-md py-sm">Date</th><th className="px-md py-sm">Expense</th><th className="px-md py-sm">House</th><th className="px-md py-sm">What</th>
              <th className="px-md py-sm text-right">Cost to us</th><th className="px-md py-sm text-right">Charged</th><th className="px-md py-sm text-right">Difference</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-neutral-100">
                  <td className="px-md py-sm whitespace-nowrap">{day(r.date)}</td><td className="px-md py-sm font-mono text-xs">{r.no}</td><td className="px-md py-sm">{r.house}</td>
                  <td className="px-md py-sm">{r.description}{r.supplier ? <span className="block text-xs text-neutral-500">{r.supplier}</span> : null}</td>
                  <td className="px-md py-sm text-right tabular-nums">{gbp(r.cost)}</td><td className="px-md py-sm text-right tabular-nums">{gbp(r.charged)}</td>
                  <td className={`px-md py-sm text-right font-semibold tabular-nums ${r.margin > 0 ? 'text-green-700' : r.margin < 0 ? 'text-red-700' : 'text-neutral-400'}`}>{r.margin === 0 ? '—' : gbp(r.margin)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="px-md py-lg text-center text-neutral-500">No landlord expenses in these dates.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">Set “What it cost us” when adding an expense, or a different “Charge the landlord” when filing a line from the Operations account. Expenses without it were charged at cost.</p>
      </div>
    </div>
  )
}

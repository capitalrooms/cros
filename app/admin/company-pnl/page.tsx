'use client'

// Finance › Agency income › Profit and loss (5 Nov 2026). Directors only. Capital Rooms' own turnover (management and
// letting fees from the statements), company costs by category — biggest first — and net profit, month by month, with
// what the current tenancies will bring in over the next 12 months. A picture for directors; the statutory accounts
// stay with the accountant. Data: /api/admin/company-pnl (lib/finance/companyPnl).
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'
import { adminFetch } from '@/lib/adminFetch'
import { incomeTabs } from '@/lib/financeTabs'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import type { Pnl } from '@/lib/finance/companyPnl'

const gbp = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const gbp0 = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(Math.round(n)).toLocaleString('en-GB')
const monthName = (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const thisTaxYear = () => { const d = new Date(); return d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 6) ? d.getFullYear() : d.getFullYear() - 1 }

export default function CompanyPnlPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const [year, setYear] = useState(Number(one(sp.year)) || thisTaxYear())
  const [d, setD] = useState<Pnl | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setD(null); setError('')
    adminFetch(`/api/admin/company-pnl?year=${year}`).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) setError(j.error ?? 'Not loaded'); else setD(j) })
  }, [year])

  const card = 'rounded-2xl border border-neutral-200 bg-white'
  const shown = d ? d.months.filter(m => m.turnover || m.costs || m.month <= new Date().toISOString().slice(0, 7)) : []
  const noCosts = !!d && d.totals.costs === 0

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/income" />} title="Profit and loss" />
      <PageHero
        trail={[{ label: 'Finance', href: '/admin/finance' }, { label: 'Agency income', href: '/admin/income' }]}
        title="Profit and loss"
        chip={{ label: `Tax year ${year}/${String(year + 1).slice(2)}`, tone: 'plain' }}
        subtitle="Capital Rooms’ own turnover, costs and net profit — directors only"
        stats={d ? [
          { label: 'Turnover', value: gbp0(d.totals.turnover) },
          { label: 'Company costs', value: gbp0(d.totals.costs) },
          { label: noCosts ? 'Net profit (no costs filed yet)' : `Net profit${d.totals.margin != null ? ` · ${d.totals.margin}% margin` : ''}`, value: gbp0(d.totals.profit), tone: d.totals.profit < 0 ? 'bad' : 'good' },
          { label: 'Expected turnover, next 12 months', value: gbp0(d.expected.perYear) },
        ] : undefined}
        tabs={incomeTabs('pnl')}
      />

      <main className="mx-auto max-w-6xl space-y-lg px-lg py-xl">
        <div className="flex flex-wrap items-center gap-sm">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm" aria-label="Tax year">
            {Array.from({ length: 4 }, (_, i) => thisTaxYear() - i).map(y => <option key={y} value={y}>Tax year {y}/{String(y + 1).slice(2)}</option>)}
          </select>
          {d && <ExportButtons className="ml-auto" title={`Profit and loss ${year}/${String(year + 1).slice(2)}`} filename={`profit-and-loss-${year}`}
            columns={[{ key: 'month', label: 'Month' }, { key: 'management', label: 'Management fees', money: true }, { key: 'letting', label: 'Letting fees', money: true }, { key: 'turnover', label: 'Turnover', money: true }, { key: 'costs', label: 'Company costs', money: true }, { key: 'profit', label: 'Net profit', money: true }]}
            rows={shown.map(m => ({ ...m, month: monthName(m.month) }))} totals={{ month: 'Total', ...d.totals }} />}
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{error}</p>}
        {!d && !error && <p className="text-sm text-neutral-500">Working it out…</p>}

        {d && <>
          {noCosts && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-sm text-sm text-amber-900">
              No company costs are filed for this tax year yet, so net profit equals turnover. Import the month’s business account CSV in <Link href="/admin/ops-account" className="font-semibold underline">Expenses › Office account</Link> and file each payment — CROS learns each supplier as you go.
            </p>
          )}

          {/* month by month */}
          <section className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                <th className="px-md py-sm">Month</th><th className="px-md py-sm text-right">Management fees</th><th className="px-md py-sm text-right">Letting fees</th><th className="px-md py-sm text-right">Turnover</th><th className="px-md py-sm text-right">Company costs</th><th className="px-md py-sm text-right">Net profit</th>
              </tr></thead>
              <tbody>
                {shown.map(m => (
                  <tr key={m.month} className="border-t border-neutral-100">
                    <td className="px-md py-sm font-semibold">{monthName(m.month)}</td>
                    <td className="px-md py-sm text-right">{gbp(m.management)}</td><td className="px-md py-sm text-right">{gbp(m.letting)}</td>
                    <td className="px-md py-sm text-right font-semibold">{gbp(m.turnover)}</td><td className="px-md py-sm text-right">{gbp(m.costs)}</td>
                    <td className={`px-md py-sm text-right font-bold ${m.profit < 0 ? 'text-red-700' : ''}`}>{gbp(m.profit)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-neutral-900 font-bold">
                  <td className="px-md py-sm">Total</td><td className="px-md py-sm text-right">{gbp(d.totals.management)}</td><td className="px-md py-sm text-right">{gbp(d.totals.letting)}</td>
                  <td className="px-md py-sm text-right">{gbp(d.totals.turnover)}</td><td className="px-md py-sm text-right">{gbp(d.totals.costs)}</td><td className="px-md py-sm text-right">{gbp(d.totals.profit)}</td>
                </tr>
              </tbody>
            </table>
            <p className="border-t border-neutral-100 px-md py-sm text-xs text-neutral-500">Fees count in the month the rent is for, from the landlord statements{d.vat ? `, net of VAT from ${day(d.vat.registeredFrom!)}` : ''}. Costs are company expenses filed in the office account or Capture{d.vat ? ', net of reclaimable VAT' : ''}. Net profit is before corporation tax.</p>
          </section>

          <div className="grid gap-lg md:grid-cols-2">
            {/* costs by category, biggest first */}
            <section className={card}>
              <h2 className="border-b border-neutral-100 px-lg py-md text-sm font-bold text-neutral-900">What costs us the most</h2>
              {d.costsByCategory.length === 0 ? <p className="px-lg py-md text-sm text-neutral-500">No company costs filed yet.</p> : (
                <ul className="divide-y divide-neutral-100">
                  {d.costsByCategory.map(c => (
                    <li key={c.category} className="px-lg py-sm">
                      <div className="flex items-baseline justify-between gap-sm text-sm"><span className="font-semibold">{c.category}</span><span className="tabular-nums font-bold">{gbp(c.amount)}</span></div>
                      <div className="mt-1 flex items-center gap-sm"><span className="h-1.5 flex-1 rounded-full bg-neutral-100"><span className="block h-1.5 rounded-full bg-[var(--band,#1F3B2E)]" style={{ width: `${Math.max(2, c.share)}%` }} /></span><span className="w-24 text-right text-xs text-neutral-500">{c.share}% · {c.count} item{c.count === 1 ? '' : 's'}</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-lg">
              {/* what the current tenancies will bring in */}
              <section className={`${card} px-lg py-md`}>
                <h2 className="text-sm font-bold text-neutral-900">Expected turnover</h2>
                <p className="mt-xs text-2xl font-extrabold tabular-nums">{gbp(d.expected.perMonth)} <span className="text-sm font-semibold text-neutral-500">a month</span></p>
                <p className="text-sm text-neutral-600">{gbp(d.expected.perYear)} over the next 12 months, from the management fees on {d.expected.tenancies} current managed tenanc{d.expected.tenancies === 1 ? 'y' : 'ies'} at today’s rents{d.expected.noFee ? ` (${d.expected.noFee} have no fee set and aren’t counted)` : ''}. Letting fees from new lets come on top.</p>
              </section>

              {/* VAT: registered → what's due; not yet → how close the threshold is */}
              <section className={`${card} px-lg py-md`}>
                <h2 className="text-sm font-bold text-neutral-900">VAT</h2>
                {d.vat ? <dl className="mt-xs grid grid-cols-[1fr_auto] gap-y-xs text-sm tabular-nums">
                  <dt className="text-neutral-600">VAT on our fees</dt><dd>{gbp(d.vat.onFees)}</dd>
                  <dt className="text-neutral-600">Less VAT on company costs (reclaimable)</dt><dd>−{gbp(d.vat.onCosts)}</dd>
                  <dt className="font-bold">VAT due for this period</dt><dd className="font-bold">{gbp(d.vat.due)}</dd>
                </dl> : <>
                  <p className="mt-xs text-sm text-neutral-600">Not yet registered in CROS. Fee turnover over the last 12 months is <b>{gbp(d.threshold.last12)}</b> — {Math.round(d.threshold.last12 / d.threshold.limit * 100)}% of the £{d.threshold.limit.toLocaleString('en-GB')} registration threshold.</p>
                  <div className="mt-sm h-1.5 rounded-full bg-neutral-100"><div className="h-1.5 rounded-full bg-[var(--accent,#C4922A)]" style={{ width: `${Math.min(100, d.threshold.last12 / d.threshold.limit * 100)}%` }} /></div>
                  <p className="mt-sm text-xs text-neutral-500">Set the registration date in <Link href="/admin/books" className="underline">Finance › Transactions</Link> to see VAT due here.</p>
                </>}
              </section>
            </div>
          </div>

          {d.biggestCosts.length > 0 && (
            <section className={`${card} overflow-x-auto`}>
              <h2 className="border-b border-neutral-100 px-lg py-md text-sm font-bold text-neutral-900">Largest costs this year</h2>
              <table className="w-full text-sm">
                <tbody>{d.biggestCosts.map((c, i) => (
                  <tr key={i} className="border-t border-neutral-100 first:border-t-0">
                    <td className="whitespace-nowrap px-lg py-sm text-neutral-600">{day(c.date)}</td><td className="px-lg py-sm">{c.what}{c.supplier ? <span className="text-neutral-500"> · {c.supplier}</span> : null}</td>
                    <td className="px-lg py-sm text-neutral-600">{c.category}</td><td className="px-lg py-sm text-right font-semibold tabular-nums">{gbp(c.amount)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          )}
        </>}
      </main>
    </div>
  )
}

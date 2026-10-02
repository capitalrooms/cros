'use client'
// Making Tax Digital — quarterly property income and expenses per landlord, in HMRC's categories, to hand to each
// landlord (or their accountant) for their quarterly update. Suggested categories only; the accountant confirms.
import { useEffect, useMemo, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'
import { adminFetch } from '@/lib/adminFetch'
import type { MtdRow } from '@/lib/finance/mtd'

const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ukDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function MtdReportPage() {
  const now = new Date()
  const current = now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6) ? now.getFullYear() : now.getFullYear() - 1
  const [year, setYear] = useState(current)
  const [data, setData] = useState<{ rows: MtdRow[]; boxes: Record<string, string>; quarters: { label: string; from: string; to: string }[] } | null>(null)
  const [landlord, setLandlord] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null); setError('')
    adminFetch(`/api/admin/reports/mtd?year=${year}`).then(r => r.json()).then(j => (j.error ? setError(j.error) : setData(j))).catch(() => setError('Could not load'))
  }, [year])

  const landlords = useMemo(() => [...new Map((data?.rows ?? []).map(r => [r.landlordId, r.landlord])).entries()], [data])
  const rows = (data?.rows ?? []).filter(r => !landlord || r.landlordId === landlord)
  const boxKeys = Object.keys(data?.boxes ?? {}) as (keyof MtdRow['boxes'])[]
  const flat = rows.map(r => ({ landlord: r.landlord, quarter: `${r.quarter} (${ukDate(r.from)} – ${ukDate(r.to)})`, income: r.income, ...r.boxes, totalExpenses: r.totalExpenses, profit: r.profit, statements: r.statements.join(', ') }))

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Making Tax Digital" />
      <PageHero eyebrow="Finance · Reports" title="Making Tax Digital — quarterly figures" subtitle="Property income and expenses per landlord for each MTD quarter, in HMRC’s categories, from every landlord statement (cash basis). For the landlord or their accountant to submit — the categories are suggestions for them to confirm." />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
          <div className="flex flex-wrap gap-sm">
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm">
              {[current + 1, current, current - 1].map(y => <option key={y} value={y}>Tax year {y}/{String(y + 1).slice(2)}</option>)}
            </select>
            <select value={landlord} onChange={e => setLandlord(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm">
              <option value="">All landlords</option>{landlords.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </div>
          <ExportButtons title={`MTD quarterly figures ${year}/${String(year + 1).slice(2)}`} subtitle={landlord ? landlords.find(l => l[0] === landlord)?.[1] : 'All landlords'} filename={`mtd-${year}`}
            columns={[{ key: 'landlord', label: 'Landlord' }, { key: 'quarter', label: 'Quarter' }, { key: 'income', label: 'Rent income', money: true },
              ...boxKeys.map(k => ({ key: k, label: (data?.boxes[k] ?? k).split(' (')[0], money: true })), { key: 'totalExpenses', label: 'Total expenses', money: true }, { key: 'profit', label: 'Profit', money: true }, { key: 'statements', label: 'Statements' }]}
            rows={flat} />
        </div>
        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
        {data && (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900 text-left text-xs font-bold text-white"><tr>
                <th className="px-md py-sm">Landlord · quarter</th><th className="px-md py-sm text-right">Rent income</th>
                {boxKeys.map(k => <th key={k} className="px-md py-sm text-right" title={data.boxes[k]}>{data.boxes[k].split(' (')[0].replace('Legal, management and other professional fees', 'Professional fees').replace('Rent, rates, insurance, ground rents', 'Rates & insurance')}</th>)}
                <th className="px-md py-sm text-right">Profit</th></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(r => (
                  <tr key={r.landlordId + r.quarter}>
                    <td className="px-md py-sm"><span className="font-semibold">{r.landlord}</span><span className="block text-xs text-neutral-500">{r.quarter} · {ukDate(r.from)} – {ukDate(r.to)} · {r.statements.join(', ')}</span></td>
                    <td className="px-md py-sm text-right tabular-nums">{gbp(r.income)}</td>
                    {boxKeys.map(k => <td key={k} className="px-md py-sm text-right tabular-nums">{gbp(r.boxes[k])}</td>)}
                    <td className="px-md py-sm text-right font-semibold tabular-nums">{gbp(r.profit)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={boxKeys.length + 3} className="px-md py-lg text-center text-neutral-500">No statements in this tax year yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

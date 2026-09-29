'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ExpensesReport() {
  const [from, setFrom]       = useState(firstOfMonth())
  const [to, setTo]           = useState(today())
  const [search, setSearch]   = useState('')
  const [category, setCategory] = useState('')
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ from, to, search, category })
    const res = await fetch(`/api/admin/reports/expenses?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Expenses Report" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Expenses</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Expenses recorded by property and category.</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg flex flex-wrap gap-md items-end">
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Category</label>
            <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. repairs" className="w-full border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Search</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Property or description" className="w-full border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          <button onClick={load} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Run'}
          </button>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-md">
              <div className="bg-white rounded-xl border border-neutral-200 px-lg py-md">
                <p className="text-xs text-neutral-500">Total Expenses</p>
                <p className="text-2xl font-bold text-neutral-900 mt-xs">{gbp(data.grand_total || 0)}</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 px-lg py-md">
                <p className="text-xs text-neutral-500">Properties</p>
                <p className="text-2xl font-bold text-neutral-900 mt-xs">{data.properties?.length || 0}</p>
              </div>
            </div>

            {/* Category breakdown */}
            {(data.categories || []).length > 0 && (
              <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">By Category</p>
                <div className="space-y-sm">
                  {(data.categories || []).map((c: any) => {
                    const pct = data.grand_total > 0 ? (c.total / data.grand_total) * 100 : 0
                    return (
                      <div key={c.cat} className="flex items-center gap-md">
                        <div className="w-28 text-xs text-neutral-600 truncate">{c.cat}</div>
                        <div className="flex-1 bg-neutral-100 rounded-full h-2 overflow-hidden">
                          <div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-20 text-xs font-mono text-right text-neutral-900">{gbp(c.total)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {(data.properties || []).length === 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 px-xl py-2xl text-center text-sm text-neutral-400">No expenses found for this period.</div>
            )}

            {(data.properties || []).map((prop: any) => (
              <div key={prop.property_id || prop.property_name} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <button
                  onClick={() => setExpanded(e => ({ ...e, [prop.property_id]: !e[prop.property_id] }))}
                  className="w-full flex items-center justify-between px-xl py-md hover:bg-neutral-50 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm font-bold text-neutral-900">{prop.property_name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{prop.landlord_name} · {prop.rows?.length} expense(s)</p>
                  </div>
                  <p className="text-sm font-bold text-neutral-900">{gbp(prop.total)}</p>
                </button>
                {expanded[prop.property_id] && (
                  <div className="border-t border-neutral-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-xs text-neutral-500">
                        <tr>
                          {['Date', 'Description', 'Category', 'Amount'].map(h => (
                            <th key={h} className="text-left px-md py-sm font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {(prop.rows || []).map((r: any) => (
                          <tr key={r.id} className="hover:bg-neutral-50">
                            <td className="px-md py-sm text-neutral-600 whitespace-nowrap">{fmtDate(r.expense_date)}</td>
                            <td className="px-md py-sm">{r.description || '—'}</td>
                            <td className="px-md py-sm"><span className="text-xs bg-neutral-100 text-neutral-600 rounded px-sm py-xs">{r.category || '—'}</span></td>
                            <td className="px-md py-sm font-mono font-semibold">{gbp(Number(r.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

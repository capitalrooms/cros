'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const firstOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)

export default function CashbookReport() {
  const [from, setFrom]     = useState(firstOfMonth())
  const [to, setTo]         = useState(today())
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ from, to })
    const res = await fetch(`/api/admin/reports/cashbook?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Cashbook" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Cashbook</h1>
          <p className="text-sm text-neutral-500 mt-0.5">All money in and out for a selected period.</p>
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
          <button onClick={load} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Run'}
          </button>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
              {[
                { label: 'Money In',  value: gbp(data.totals?.total_in || 0), colour: 'text-green-700', bg: 'bg-green-50 border-green-200' },
                { label: 'Money Out', value: gbp(data.totals?.total_out || 0), colour: 'text-red-700', bg: 'bg-red-50 border-red-200' },
                { label: 'Net',       value: gbp(data.totals?.net || 0), colour: (data.totals?.net || 0) >= 0 ? 'text-green-700' : 'text-red-700', bg: 'bg-white border-neutral-200' },
                { label: 'Unmatched bank', value: (data.unmatched || []).length, colour: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
              ].map(t => (
                <div key={t.label} className={`rounded-xl border px-lg py-md ${t.bg}`}>
                  <p className="text-xs text-neutral-500">{t.label}</p>
                  <p className={`text-xl font-bold mt-xs ${t.colour}`}>{t.value}</p>
                </div>
              ))}
            </div>

            {/* Unmatched bank transactions */}
            {(data.unmatched || []).length > 0 && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
                <button onClick={() => setShowUnmatched(s => !s)}
                  className="w-full flex items-center justify-between px-lg py-md text-sm font-semibold text-amber-800">
                  <span>{data.unmatched.length} unmatched bank transaction(s) — not yet allocated to a charge</span>
                  <span>{showUnmatched ? '▲' : '▼'}</span>
                </button>
                {showUnmatched && (
                  <div className="border-t border-amber-200 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-amber-100 text-xs text-amber-700">
                        <tr>
                          {['Date', 'Description', 'Amount'].map(h => <th key={h} className="text-left px-md py-sm font-semibold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {(data.unmatched || []).map((t: any) => (
                          <tr key={t.id}>
                            <td className="px-md py-sm text-amber-800 whitespace-nowrap">{t.date}</td>
                            <td className="px-md py-sm text-amber-800">{t.description}</td>
                            <td className="px-md py-sm font-mono font-semibold text-amber-900">{gbp(t.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Cashbook table */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              {(data.entries || []).length === 0 ? (
                <div className="px-xl py-2xl text-center text-sm text-neutral-400">No entries for this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-500">
                      <tr>
                        {['Date', 'Description', 'Property', 'In', 'Out', 'Balance'].map(h => (
                          <th key={h} className="text-left px-md py-sm font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {(data.entries || []).map((e: any, i: number) => (
                        <tr key={i} className="hover:bg-neutral-50">
                          <td className="px-md py-sm text-neutral-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                          <td className="px-md py-sm text-neutral-800">{e.description}</td>
                          <td className="px-md py-sm text-neutral-500 text-xs">{e.property}</td>
                          <td className="px-md py-sm font-mono text-green-700">{e.amount_in > 0 ? gbp(e.amount_in) : ''}</td>
                          <td className="px-md py-sm font-mono text-red-600">{e.amount_out > 0 ? gbp(e.amount_out) : ''}</td>
                          <td className={`px-md py-sm font-mono font-semibold ${e.running_balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>{gbp(e.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

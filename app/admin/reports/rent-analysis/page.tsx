'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number) => `${n}%`

function RateBar({ rate }: { rate: number }) {
  const colour = rate >= 95 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-sm">
      <div className="flex-1 bg-neutral-100 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${colour}`} style={{ width: `${rate}%` }} />
      </div>
      <span className={`text-xs font-semibold ${rate >= 95 ? 'text-green-700' : rate >= 80 ? 'text-amber-700' : 'text-red-700'}`}>{pct(rate)}</span>
    </div>
  )
}

export default function RentAnalysisReport() {
  const [from, setFrom]     = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo]         = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ from, to, search })
    const res = await fetch(`/api/admin/reports/rent-analysis?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Rent Analysis" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Rent Analysis</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Received vs expected breakdown by property.</p>
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
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Search property</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Property name…" className="w-full border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          <button onClick={load} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Run'}
          </button>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
              {[
                { label: 'Total Due',      value: gbp(data.totals?.total_due || 0) },
                { label: 'Total Received', value: gbp(data.totals?.total_received || 0) },
                { label: 'Outstanding',    value: gbp(data.totals?.outstanding || 0), warn: (data.totals?.outstanding || 0) > 0 },
                { label: 'Collection Rate', value: pct(data.totals?.collection_rate ?? 100) },
              ].map(t => (
                <div key={t.label} className={`rounded-xl border px-lg py-md ${(t as any).warn && data.totals?.outstanding > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-neutral-200'}`}>
                  <p className="text-xs text-neutral-500">{t.label}</p>
                  <p className={`text-xl font-bold mt-xs ${(t as any).warn && data.totals?.outstanding > 0 ? 'text-red-700' : 'text-neutral-900'}`}>{t.value}</p>
                </div>
              ))}
            </div>

            {(data.properties || []).length === 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 px-xl py-2xl text-center text-sm text-neutral-400">No rent charge data for this period.</div>
            )}

            {(data.properties || []).map((prop: any) => (
              <div key={prop.property_id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <button onClick={() => setExpanded(e => ({ ...e, [prop.property_id]: !e[prop.property_id] }))}
                  className="w-full flex items-center gap-lg px-xl py-md hover:bg-neutral-50 transition-colors flex-wrap">
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-neutral-900">{prop.property_name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{prop.landlord_name} · {prop.charge_count} charge(s)</p>
                  </div>
                  <div className="w-40">
                    <RateBar rate={prop.collection_rate} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">{gbp(prop.total_received)} / {gbp(prop.total_due)}</p>
                    {prop.outstanding > 0 && <p className="text-xs text-red-600 font-semibold">{gbp(prop.outstanding)} outstanding</p>}
                  </div>
                </button>
                {expanded[prop.property_id] && (
                  <div className="border-t border-neutral-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-xs text-neutral-500">
                        <tr>
                          {['Month', 'Due', 'Received', 'Outstanding', 'Rate'].map(h => (
                            <th key={h} className="text-left px-md py-sm font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {(prop.months || []).map((m: any) => {
                          const outstanding = Math.max(0, m.due - m.received)
                          const rate = m.due > 0 ? Math.round((m.received / m.due) * 100) : 100
                          return (
                            <tr key={m.month} className="hover:bg-neutral-50">
                              <td className="px-md py-sm text-neutral-600">{m.month}</td>
                              <td className="px-md py-sm font-mono">{gbp(m.due)}</td>
                              <td className="px-md py-sm font-mono text-green-700">{gbp(m.received)}</td>
                              <td className="px-md py-sm font-mono text-red-600">{outstanding > 0 ? gbp(outstanding) : '—'}</td>
                              <td className="px-md py-sm w-32"><RateBar rate={rate} /></td>
                            </tr>
                          )
                        })}
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

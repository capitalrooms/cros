'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

export default function FeesReport() {
  const [from, setFrom]     = useState(firstOfMonth())
  const [to, setTo]         = useState(today())
  const [search, setSearch] = useState('')
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ from, to, search })
    const res = await fetch(`/api/admin/reports/fees?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Fees Report" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Fees Report</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Management and letting fees raised in a date range.</p>
        </div>
        {/* Filters */}
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
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Search property / landlord</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. Crownfield" className="w-full border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          <button onClick={load} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Run'}
          </button>
        </div>

        {data && (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-md">
              {[
                { label: 'Management Fees',  value: gbp(data.totals?.management_fee || 0) },
                { label: 'Letting Fees',     value: gbp(data.totals?.letting_fee || 0) },
                { label: 'Total Fees',       value: gbp((data.totals?.management_fee || 0) + (data.totals?.letting_fee || 0)), highlight: true },
              ].map(t => (
                <div key={t.label} className={`rounded-xl border px-lg py-md ${t.highlight ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-neutral-200'}`}>
                  <p className="text-xs text-neutral-500">{t.label}</p>
                  <p className={`text-2xl font-bold mt-xs ${t.highlight ? 'text-indigo-700' : 'text-neutral-900'}`}>{t.value}</p>
                </div>
              ))}
            </div>

            {/* Per-property */}
            {(data.properties || []).length === 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 px-xl py-2xl text-center text-sm text-neutral-400">No fees found for this period.</div>
            )}
            {(data.properties || []).map((prop: any) => (
              <div key={prop.property_id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <button
                  onClick={() => setExpanded(e => ({ ...e, [prop.property_id]: !e[prop.property_id] }))}
                  className="w-full flex items-center justify-between px-xl py-md hover:bg-neutral-50 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm font-bold text-neutral-900">{prop.property_name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{prop.landlord_name} · {prop.rows?.length} row(s)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Mgmt {gbp(prop.management_fee_total)} · Letting {gbp(prop.letting_fee_total)}</p>
                    <p className="text-sm font-bold text-indigo-700">{gbp(prop.management_fee_total + prop.letting_fee_total)} total</p>
                  </div>
                </button>
                {expanded[prop.property_id] && (
                  <div className="border-t border-neutral-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-xs text-neutral-500">
                        <tr>
                          {['Period', 'Room', 'Tenant', 'Rent Income', 'Mgmt Fee', 'Letting Fee'].map(h => (
                            <th key={h} className="text-left px-md py-sm font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {(prop.rows || []).map((r: any) => (
                          <tr key={r.id} className="hover:bg-neutral-50">
                            <td className="px-md py-sm text-neutral-600 whitespace-nowrap">{r.period_end?.slice(0, 7)}</td>
                            <td className="px-md py-sm">{r.room}</td>
                            <td className="px-md py-sm text-neutral-600">{r.tenant_name}</td>
                            <td className="px-md py-sm font-mono">{gbp(r.rent_income)}</td>
                            <td className="px-md py-sm font-mono">{gbp(r.management_fee)}</td>
                            <td className="px-md py-sm font-mono">{gbp(r.letting_fee)}</td>
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

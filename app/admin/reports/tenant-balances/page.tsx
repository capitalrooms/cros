'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'


const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

interface Balance {
  tenancy_id: string
  tenant_name: string
  room_name: string
  property_name: string
  total_due: number
  total_received: number
  balance: number
  overdue_months: number
}

export default function TenantBalancesReport() {
  const [rows, setRows]       = useState<Balance[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState<'all' | 'arrears' | 'credit'>('all')
  const [search, setSearch]   = useState('')

  const run = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/reports/tenant-balances')
      const data = await res.json()
      setRows(data.rows)
    } finally { setLoading(false) }
  }

  useEffect(() => { run() }, [])

  const visible = (rows || [])
    .filter(r => filter === 'all' ? true : filter === 'arrears' ? r.balance < 0 : r.balance > 0)
    .filter(r => !search || r.tenant_name.toLowerCase().includes(search.toLowerCase()) || r.property_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.balance - b.balance)

  const totalArrears = (rows || []).filter(r => r.balance < 0).reduce((s, r) => s + Math.abs(r.balance), 0)
  const inArrears    = (rows || []).filter(r => r.balance < 0).length

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Tenant Balances" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-xl">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Tenant Balances</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Live arrears and credit per active tenant.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-md">
          <div className="bg-white rounded-2xl border border-neutral-200 px-lg py-md text-center">
            <p className="text-xl font-bold text-neutral-900">{rows?.length ?? '—'}</p>
            <p className="text-xs text-neutral-400 mt-xs">Active tenancies</p>
          </div>
          <div className="bg-white rounded-2xl border border-red-200 px-lg py-md text-center">
            <p className="text-xl font-bold text-red-600">{inArrears}</p>
            <p className="text-xs text-neutral-400 mt-xs">In arrears</p>
          </div>
          <div className="bg-white rounded-2xl border border-red-200 px-lg py-md text-center">
            <p className="text-xl font-bold text-red-600">{gbp(totalArrears)}</p>
            <p className="text-xs text-neutral-400 mt-xs">Total arrears</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 p-xl space-y-md">
          <div className="flex gap-md flex-wrap items-center">
            <div className="flex gap-sm">
              {(['all','arrears','credit'] as const).map(f => (
                <button key={f} onClick={()=>setFilter(f)} className={`px-md py-sm rounded-lg text-xs font-semibold border ${filter===f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-indigo-300'}`}>
                  {f === 'all' ? 'All' : f === 'arrears' ? 'In arrears' : 'In credit'}
                </button>
              ))}
            </div>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tenant or property…" className="flex-1 min-w-40 border border-neutral-200 rounded-lg px-md py-sm text-sm" />
            <button onClick={run} disabled={loading} className="px-md py-sm rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-600 hover:bg-neutral-200">↻ Refresh</button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-neutral-200 px-xl py-2xl text-center text-sm text-neutral-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200 px-xl py-2xl text-center text-sm text-neutral-400">No balances found</div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    {['Tenant','Room / Property','Total due','Received','Balance','Overdue months'].map(h => (
                      <th key={h} className="px-lg py-sm text-left text-xs font-bold uppercase tracking-wider text-neutral-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {visible.map(r => (
                    <tr key={r.tenancy_id} className={`hover:bg-neutral-50 ${r.balance < 0 ? 'bg-red-50/40' : ''}`}>
                      <td className="px-lg py-md font-semibold text-neutral-900">{r.tenant_name}</td>
                      <td className="px-lg py-md text-neutral-600">
                        <span className="font-medium">{r.room_name}</span>
                        <span className="text-neutral-400"> · {r.property_name}</span>
                      </td>
                      <td className="px-lg py-md tabular-nums">{gbp(r.total_due)}</td>
                      <td className="px-lg py-md tabular-nums text-emerald-700">{gbp(r.total_received)}</td>
                      <td className="px-lg py-md tabular-nums font-bold" style={{color: r.balance < 0 ? '#dc2626' : r.balance > 0 ? '#059669' : '#6b7280'}}>
                        {r.balance < 0 ? `(${gbp(Math.abs(r.balance))})` : gbp(r.balance)}
                      </td>
                      <td className="px-lg py-md">
                        {r.overdue_months > 0 ? <span className="text-red-600 font-semibold">{r.overdue_months}</span> : <span className="text-neutral-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

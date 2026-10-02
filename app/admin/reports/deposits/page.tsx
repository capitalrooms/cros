'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

type Filter = 'all' | 'active' | 'ended'

export default function DepositsReport() {
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function load(f = filter, s = search) {
    setLoading(true)
    const params = new URLSearchParams({ filter: f, search: s })
    const res = await fetch(`/api/admin/reports/deposits?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleFilter(f: Filter) { setFilter(f); load(f, search) }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Deposits" />
      <PageHero eyebrow="Finance · Reports" title="Deposits" subtitle="Deposits held, protection status and scheme references." />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="flex flex-wrap gap-md items-center">
          <div className="flex rounded-lg border border-neutral-200 bg-white overflow-hidden">
            {(['all', 'active', 'ended'] as Filter[]).map(f => (
              <button key={f} onClick={() => handleFilter(f)}
                className={`px-lg py-sm text-sm font-semibold capitalize transition ${filter === f ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                {f}
              </button>
            ))}
          </div>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); }}
            onKeyDown={e => e.key === 'Enter' && load(filter, search)}
            placeholder="Search tenant or property…"
            className="flex-1 min-w-[200px] border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          <button onClick={() => load(filter, search)} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-md">
              {[
                { label: 'Deposits held',     value: gbp(data.totals?.total_held || 0) },
                { label: 'Active tenancies',   value: data.totals?.count || 0 },
                { label: 'Unprotected / active', value: data.totals?.unprotected || 0, warn: (data.totals?.unprotected || 0) > 0 },
              ].map(t => (
                <div key={t.label} className={`rounded-xl border px-lg py-md ${(t as any).warn && (t as any).value > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-neutral-200'}`}>
                  <p className="text-xs text-neutral-500">{t.label}</p>
                  <p className={`text-2xl font-bold mt-xs ${(t as any).warn && (t as any).value > 0 ? 'text-amber-700' : 'text-neutral-900'}`}>{t.value}</p>
                </div>
              ))}
            </div>

            {data.totals?.unprotected > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-lg py-md text-sm text-amber-800">
                <strong>{data.totals.unprotected} active deposit(s)</strong> have no scheme reference recorded. Consider registering them with a deposit protection scheme.
              </div>
            )}

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              {(data.rows || []).length === 0 ? (
                <div className="px-xl py-2xl text-center text-sm text-neutral-400">No deposits found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-500">
                      <tr>
                        {['Tenant', 'Room / Property', 'Start', 'End', 'Deposit', 'Protected', 'Status'].map(h => (
                          <th key={h} className="text-left px-md py-sm font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {(data.rows || []).map((r: any) => (
                        <tr key={r.tenancy_id} className="hover:bg-neutral-50">
                          <td className="px-md py-md font-semibold text-neutral-900">{r.tenant_name}</td>
                          <td className="px-md py-md text-neutral-600">
                            <div>{r.room_name}</div>
                            <div className="text-xs text-neutral-400">{r.property_name}</div>
                          </td>
                          <td className="px-md py-md text-neutral-600 whitespace-nowrap">{fmtDate(r.start_date)}</td>
                          <td className="px-md py-md text-neutral-600 whitespace-nowrap">{fmtDate(r.end_date)}</td>
                          <td className="px-md py-md font-mono font-semibold">{gbp(r.deposit_amount)}</td>
                          <td className="px-md py-md">
                            {r.protected
                              ? <span className="text-xs bg-green-100 text-green-700 rounded-full px-sm py-xs font-semibold">✓ Yes</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-sm py-xs font-semibold">No ref</span>
                            }
                          </td>
                          <td className="px-md py-md">
                            <span className={`text-xs rounded-full px-sm py-xs font-semibold ${r.is_active ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-500'}`}>
                              {r.is_active ? 'Active' : 'Ended'}
                            </span>
                          </td>
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

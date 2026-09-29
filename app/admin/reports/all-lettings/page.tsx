'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

type Filter = 'active' | 'ended' | 'all'

export default function AllLettingsReport() {
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function load(f = filter, s = search) {
    setLoading(true)
    const params = new URLSearchParams({ filter: f, search: s })
    const res = await fetch(`/api/admin/reports/all-lettings?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleFilter(f: Filter) { setFilter(f); load(f, search) }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="All Lettings" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">All Lettings</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Every tenancy with dates, rent, deposit and status.</p>
        </div>
        <div className="flex flex-wrap gap-md items-center">
          <div className="flex rounded-lg border border-neutral-200 bg-white overflow-hidden">
            {(['active', 'ended', 'all'] as Filter[]).map(f => (
              <button key={f} onClick={() => handleFilter(f)}
                className={`px-lg py-sm text-sm font-semibold capitalize transition ${filter === f ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                {f}
              </button>
            ))}
          </div>
          <input type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(filter, search)}
            placeholder="Search tenant or property…"
            className="flex-1 min-w-[200px] border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          <button onClick={() => load(filter, search)} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
              {[
                { label: 'Showing',       value: data.rows?.length || 0 },
                { label: 'Active',        value: data.totals?.active || 0 },
                { label: 'On notice',     value: data.totals?.on_notice || 0 },
                { label: 'Monthly rent',  value: gbp(data.totals?.total_rent || 0) },
              ].map(t => (
                <div key={t.label} className="bg-white rounded-xl border border-neutral-200 px-lg py-md">
                  <p className="text-xs text-neutral-500">{t.label}</p>
                  <p className="text-xl font-bold text-neutral-900 mt-xs">{t.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              {(data.rows || []).length === 0 ? (
                <div className="px-xl py-2xl text-center text-sm text-neutral-400">No tenancies found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-500">
                      <tr>
                        {['Tenant', 'Room / Property', 'Landlord', 'Start', 'End', 'Rent', 'Deposit', 'Protected', 'Status'].map(h => (
                          <th key={h} className="text-left px-md py-sm font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {(data.rows || []).map((r: any) => (
                        <tr key={r.tenancy_id} className="hover:bg-neutral-50">
                          <td className="px-md py-md">
                            <p className="font-semibold text-neutral-900">{r.tenant_name}</p>
                            {r.tenant_email && <p className="text-xs text-neutral-400 truncate max-w-[140px]">{r.tenant_email}</p>}
                          </td>
                          <td className="px-md py-md text-neutral-600">
                            <p>{r.room}</p>
                            <p className="text-xs text-neutral-400">{r.property}</p>
                          </td>
                          <td className="px-md py-md text-neutral-600 whitespace-nowrap">{r.landlord}</td>
                          <td className="px-md py-md text-neutral-500 whitespace-nowrap">{fmtDate(r.start_date)}</td>
                          <td className="px-md py-md text-neutral-500 whitespace-nowrap">{r.end_date ? fmtDate(r.end_date) : <span className="text-green-600 font-semibold">Ongoing</span>}</td>
                          <td className="px-md py-md font-mono">{gbp(r.rent_amount)}/mo</td>
                          <td className="px-md py-md font-mono text-neutral-600">{r.deposit_amount > 0 ? gbp(r.deposit_amount) : '—'}</td>
                          <td className="px-md py-md">
                            {r.deposit_amount > 0
                              ? r.deposit_protected
                                ? <span className="text-xs bg-green-100 text-green-700 rounded-full px-sm py-xs">✓</span>
                                : <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-sm py-xs">No ref</span>
                              : <span className="text-xs text-neutral-300">—</span>
                            }
                          </td>
                          <td className="px-md py-md">
                            {r.is_active
                              ? r.on_notice
                                ? <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-sm py-xs font-semibold">On notice</span>
                                : <span className="text-xs bg-green-100 text-green-700 rounded-full px-sm py-xs font-semibold">Active</span>
                              : <span className="text-xs bg-neutral-100 text-neutral-500 rounded-full px-sm py-xs">Ended</span>
                            }
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

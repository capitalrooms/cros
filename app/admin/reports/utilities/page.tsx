'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const STATUS_COLOUR = {
  current:       { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700', label: 'Current' },
  expiring_soon: { dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700', label: 'Expiring soon' },
  expired:       { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700',     label: 'Expired' },
  missing:       { dot: 'bg-neutral-400',badge: 'bg-neutral-100 text-neutral-500', label: 'Not recorded' },
}

type Filter = 'all' | 'expired' | 'expiring_soon' | 'missing'

export default function UtilitiesReport() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  async function load(f = filter, s = search) {
    setLoading(true)
    const params = new URLSearchParams({ filter: f, search: s })
    const res = await fetch(`/api/admin/reports/utilities?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleFilter(f: Filter) { setFilter(f); load(f, search) }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Utility Expiry Dates" />
      <PageHero eyebrow="Finance · Reports" title="Utility Expiry Dates" subtitle="Gas, electrical, fire detection cert expiries." />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="flex flex-wrap gap-md items-center">
          <div className="flex rounded-lg border border-neutral-200 bg-white overflow-hidden">
            {([
              ['all',           'All'],
              ['expired',       'Expired'],
              ['expiring_soon', 'Expiring soon'],
              ['missing',       'Not recorded'],
            ] as [Filter, string][]).map(([f, label]) => (
              <button key={f} onClick={() => handleFilter(f)}
                className={`px-lg py-sm text-xs font-semibold transition ${filter === f ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                {label}
                {data?.summary && <span className="ml-xs opacity-60">({data.summary[f] ?? data.summary.total})</span>}
              </button>
            ))}
          </div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(filter, search)}
            placeholder="Search property…"
            className="flex-1 min-w-[200px] border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          <button onClick={() => load(filter, search)} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>

        {data?.summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
            {[
              { label: 'Expired',        value: data.summary.expired,       colour: 'text-red-700', bg: 'bg-red-50 border-red-200' },
              { label: 'Expiring soon',  value: data.summary.expiring_soon, colour: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
              { label: 'Not recorded',   value: data.summary.missing,       colour: 'text-neutral-600', bg: 'bg-white border-neutral-200' },
              { label: 'All current',    value: data.summary.current,       colour: 'text-green-700', bg: 'bg-green-50 border-green-200' },
            ].map(t => (
              <div key={t.label} className={`rounded-xl border px-lg py-md ${t.bg}`}>
                <p className="text-xs text-neutral-500">{t.label}</p>
                <p className={`text-2xl font-bold mt-xs ${t.colour}`}>{t.value}</p>
              </div>
            ))}
          </div>
        )}

        {(data?.properties || []).length === 0 && data && (
          <div className="bg-white rounded-xl border border-neutral-200 px-xl py-2xl text-center text-sm text-neutral-400">No properties match this filter.</div>
        )}

        {(data?.properties || []).map((prop: any) => {
          const worst = STATUS_COLOUR[prop.worst_status as keyof typeof STATUS_COLOUR] || STATUS_COLOUR.missing
          return (
            <div key={prop.property_id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <button onClick={() => setExpanded(e => ({ ...e, [prop.property_id]: !e[prop.property_id] }))}
                className="w-full flex items-center gap-md px-xl py-md hover:bg-neutral-50 transition-colors">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${worst.dot}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-neutral-900">{prop.property_name}</p>
                  <p className="text-xs text-neutral-400">{prop.landlord_name}</p>
                </div>
                <span className={`text-xs font-semibold px-sm py-xs rounded-full ${worst.badge}`}>{worst.label}</span>
              </button>

              {expanded[prop.property_id] && (
                <div className="border-t border-neutral-100">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-500">
                      <tr>
                        {['Certificate', 'Last recorded', 'Expiry', 'Status', 'Days'].map(h => (
                          <th key={h} className="text-left px-md py-sm font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {(prop.certs || []).map((cert: any) => {
                        const s = STATUS_COLOUR[cert.status as keyof typeof STATUS_COLOUR] || STATUS_COLOUR.missing
                        return (
                          <tr key={cert.key} className="hover:bg-neutral-50">
                            <td className="px-md py-sm font-medium text-neutral-800">{cert.label}</td>
                            <td className="px-md py-sm text-neutral-500">{fmtDate(cert.date)}</td>
                            <td className="px-md py-sm text-neutral-500">{fmtDate(cert.expiry)}</td>
                            <td className="px-md py-sm">
                              <span className={`text-xs font-semibold px-sm py-xs rounded-full ${s.badge}`}>{s.label}</span>
                            </td>
                            <td className="px-md py-sm text-xs font-mono text-neutral-500">
                              {cert.days_until_expiry != null
                                ? cert.days_until_expiry < 0
                                  ? <span className="text-red-600">{Math.abs(cert.days_until_expiry)}d overdue</span>
                                  : `${cert.days_until_expiry}d`
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const PRIORITY_COLOUR: Record<string, string> = {
  emergency: 'bg-red-100 text-red-700',
  high:      'bg-orange-100 text-orange-700',
  medium:    'bg-amber-100 text-amber-700',
  low:       'bg-neutral-100 text-neutral-600',
}

const STATUS_COLOUR: Record<string, string> = {
  completed:   'bg-green-100 text-green-700',
  awaiting:    'bg-amber-100 text-amber-700',
  approved:    'bg-blue-100 text-blue-700',
  booked:      'bg-indigo-100 text-indigo-700',
  on_hold:     'bg-neutral-100 text-neutral-500',
  cancelled:   'bg-neutral-100 text-neutral-400',
}

export default function MaintenanceReport() {
  const [from, setFrom]     = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 2, 1); return d.toISOString().slice(0, 10) })
  const [to, setTo]         = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ from, to, search, status, priority })
    const res = await fetch(`/api/admin/reports/maintenance?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Maintenance Jobs" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Maintenance Jobs</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Job history with status, priority and contractor.</p>
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
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400">
              <option value="">All statuses</option>
              {['awaiting', 'approved', 'booked', 'completed', 'on_hold', 'cancelled'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400">
              <option value="">All</option>
              {['emergency', 'high', 'medium', 'low'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Search</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Property or job title" className="w-full border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
          </div>
          <button onClick={load} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Run'}
          </button>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
              {[
                { label: 'Total Jobs',  value: data.totals?.total || 0 },
                { label: 'Open',        value: data.totals?.open || 0 },
                { label: 'Completed',   value: data.totals?.completed || 0 },
                { label: 'On Hold',     value: data.totals?.on_hold || 0 },
              ].map(t => (
                <div key={t.label} className="bg-white rounded-xl border border-neutral-200 px-lg py-md">
                  <p className="text-xs text-neutral-500">{t.label}</p>
                  <p className="text-2xl font-bold text-neutral-900 mt-xs">{t.value}</p>
                </div>
              ))}
            </div>

            {data.by_priority && (
              <div className="flex gap-sm flex-wrap">
                {Object.entries(data.by_priority as Record<string, number>).filter(([, n]) => n > 0).map(([p, n]) => (
                  <span key={p} className={`text-xs font-semibold px-md py-sm rounded-full ${PRIORITY_COLOUR[p] || 'bg-neutral-100 text-neutral-600'}`}>
                    {p} ({n})
                  </span>
                ))}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              {(data.jobs || []).length === 0 ? (
                <div className="px-xl py-2xl text-center text-sm text-neutral-400">No jobs for this period.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {(data.jobs || []).map((job: any) => (
                    <div key={job.id} className="px-xl py-md">
                      <div className="flex items-start justify-between gap-md flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-sm flex-wrap mb-xs">
                            <span className={`text-xs font-semibold px-sm py-xs rounded-full ${PRIORITY_COLOUR[job.priority] || 'bg-neutral-100 text-neutral-600'}`}>{job.priority}</span>
                            <span className={`text-xs font-semibold px-sm py-xs rounded-full ${STATUS_COLOUR[job.status] || 'bg-neutral-100 text-neutral-500'}`}>{job.status}</span>
                            {job.on_hold && <span className="text-xs bg-yellow-100 text-yellow-700 px-sm py-xs rounded-full font-semibold">On hold</span>}
                          </div>
                          <p className="text-sm font-semibold text-neutral-900">{job.title}</p>
                          <p className="text-xs text-neutral-500 mt-xs">{job.property}{job.location ? ` · ${job.location}` : ''}{job.contractor ? ` · ${job.contractor}` : ''}</p>
                        </div>
                        <div className="text-right text-xs text-neutral-400 shrink-0">
                          <p>Raised {fmtDate(job.created_at.slice(0, 10))}</p>
                          {job.booked_date && <p className="text-indigo-600">Booked {fmtDate(job.booked_date)}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

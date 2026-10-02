'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

const gbp = (n: number | null) => n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
const fmtDate = (s: string | null) => s ? new Date(s.slice(0,10)+'T00:00:00').toLocaleDateString('en-GB') : '—'

interface VoidRoom {
  room_id: string
  room_name: string
  property_id: string
  property_name: string
  property_address: string
  monthly_rent: number | null
  last_tenant: string | null
  last_end_date: string | null
  days_void: number
}

export default function VoidsReport() {
  const [rows, setRows]       = useState<VoidRoom[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')

  const run = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/reports/voids')
      const data = await res.json()
      setRows(data.rooms)
    } finally { setLoading(false) }
  }

  useEffect(() => { run() }, [])

  const visible = (rows || []).filter(r =>
    !search || r.property_name.toLowerCase().includes(search.toLowerCase()) || r.room_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalWeeklyLoss = visible.reduce((s, r) => s + (r.monthly_rent ? r.monthly_rent / 4.33 : 0), 0)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Voids" />
      <PageHero eyebrow="Finance · Reports" title="Voids" subtitle="Empty rooms and properties, days void, weekly income lost." />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-xl">

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-md">
          <div className="bg-white rounded-2xl border border-neutral-200 px-lg py-md text-center">
            <p className="text-xl font-bold text-neutral-900">{loading ? '…' : rows?.length ?? '—'}</p>
            <p className="text-xs text-neutral-400 mt-xs">Void rooms</p>
          </div>
          <div className="bg-white rounded-2xl border border-amber-200 px-lg py-md text-center">
            <p className="text-xl font-bold text-amber-600">{gbp(totalWeeklyLoss)}</p>
            <p className="text-xs text-neutral-400 mt-xs">Weekly income lost</p>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 px-lg py-md text-center">
            <p className="text-xl font-bold text-neutral-700">{visible.length > 0 ? Math.round(visible.reduce((s,r)=>s+r.days_void,0)/visible.length) : '—'}</p>
            <p className="text-xs text-neutral-400 mt-xs">Avg days void</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 px-xl py-lg flex gap-md items-center">
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search property or room…" className="flex-1 border border-neutral-200 rounded-lg px-md py-sm text-sm" />
          <button onClick={run} disabled={loading} className="px-md py-sm rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-600 hover:bg-neutral-200">↻ Refresh</button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-neutral-200 px-xl py-2xl text-center text-sm text-neutral-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200 px-xl py-2xl text-center">
            <p className="text-2xl mb-md">🏠</p>
            <p className="text-sm font-semibold text-neutral-700">No void rooms found</p>
            <p className="text-xs text-neutral-400 mt-xs">All rooms are currently occupied</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    {['Property','Room','Monthly rent','Days void','Last tenant','Vacated'].map(h => (
                      <th key={h} className="px-lg py-sm text-left text-xs font-bold uppercase tracking-wider text-neutral-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {visible.sort((a,b) => b.days_void - a.days_void).map(r => (
                    <tr key={r.room_id} className="hover:bg-neutral-50">
                      <td className="px-lg py-md">
                        <Link href={`/admin/properties/${r.property_id}`} className="font-semibold text-indigo-700 hover:underline">{r.property_name || r.property_address}</Link>
                      </td>
                      <td className="px-lg py-md font-medium text-neutral-700">{r.room_name}</td>
                      <td className="px-lg py-md tabular-nums text-neutral-600">{gbp(r.monthly_rent)}</td>
                      <td className="px-lg py-md">
                        <span className={`font-bold ${r.days_void > 30 ? 'text-red-600' : r.days_void > 14 ? 'text-amber-600' : 'text-neutral-600'}`}>{r.days_void}</span>
                      </td>
                      <td className="px-lg py-md text-neutral-500">{r.last_tenant || '—'}</td>
                      <td className="px-lg py-md text-neutral-500">{fmtDate(r.last_end_date)}</td>
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

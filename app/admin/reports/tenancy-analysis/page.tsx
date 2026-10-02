'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const monthLabel = (ym: string) => new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })

export default function TenancyAnalysisReport() {
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/reports/tenancy-analysis')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <>
      <AppBar left={<BackButton href="/admin/reports" />} title="Tenancy Analysis" />
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-neutral-600 animate-spin" />
      </div>
    </>
  )

  const counts = data?.counts || {}
  const moves  = data?.monthly_moves || []
  const maxMoves = Math.max(...moves.map((m: any) => Math.max(m.starts, m.ends)), 1)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Tenancy Analysis" />
      <PageHero eyebrow="Finance · Reports" title="Tenancy Analysis" subtitle="Active, on notice, void counts and monthly move chart." />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        {/* Summary tiles */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-md">
          {[
            { label: 'Active',     value: counts.active || 0,           colour: 'text-green-700', bg: 'bg-green-50 border-green-200' },
            { label: 'On notice',  value: counts.on_notice || 0,        colour: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
            { label: 'Void rooms', value: counts.void_rooms || 0,       colour: 'text-red-700',   bg: 'bg-red-50 border-red-200' },
            { label: 'Total rooms',value: counts.total_rooms || 0,      colour: 'text-neutral-700',bg: 'bg-white border-neutral-200' },
            { label: 'Ended',      value: counts.ended || 0,            colour: 'text-neutral-600',bg: 'bg-white border-neutral-200' },
            { label: 'Up for renewal', value: counts.upcoming_renewals || 0, colour: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
          ].map(t => (
            <div key={t.label} className={`rounded-xl border px-md py-md text-center ${t.bg}`}>
              <p className="text-xs text-neutral-400 mb-xs">{t.label}</p>
              <p className={`text-3xl font-bold ${t.colour}`}>{t.value}</p>
            </div>
          ))}
        </div>

        {data?.avg_tenancy_days && (
          <div className="bg-white rounded-xl border border-neutral-200 px-lg py-md text-sm text-neutral-700">
            Average tenancy length: <strong>{Math.round(data.avg_tenancy_days / 30)} months</strong> ({data.avg_tenancy_days} days)
          </div>
        )}

        {/* Moves chart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-lg">Move-ins & Move-outs (last 12 months)</p>
          <div className="flex items-end gap-sm h-24 overflow-x-auto">
            {moves.map((m: any) => (
              <div key={m.month} className="flex flex-col items-center gap-xs shrink-0 w-10">
                <div className="w-full flex flex-col items-center gap-0.5">
                  <div title={`${m.starts} starts`} className="w-4 bg-green-400 rounded-sm" style={{ height: `${Math.round((m.starts / maxMoves) * 72)}px`, minHeight: m.starts > 0 ? '4px' : '0' }} />
                  <div title={`${m.ends} ends`} className="w-4 bg-red-300 rounded-sm" style={{ height: `${Math.round((m.ends / maxMoves) * 72)}px`, minHeight: m.ends > 0 ? '4px' : '0' }} />
                </div>
                <span className="text-xs text-neutral-400">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-lg mt-md text-xs text-neutral-500">
            <span className="flex items-center gap-xs"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Move-ins</span>
            <span className="flex items-center gap-xs"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Move-outs</span>
          </div>
        </div>

        {/* Upcoming renewals */}
        {(data?.upcoming_renewals || []).length > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-xl py-md border-b border-neutral-100">
              <p className="text-sm font-bold text-neutral-900">Upcoming renewals (next 90 days)</p>
            </div>
            <div className="divide-y divide-neutral-100">
              {(data.upcoming_renewals || []).map((r: any) => (
                <div key={r.tenancy_id} className="px-xl py-md flex items-center justify-between gap-md flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{r.tenant_name}</p>
                    <p className="text-xs text-neutral-400">{r.room} · {r.property}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-neutral-500">Ends</p>
                    <p className="text-sm font-semibold text-amber-700">{fmtDate(r.end_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Void rooms */}
        {(data?.void_rooms || []).length > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-xl py-md border-b border-neutral-100">
              <p className="text-sm font-bold text-neutral-900">Void rooms</p>
            </div>
            <div className="divide-y divide-neutral-100">
              {(data.void_rooms || []).map((r: any) => (
                <div key={r.room_id} className="px-xl py-md flex items-center justify-between gap-md">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{r.room_name}</p>
                    <p className="text-xs text-neutral-400">{r.property}</p>
                  </div>
                  <p className="text-sm font-mono text-neutral-600">{r.asking_rent != null ? gbp(Number(r.asking_rent)) + '/mo' : '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

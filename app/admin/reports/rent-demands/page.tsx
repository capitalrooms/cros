'use client'

import { useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number | null) => n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
const fmtDate = (s: string) => new Date(s.slice(0,10)+'T00:00:00').toLocaleDateString('en-GB')
const fmtMonth = (s: string) => new Date(s.slice(0,7)+'-01T00:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'})

const today = new Date().toISOString().slice(0, 10)
const firstOfMonth = today.slice(0, 8) + '01'

interface Row {
  id: string
  charge_month: string
  amount_due: number
  amount_received: number | null
  status: string
  reference: string | null
  tenant_name: string
  room_name: string
  property_name: string
  landlord_name: string | null
}

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-neutral-100 text-neutral-600',
  paid:     'bg-emerald-100 text-emerald-700',
  partial:  'bg-amber-100 text-amber-700',
  overdue:  'bg-red-100 text-red-700',
}

export default function RentDemandsReport() {
  const [from, setFrom]             = useState(firstOfMonth)
  const [to, setTo]                 = useState(today)
  const [outstandingOnly, setOutstandingOnly] = useState(false)
  const [property, setProperty]     = useState('')
  const [tenant, setTenant]         = useState('')
  const [landlord, setLandlord]     = useState('')
  const [rows, setRows]             = useState<Row[] | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const run = async () => {
    setLoading(true); setError(null)
    const p = new URLSearchParams({ from, to })
    if (outstandingOnly) p.set('outstanding', '1')
    if (property) p.set('property', property)
    if (tenant) p.set('tenant', tenant)
    if (landlord) p.set('landlord', landlord)
    try {
      const res  = await fetch(`/api/admin/reports/rent-demands?${p}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data.rows)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  const total_due      = rows?.reduce((s, r) => s + r.amount_due, 0) ?? 0
  const total_received = rows?.reduce((s, r) => s + (r.amount_received ?? 0), 0) ?? 0
  const total_outstanding = total_due - total_received

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Rent Demands" />
      <PageHero eyebrow="Finance · Reports" title="Rent Demands" subtitle="Rent due in a date range, with outstanding filter." />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-xl">

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-xl space-y-lg">
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
            <div><label className="text-xs font-semibold text-neutral-500 block mb-xs">From</label>
              <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm" /></div>
            <div><label className="text-xs font-semibold text-neutral-500 block mb-xs">To</label>
              <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm" /></div>
            <div><label className="text-xs font-semibold text-neutral-500 block mb-xs">Property</label>
              <input type="text" value={property} onChange={e=>setProperty(e.target.value)} placeholder="Any" className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm" /></div>
            <div><label className="text-xs font-semibold text-neutral-500 block mb-xs">Tenant</label>
              <input type="text" value={tenant} onChange={e=>setTenant(e.target.value)} placeholder="Any" className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm" /></div>
            <div><label className="text-xs font-semibold text-neutral-500 block mb-xs">Landlord</label>
              <input type="text" value={landlord} onChange={e=>setLandlord(e.target.value)} placeholder="Any" className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm" /></div>
            <div className="flex items-end pb-sm">
              <label className="flex items-center gap-sm text-sm text-neutral-600 cursor-pointer">
                <input type="checkbox" checked={outstandingOnly} onChange={e=>setOutstandingOnly(e.target.checked)} className="rounded" />
                Outstanding only
              </label>
            </div>
          </div>
          <div className="flex gap-md">
            <button onClick={run} disabled={loading} className="px-lg py-sm rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Running…' : 'Run report'}
            </button>
            <button onClick={()=>{setRows(null);setError(null)}} className="px-lg py-sm rounded-xl border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50">Reset</button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Results */}
        {rows && (
          <>
            {/* Totals */}
            <div className="grid grid-cols-3 gap-md">
              {[
                { label: 'Total due', value: gbp(total_due), color: 'text-neutral-900' },
                { label: 'Total received', value: gbp(total_received), color: 'text-emerald-700' },
                { label: 'Outstanding', value: gbp(total_outstanding), color: total_outstanding > 0 ? 'text-red-600' : 'text-neutral-400' },
              ].map(t => (
                <div key={t.label} className="bg-white rounded-2xl border border-neutral-200 px-lg py-md text-center">
                  <p className={`text-xl font-bold ${t.color}`}>{t.value}</p>
                  <p className="text-xs text-neutral-400 mt-xs">{t.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <div className="px-xl py-md border-b border-neutral-100">
                <p className="text-sm font-semibold text-neutral-700">{rows.length} charge{rows.length !== 1 ? 's' : ''}</p>
              </div>
              {rows.length === 0 ? (
                <p className="px-xl py-xl text-sm text-neutral-400">No rent charges found for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 border-b border-neutral-100">
                      <tr>
                        {['Period','Tenant','Room / Property','Due','Received','Outstanding','Status'].map(h => (
                          <th key={h} className="px-lg py-sm text-left text-xs font-bold uppercase tracking-wider text-neutral-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {rows.map(r => {
                        const outstanding = r.amount_due - (r.amount_received ?? 0)
                        return (
                          <tr key={r.id} className="hover:bg-neutral-50">
                            <td className="px-lg py-md text-neutral-600 whitespace-nowrap">{fmtMonth(r.charge_month)}</td>
                            <td className="px-lg py-md font-semibold text-neutral-900">{r.tenant_name}</td>
                            <td className="px-lg py-md text-neutral-600">
                              <span className="font-medium">{r.room_name}</span>
                              <span className="text-neutral-400"> · {r.property_name}</span>
                            </td>
                            <td className="px-lg py-md font-semibold tabular-nums">{gbp(r.amount_due)}</td>
                            <td className="px-lg py-md tabular-nums text-emerald-700">{gbp(r.amount_received)}</td>
                            <td className="px-lg py-md tabular-nums font-semibold" style={{color: outstanding > 0 ? '#dc2626' : '#6b7280'}}>{gbp(outstanding)}</td>
                            <td className="px-lg py-md">
                              <span className={`px-sm py-xs rounded-md text-xs font-semibold ${STATUS_STYLE[r.status] || STATUS_STYLE.pending}`}>{r.status}</span>
                            </td>
                          </tr>
                        )
                      })}
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

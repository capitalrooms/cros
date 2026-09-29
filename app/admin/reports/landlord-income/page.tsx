'use client'

import { useState, useEffect } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const thisYear = new Date().getFullYear()
const TAX_YEARS = Array.from({ length: 5 }, (_, i) => thisYear - i).map(y => ({
  label: `${y}/${String(y + 1).slice(2)} Tax Year`,
  from: `${y}-04-06`,
  to:   `${y + 1}-04-05`,
}))

export default function LandlordIncomeReport() {
  const [mode, setMode]     = useState<'tax' | 'custom'>('tax')
  const [taxYear, setTaxYear] = useState(TAX_YEARS[0])
  const [from, setFrom]     = useState(TAX_YEARS[0].from)
  const [to, setTo]         = useState(TAX_YEARS[0].to)
  const [search, setSearch] = useState('')
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const effectiveFrom = mode === 'tax' ? taxYear.from : from
  const effectiveTo   = mode === 'tax' ? taxYear.to   : to

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ from: effectiveFrom, to: effectiveTo, search })
    const res = await fetch(`/api/admin/reports/landlord-income?${params}`)
    setData(await res.json())
    setLoading(false)
  }

  async function downloadPDF() {
    setPdfLoading(true)
    const res = await fetch('/api/admin/reports/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'landlord_income', from: effectiveFrom, to: effectiveTo, landlord_name: search }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `landlord-income-${effectiveFrom.slice(0, 7)}-to-${effectiveTo.slice(0, 7)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    }
    setPdfLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Landlord Income Analysis" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Landlord Income Analysis</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Income and deductions per landlord over time.</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
          <div className="flex gap-sm">
            {(['tax', 'custom'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-lg py-sm text-sm font-semibold rounded-lg transition ${mode === m ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                {m === 'tax' ? 'UK Tax Year' : 'Custom Dates'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-md items-end">
            {mode === 'tax' ? (
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-xs">Tax Year</label>
                <select value={taxYear.from} onChange={e => setTaxYear(TAX_YEARS.find(t => t.from === e.target.value)!)}
                  className="border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400">
                  {TAX_YEARS.map(t => <option key={t.from} value={t.from}>{t.label}</option>)}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-xs">From</label>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-xs">To</label>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                </div>
              </>
            )}
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold text-neutral-500 mb-xs">Landlord name (optional)</label>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Leave blank for all landlords" className="w-full border border-neutral-300 rounded-lg px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
            </div>
            <button onClick={load} disabled={loading} className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50">
              {loading ? 'Loading…' : 'Run'}
            </button>
          </div>
        </div>

        {data && (data.landlords || []).length === 0 && (
          <div className="bg-white rounded-xl border border-neutral-200 px-xl py-2xl text-center text-sm text-neutral-400">No data found. Try a different period or search term.</div>
        )}

        {data && (data.landlords || []).length > 0 && (
          <>
            <div className="flex justify-end">
              <button onClick={downloadPDF} disabled={pdfLoading}
                className="flex items-center gap-sm px-lg py-sm text-sm font-semibold bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">
                {pdfLoading ? 'Generating…' : '↓ Download PDF'}
              </button>
            </div>

            {(data.landlords || []).map((landlord: any) => (
              <div key={landlord.landlord_id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="px-xl py-md border-b border-neutral-100 flex items-start justify-between flex-wrap gap-md">
                  <div>
                    <p className="text-base font-bold text-neutral-900">{landlord.landlord_name}</p>
                    <p className="text-xs text-neutral-400">{landlord.email}</p>
                  </div>
                  <div className="flex gap-lg text-right text-sm flex-wrap">
                    <div><p className="text-xs text-neutral-400">Gross Rent</p><p className="font-bold">{gbp(landlord.rent)}</p></div>
                    <div><p className="text-xs text-neutral-400">Fees</p><p className="font-bold text-red-600">−{gbp(landlord.management_fees + landlord.letting_fees)}</p></div>
                    <div><p className="text-xs text-neutral-400">Expenses</p><p className="font-bold text-red-600">−{gbp(landlord.expenses)}</p></div>
                    <div><p className="text-xs text-neutral-400">Net</p><p className="font-bold text-green-700">{gbp(landlord.net)}</p></div>
                  </div>
                </div>

                {(landlord.properties || []).map((prop: any) => (
                  <div key={prop.property_id} className="border-b border-neutral-100 last:border-b-0">
                    <button onClick={() => setExpanded(e => ({ ...e, [prop.property_id]: !e[prop.property_id] }))}
                      className="w-full flex items-center justify-between px-xl py-sm hover:bg-neutral-50 transition-colors">
                      <p className="text-sm font-semibold text-neutral-700">{prop.property_name}</p>
                      <div className="flex gap-lg text-xs text-right">
                        <span>Rent {gbp(prop.rent)}</span>
                        <span>Fees {gbp(prop.management_fees + prop.letting_fees)}</span>
                        <span className="font-semibold text-green-700">Net {gbp(prop.net)}</span>
                      </div>
                    </button>
                    {expanded[prop.property_id] && (
                      <div className="overflow-x-auto bg-neutral-50">
                        <table className="w-full text-xs">
                          <thead className="text-neutral-500 border-b border-neutral-200">
                            <tr>
                              {['Month', 'Rent', 'Mgmt Fee', 'Letting Fee', 'Net'].map(h => (
                                <th key={h} className="text-left px-md py-sm font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {(prop.months || []).map((m: any) => {
                              const net = Number(m.rent || 0) - Number(m.mgmt || 0) - Number(m.letting || 0) - Number(m.expenses || 0)
                              return (
                                <tr key={m.month}>
                                  <td className="px-md py-sm text-neutral-600">{m.month}</td>
                                  <td className="px-md py-sm font-mono">{gbp(m.rent || 0)}</td>
                                  <td className="px-md py-sm font-mono">{gbp(m.mgmt || 0)}</td>
                                  <td className="px-md py-sm font-mono">{gbp(m.letting || 0)}</td>
                                  <td className="px-md py-sm font-mono font-semibold text-green-700">{gbp(net)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

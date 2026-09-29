'use client'

import { useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const gbp = (n: number | null) => n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

// Build list of available UK tax years from 2020 to next year
function taxYears() {
  const years: string[] = []
  const current = new Date().getFullYear()
  for (let y = current + 1; y >= 2020; y--) {
    years.push(`${y - 1}-${y}`)
  }
  return years
}

interface PropertyBreakdown {
  property_id: string
  property_name: string
  property_address: string
  gross_rent: number
  management_fees: number
  expenses: number
  net_income: number
}

interface TaxSummary {
  landlord_name: string
  period_from: string
  period_to: string
  tax_year: string | null
  gross_rent: number
  management_fees: number
  expenses: number
  net_income: number
  properties: PropertyBreakdown[]
}

const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default function TaxYearReport() {
  const years = taxYears()
  const currentYear = `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`

  const [mode, setMode]           = useState<'tax_year' | 'custom'>('tax_year')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [customFrom, setCustomFrom]     = useState('')
  const [customTo, setCustomTo]         = useState('')
  const [landlord, setLandlord]         = useState('')
  const [result, setResult]             = useState<TaxSummary | null>(null)
  const [loading, setLoading]           = useState(false)
  const [pdfLoading, setPdfLoading]     = useState(false)
  const [error, setError]               = useState<string | null>(null)

  async function downloadPDF() {
    if (!result) return
    setPdfLoading(true)
    const res = await fetch('/api/admin/reports/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'tax_year', from: result.period_from, to: result.period_to, landlord_name: landlord }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tax-year-summary-${result.period_from.slice(0, 7)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    }
    setPdfLoading(false)
  }

  const run = async () => {
    if (!landlord.trim()) { setError('Enter a landlord name'); return }
    setLoading(true); setError(null); setResult(null)
    const p = new URLSearchParams({ landlord })
    if (mode === 'tax_year') {
      p.set('tax_year', selectedYear)
    } else {
      if (!customFrom || !customTo) { setError('Enter both dates'); setLoading(false); return }
      p.set('from', customFrom)
      p.set('to', customTo)
    }
    try {
      const res  = await fetch(`/api/admin/reports/tax-year?${p}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/reports" />} title="Tax Year Summary" />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-xl">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Tax Year Summary</h1>
          <p className="text-sm text-neutral-500 mt-0.5">April–April (or custom) income and deductions per landlord.</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-xl space-y-lg">
          <div>
            
            <p className="text-xs text-neutral-400 mt-xs">Gross rental income, management fees and expenses — for one landlord, in any period.</p>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-sm">
            <button onClick={()=>setMode('tax_year')} className={`px-md py-sm rounded-lg text-xs font-semibold border ${mode==='tax_year' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-600 border-neutral-200'}`}>
              UK Tax Year
            </button>
            <button onClick={()=>setMode('custom')} className={`px-md py-sm rounded-lg text-xs font-semibold border ${mode==='custom' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-600 border-neutral-200'}`}>
              Custom dates
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-md">
            {mode === 'tax_year' ? (
              <div>
                <label className="text-xs font-semibold text-neutral-500 block mb-xs">Tax year</label>
                <select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)} className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <p className="text-xs text-neutral-400 mt-xs">6 Apr – 5 Apr</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 block mb-xs">From</label>
                  <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 block mb-xs">To</label>
                  <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm" />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-semibold text-neutral-500 block mb-xs">Landlord name</label>
              <input type="text" value={landlord} onChange={e=>setLandlord(e.target.value)} placeholder="e.g. John Smith" className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm" />
            </div>
          </div>

          <div className="flex gap-md">
            <button onClick={run} disabled={loading} className="px-lg py-sm rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Generating…' : 'Generate summary'}
            </button>
            <button onClick={()=>{setResult(null);setError(null)}} className="px-lg py-sm rounded-xl border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50">Reset</button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {result && (
          <div className="space-y-lg">
            <div className="flex justify-end">
              <button onClick={downloadPDF} disabled={pdfLoading}
                className="flex items-center gap-sm px-lg py-sm text-sm font-semibold bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50">
                {pdfLoading ? 'Generating PDF…' : '↓ Download PDF'}
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-neutral-200 p-xl space-y-lg">
              <div className="border-b border-neutral-100 pb-lg">
                <h3 className="text-base font-bold text-neutral-900">{result.landlord_name}</h3>
                <p className="text-xs text-neutral-400 mt-xs">
                  {result.tax_year ? `Tax year ${result.tax_year} · ` : ''}
                  {fmtDate(result.period_from)} – {fmtDate(result.period_to)}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
                {[
                  { label: 'Gross rent',       value: result.gross_rent,       color: 'text-neutral-900' },
                  { label: 'Management fees',  value: result.management_fees,  color: 'text-red-600' },
                  { label: 'Expenses',         value: result.expenses,         color: 'text-red-600' },
                  { label: 'Net income',       value: result.net_income,       color: 'text-emerald-700' },
                ].map(t => (
                  <div key={t.label} className="text-center p-md rounded-xl bg-neutral-50">
                    <p className={`text-lg font-bold tabular-nums ${t.color}`}>{gbp(t.value)}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{t.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {result.properties.length > 0 && (
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="px-xl py-md border-b border-neutral-100">
                  <p className="text-sm font-bold text-neutral-900">Per property</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 border-b border-neutral-100">
                      <tr>
                        {['Property','Gross rent','Mgmt fees','Expenses','Net income'].map(h => (
                          <th key={h} className="px-lg py-sm text-left text-xs font-bold uppercase tracking-wider text-neutral-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {result.properties.map(p => (
                        <tr key={p.property_id} className="hover:bg-neutral-50">
                          <td className="px-lg py-md">
                            <p className="font-semibold text-neutral-900">{p.property_name || p.property_address}</p>
                            {p.property_name && <p className="text-xs text-neutral-400">{p.property_address}</p>}
                          </td>
                          <td className="px-lg py-md tabular-nums">{gbp(p.gross_rent)}</td>
                          <td className="px-lg py-md tabular-nums text-red-600">{gbp(p.management_fees)}</td>
                          <td className="px-lg py-md tabular-nums text-red-600">{gbp(p.expenses)}</td>
                          <td className="px-lg py-md tabular-nums font-bold text-emerald-700">{gbp(p.net_income)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-lg py-md text-xs text-amber-700">
              This report is for informational purposes. All figures should be verified against official HMRC submissions. For tax advice, consult a qualified accountant.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

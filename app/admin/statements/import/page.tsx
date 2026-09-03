'use client'

// Admin page: bulk historical CSV import of expense line items.
// Drop a CSV exported from the source accounting software, pick the property
// and landlord, and the system AI-categorises each row and deduplicates.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface Property { id: string; name: string; address: string; landlord_id: string | null }
interface Landlord { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string }

export default function StatementImportPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [landlordId, setLandlordId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ inserted: number; duplicates: number; errors: string[]; total: number } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin'].includes(data.assignment?.role ?? '')) {
        router.push('/login')
        return
      }
      const supabase = createClient()
      const [{ data: props }, { data: lands }] = await Promise.all([
        supabase.from('properties').select('id, name, address, landlord_id').order('name'),
        supabase.from('people').select('id, full_name, first_name, last_name, email').eq('role', 'landlord').order('full_name'),
      ])
      setProperties(props || [])
      setLandlords(lands || [])
      setLoading(false)
    }
    load()
  }, [router])

  function landlordName(l: Landlord) {
    return (l.first_name && l.last_name ? `${l.first_name} ${l.last_name}` : l.full_name) || l.email
  }

  async function handleFile(f: File) {
    setFile(f)
    setResult(null)
    setError('')
    const text = await f.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 6)
    const rows = lines.map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
    setPreview(rows)
  }

  async function handleImport() {
    if (!file || !propertyId || !landlordId) {
      setError('Please select a property, landlord, and CSV file.')
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    const form = new FormData()
    form.append('file', file)
    form.append('property_id', propertyId)
    form.append('landlord_id', landlordId)

    try {
      const res = await fetch('/api/admin/statements/import-csv', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton />} />
      <main className="mx-auto max-w-3xl px-lg py-2xl">
        <div className="animate-pulse h-8 w-64 bg-neutral-300 rounded-lg" />
      </main>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton />} />
      <main className="mx-auto max-w-3xl px-lg py-2xl space-y-xl">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Historical Expense Import</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Upload a CSV exported from your accounting software. Each row should represent one expense line item with at least a date, description, and amount. The system will AI-categorise each row and skip duplicates automatically.
          </p>
        </div>

        {/* Expected columns hint */}
        <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-md">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Expected CSV columns (flexible matching)</p>
          <div className="flex flex-wrap gap-xs">
            {['date', 'description', 'amount', 'statement_ref (optional)', 'property_address (optional)'].map(c => (
              <code key={c} className="px-xs py-0.5 rounded bg-neutral-100 text-xs text-neutral-700 border border-neutral-200">{c}</code>
            ))}
          </div>
          <p className="text-xs text-neutral-400 mt-xs">Column names don't need to match exactly — the importer fuzzy-matches common variants.</p>
        </div>

        <div className="rounded-2xl bg-white p-xl space-y-lg">
          {/* Property */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">Property</label>
            <select
              value={propertyId}
              onChange={e => {
                const pid = e.target.value
                setPropertyId(pid)
                // Auto-fill landlord from property's landlord_id
                const prop = properties.find(p => p.id === pid)
                if (prop?.landlord_id) setLandlordId(prop.landlord_id)
              }}
              className="input-field w-full"
            >
              <option value="">Select property…</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.address}</option>
              ))}
            </select>
          </div>

          {/* Landlord — auto-filled from property, still overridable */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">
              Landlord
              {propertyId && landlordId && (
                <span className="ml-sm text-xs font-normal text-neutral-400">(auto-filled from property)</span>
              )}
            </label>
            <select
              value={landlordId}
              onChange={e => setLandlordId(e.target.value)}
              className="input-field w-full"
            >
              <option value="">Select landlord…</option>
              {landlords.map(l => (
                <option key={l.id} value={l.id}>{landlordName(l)} ({l.email})</option>
              ))}
            </select>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">CSV File</label>
            <div
              className="rounded-xl border-2 border-dashed border-neutral-300 p-xl text-center cursor-pointer hover:border-neutral-400 transition-colors"
              onClick={() => document.getElementById('csv-input')?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              {file ? (
                <div>
                  <p className="text-sm font-medium text-neutral-900">📄 {file.name}</p>
                  <p className="text-xs text-neutral-400 mt-xs">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-neutral-500">Drop CSV here or click to browse</p>
                  <p className="text-xs text-neutral-400 mt-xs">Exported from your accounting software</p>
                </div>
              )}
              <input id="csv-input" type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Preview (first 5 rows)</p>
              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="text-xs w-full">
                  {preview.map((row, i) => (
                    <tr key={i} className={i === 0 ? 'bg-neutral-50 font-semibold' : 'border-t border-neutral-100'}>
                      {row.map((cell, j) => (
                        <td key={j} className="px-sm py-xs text-neutral-700 whitespace-nowrap max-w-32 overflow-hidden text-ellipsis">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </table>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleImport}
            disabled={busy || !file || !propertyId || !landlordId}
            className="btn-primary w-full py-md disabled:opacity-40"
          >
            {busy ? 'Importing & categorising…' : 'Import expenses'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="rounded-2xl bg-white p-xl">
            <h2 className="text-lg font-bold text-neutral-900 mb-md">Import complete</h2>
            <div className="grid grid-cols-3 gap-md mb-md">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-md text-center">
                <p className="text-2xl font-bold text-emerald-700">{result.inserted}</p>
                <p className="text-xs text-emerald-600">Imported</p>
              </div>
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-md text-center">
                <p className="text-2xl font-bold text-neutral-500">{result.duplicates}</p>
                <p className="text-xs text-neutral-400">Duplicates skipped</p>
              </div>
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-md text-center">
                <p className="text-2xl font-bold text-neutral-700">{result.total}</p>
                <p className="text-xs text-neutral-400">Total rows</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-xl bg-red-50 border border-red-100 p-md">
                <p className="text-xs font-semibold text-red-700 mb-xs">{result.errors.length} errors</p>
                <ul className="space-y-xs">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <li key={i} className="text-xs text-red-600">• {e}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-neutral-500 mt-md">
              Items that couldn't be confidently categorised are in <strong>Other / Not Matched</strong> — review them at{' '}
              <a href="/admin/expense-review" className="text-neutral-900 underline">Expense Review</a>.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { paymentFit, FIT_CLASS } from '@/lib/payments/fit'

const gbp = (n: number) =>
  `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB') : '—'

type Category = 'matched' | 'possible_dupe' | 'unmatched' | 'already_imported'

interface PreviewRow {
  transaction_date: string
  amount: number
  description: string
  extracted_ref: string | null
  dedup_hash: string
  category: Category
  tenant_name: string | null
  room_name: string | null
  property_name: string | null
  charge_month: string | null
  charge_amount_due: number | null
  charge_amount_received?: number
  charge_status: string | null
  rent_charge_id: string | null
}

interface PreviewResult {
  transactions: PreviewRow[]
  summary: { matched: number; possible_dupes: number; unmatched: number; already_imported: number; credit_total: number }
  period_from: string | null
  period_to: string | null
  bank_name: string | null
  filename: string
  warnings: string[]
}

interface ImportBatch {
  id: string
  filename: string
  bank_name: string | null
  period_from: string | null
  period_to: string | null
  transaction_count: number
  credit_total: number
  new_matched: number
  new_unmatched: number
  duplicates_skipped: number
  possible_dupes: number
  imported_at: string
}

const CATEGORY_STYLES: Record<Category, { bg: string; text: string; label: string; desc: string }> = {
  matched:          { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Matched',          desc: 'Will mark rent charge as paid' },
  possible_dupe:    { bg: 'bg-amber-50 border-amber-200',     text: 'text-amber-700',   label: 'Possible duplicate', desc: 'Charge already paid — held for review' },
  unmatched:        { bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     label: 'Unmatched',         desc: 'No tenant reference found' },
  already_imported: { bg: 'bg-neutral-50 border-neutral-200', text: 'text-neutral-500', label: 'Already imported',  desc: 'Will be skipped (safe)' },
}

export default function BankImportPage() {
  const [file, setFile]           = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview]     = useState<PreviewResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState<{ batch_id: string; message: string; results: any } | null>(null)
  const [recentBatches, setRecentBatches] = useState<ImportBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Category | 'all'>('all')
  const fileRef = useRef<HTMLInputElement>(null)

  // Load recent batches on mount
  useEffect(() => {
    fetch('/api/admin/bank-import/batches')
      .then(r => r.json())
      .then(d => { setRecentBatches(d.batches || []); setBatchesLoading(false) })
      .catch(() => setBatchesLoading(false))
  }, [])

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setPreview(null)
    setConfirmed(null)
    setPreviewError(null)
    setPreviewing(true)

    try {
      const form = new FormData()
      form.append('file', f)
      const res  = await fetch('/api/admin/bank-import/preview', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')
      setPreview(data)
      setActiveTab('all')
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Error parsing file')
    } finally {
      setPreviewing(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleConfirm = async () => {
    if (!preview) return
    setConfirming(true)
    try {
      const res  = await fetch('/api/admin/bank-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: preview.transactions,
          filename:    preview.filename,
          bank_name:   preview.bank_name,
          period_from: preview.period_from,
          period_to:   preview.period_to,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setConfirmed(data)
      setPreview(null)
      setFile(null)
      // Refresh batches
      fetch('/api/admin/bank-import/batches').then(r => r.json()).then(d => setRecentBatches(d.batches || []))
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setConfirming(false)
    }
  }

  const filteredRows = preview?.transactions.filter(t =>
    activeTab === 'all' ? true : t.category === activeTab
  ) || []

  const tabs: { key: Category | 'all'; label: string; count?: number }[] = [
    { key: 'all',            label: 'All',              count: preview?.transactions.length },
    { key: 'matched',        label: 'Matched',          count: preview?.summary.matched },
    { key: 'possible_dupe',  label: 'Possible dupes',   count: preview?.summary.possible_dupes },
    { key: 'unmatched',      label: 'Unmatched',        count: preview?.summary.unmatched },
    { key: 'already_imported', label: 'Already imported', count: preview?.summary.already_imported },
  ]

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/accounts" />} title="Bank Import" />

      <div className="max-w-6xl mx-auto px-lg py-xl space-y-xl">

        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">Bank Import</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Import a bank statement CSV to match transactions.</p>
        </div>

        {/* Gap detection banner */}
        {!batchesLoading && (() => {
          const lastBatch = recentBatches
            .filter(b => b.period_to)
            .sort((a, b) => (b.period_to! > a.period_to! ? 1 : -1))[0]
          if (!lastBatch?.period_to) return null
          const lastDate = new Date(lastBatch.period_to + 'T00:00:00')
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const gapDays = Math.floor((today.getTime() - lastDate.getTime()) / 86400000)
          if (gapDays < 3) return null // not worth showing if only a day or two
          const severity = gapDays >= 30 ? 'red' : gapDays >= 10 ? 'amber' : 'blue'
          const colours = {
            red:   'bg-red-50 border-red-200 text-red-800',
            amber: 'bg-amber-50 border-amber-200 text-amber-800',
            blue:  'bg-blue-50 border-blue-200 text-blue-700',
          }
          return (
            <div className={`rounded-xl border px-lg py-md text-sm flex items-center justify-between gap-md flex-wrap ${colours[severity]}`}>
              <div>
                <span className="font-semibold">
                  {severity === 'red' ? '🔴' : severity === 'amber' ? '⚠️' : 'ℹ️'}{' '}
                  Last import covered to {fmtDate(lastBatch.period_to)} — {gapDays} day{gapDays !== 1 ? 's' : ''} uncovered
                </span>
                <span className="ml-sm opacity-70 hidden sm:inline">
                  ({lastBatch.filename})
                </span>
              </div>
              <span className="text-xs opacity-60 whitespace-nowrap">Upload a new CSV to close the gap</span>
            </div>
          )
        })()}

        {/* Upload zone */}
        {!preview && !confirmed && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-xl space-y-lg">
            <div>
              
              <p className="text-sm text-neutral-500 mt-xs">Supports Barclays, HSBC, Lloyds, Halifax, Monzo, Starling and generic CSV. Credits only — debits are ignored.</p>
            </div>

            <div
              className={`border-2 border-dashed rounded-xl p-2xl text-center cursor-pointer transition-colors ${previewing ? 'border-indigo-300 bg-indigo-50' : 'border-neutral-200 hover:border-indigo-300 hover:bg-indigo-50/40'}`}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                // phones label bank downloads differently (iPhone often as plain text or Excel) — accept them all
                accept=".csv,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel,text/plain"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {previewing ? (
                <div className="space-y-sm">
                  <div className="w-8 h-8 mx-auto rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
                  <p className="text-sm font-semibold text-indigo-700">Analysing {file?.name}…</p>
                </div>
              ) : (
                <div className="space-y-sm">
                  <div className="text-3xl">🏦</div>
                  <p className="text-sm font-semibold text-neutral-700"><span className="hidden sm:inline">Drop your bank CSV here or click to browse</span><span className="sm:hidden">Tap to choose your bank CSV</span></p>
                  <p className="text-xs text-neutral-400 sm:hidden">On your phone: download the statement as CSV in your banking app, save it to Files, then choose it here.</p>
                  <p className="text-xs text-neutral-400">Nothing is saved until you review and confirm</p>
                </div>
              )}
            </div>

            {previewError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-lg py-md text-sm text-red-700">{previewError}</div>
            )}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="space-y-lg">

            {/* Header summary */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-xl">
              <div className="flex items-start justify-between gap-lg flex-wrap">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">File</p>
                  <p className="text-sm font-bold text-neutral-900 mt-xs">{preview.filename}</p>
                  {preview.bank_name && <p className="text-xs text-neutral-500">{preview.bank_name}</p>}
                  {preview.period_from && (
                    <p className="text-xs text-neutral-500 mt-xs">
                      Period: {fmtDate(preview.period_from)} – {fmtDate(preview.period_to)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Total credits</p>
                  <p className="text-xl font-bold text-neutral-900">{gbp(preview.summary.credit_total)}</p>
                </div>
              </div>

              {/* Summary pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mt-lg">
                {[
                  { label: 'Matched', value: preview.summary.matched, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { label: 'Possible dupes', value: preview.summary.possible_dupes, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                  { label: 'Unmatched', value: preview.summary.unmatched, color: 'bg-red-50 text-red-700 border-red-200' },
                  { label: 'Already imported', value: preview.summary.already_imported, color: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl border px-md py-sm text-center ${s.color}`}>
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-xs font-semibold mt-xs">{s.label}</p>
                  </div>
                ))}
              </div>

              {preview.warnings.length > 0 && (
                <div className="mt-lg rounded-xl bg-amber-50 border border-amber-200 px-lg py-md space-y-xs">
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-sm overflow-x-auto pb-xs">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`shrink-0 px-md py-sm rounded-lg text-xs font-semibold border transition-colors ${activeTab === t.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-indigo-300'}`}
                >
                  {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
                </button>
              ))}
            </div>

            {/* Transaction rows */}
            <div className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
              {filteredRows.length === 0 ? (
                <div className="px-xl py-2xl text-center text-sm text-neutral-400">No transactions in this category</div>
              ) : filteredRows.map((row, i) => {
                const style = CATEGORY_STYLES[row.category]
                return (
                  <div key={i} className={`px-xl py-md flex items-start gap-lg border-l-4 ${style.bg} border-l-current`} style={{ borderLeftColor: row.category === 'matched' ? '#10b981' : row.category === 'possible_dupe' ? '#f59e0b' : row.category === 'unmatched' ? '#ef4444' : '#d1d5db' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-sm flex-wrap">
                        <span className={`text-xs font-bold px-sm py-xs rounded-md border ${style.bg} ${style.text}`}>{style.label}</span>
                        <span className="text-xs text-neutral-400">{fmtDate(row.transaction_date)}</span>
                        {row.extracted_ref && <span className="text-xs font-mono bg-neutral-100 px-sm py-xs rounded">{row.extracted_ref}</span>}
                      </div>
                      <p className="text-sm text-neutral-700 mt-xs truncate">{row.description}</p>
                      {(row.tenant_name || row.room_name) && (
                        <p className="text-xs text-neutral-500 mt-xs">
                          {[row.tenant_name, row.room_name, row.property_name].filter(Boolean).join(' · ')}
                          {row.charge_month && ` · ${new Date(row.charge_month.slice(0,7) + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`}
                          {row.charge_amount_due != null && ` · Due ${gbp(row.charge_amount_due)}`}
                        </p>
                      )}
                      {row.category === 'matched' && row.charge_amount_due != null && (() => {
                        const fit = paymentFit(Number(row.amount), Number(row.charge_amount_due) - Number(row.charge_amount_received || 0))
                        return <p className={`text-xs font-semibold mt-xs ${FIT_CLASS[fit.tone]}`}>{fit.label}</p>
                      })()}
                      {row.category === 'matched' && row.charge_status === 'to be raised' && (
                        <p className="text-xs text-neutral-500 mt-xs">This month’s rent will be raised when you confirm, then this payment put against it.</p>
                      )}
                      {row.category === 'possible_dupe' && (
                        <p className="text-xs text-amber-600 font-semibold mt-xs">⚠ This charge is already marked as paid — held for manual review</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold text-neutral-900">{gbp(row.amount)}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Actions */}
            {previewError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-lg py-md text-sm text-red-700">{previewError}</div>
            )}

            <div className="flex gap-md justify-end">
              <button
                onClick={() => { setPreview(null); setFile(null); setPreviewError(null) }}
                className="px-lg py-sm rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                Cancel
              </button>
              {preview.summary.matched > 0 ? (
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="px-lg py-sm rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-sm"
                >
                  {confirming && <span className="w-3 h-3 rounded-full border border-white/40 border-t-white animate-spin" />}
                  Confirm import · {preview.summary.matched} payment{preview.summary.matched !== 1 ? 's' : ''}
                </button>
              ) : (
                <div className="px-lg py-sm rounded-xl bg-neutral-100 text-sm text-neutral-500">
                  No matched payments to import
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success state */}
        {confirmed && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-xl space-y-lg">
            <div className="flex items-center gap-md">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl">✓</div>
              <div>
                <p className="font-bold text-neutral-900">Import complete</p>
                <p className="text-sm text-neutral-600">{confirmed.message}</p>
              </div>
            </div>
            {[...(confirmed.results?.spread ?? []), ...(confirmed.results?.over ?? [])].length > 0 && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-lg py-md space-y-xs">
                <p className="text-xs font-bold text-blue-800">Payments that weren’t a single month’s rent</p>
                {[...(confirmed.results?.spread ?? []), ...(confirmed.results?.over ?? [])].map((e: string, i: number) => (
                  <p key={i} className="text-xs text-blue-700">{e}</p>
                ))}
              </div>
            )}
            {confirmed.results?.errors?.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-lg py-md space-y-xs">
                <p className="text-xs font-bold text-amber-700">Warnings</p>
                {confirmed.results.errors.map((e: string, i: number) => (
                  <p key={i} className="text-xs text-amber-600">{e}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => { setConfirmed(null); setPreviewError(null) }}
              className="px-lg py-sm rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              Import another file
            </button>
          </div>
        )}

        {/* Recent imports */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="px-xl py-lg border-b border-neutral-100">
            <h2 className="text-sm font-bold text-neutral-900">Recent imports</h2>
          </div>
          {batchesLoading ? (
            <div className="px-xl py-lg text-sm text-neutral-400">Loading…</div>
          ) : recentBatches.length === 0 ? (
            <div className="px-xl py-lg text-sm text-neutral-400">No imports yet</div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {recentBatches.map(b => (
                <div key={b.id} className="px-xl py-md grid grid-cols-[1fr_auto] gap-lg items-center">
                  <div>
                    <div className="flex items-center gap-sm flex-wrap">
                      <p className="text-sm font-semibold text-neutral-900">{b.filename}</p>
                      {b.bank_name && <span className="text-xs bg-neutral-100 px-sm py-xs rounded text-neutral-500">{b.bank_name}</span>}
                    </div>
                    <p className="text-xs text-neutral-400 mt-xs">
                      {new Date(b.imported_at).toLocaleString('en-GB')}
                      {b.period_from && ` · ${fmtDate(b.period_from)} – ${fmtDate(b.period_to)}`}
                    </p>
                    <div className="flex gap-sm mt-xs flex-wrap">
                      <span className="text-xs text-emerald-600">{b.new_matched} matched</span>
                      {b.possible_dupes > 0 && <span className="text-xs text-amber-600">{b.possible_dupes} dupes</span>}
                      {b.new_unmatched > 0 && <span className="text-xs text-neutral-400">{b.new_unmatched} unmatched</span>}
                      {b.duplicates_skipped > 0 && <span className="text-xs text-neutral-300">{b.duplicates_skipped} skipped</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-neutral-900">{b.credit_total != null ? gbp(b.credit_total) : '—'}</p>
                    <p className="text-xs text-neutral-400">{b.transaction_count} transactions</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

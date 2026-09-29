'use client'
// Export any list exactly as it's shown: CSV (for Excel, the accountant or 10ninety) or PDF on the letterhead.
// Every list screen in CROS should carry this — pass the columns and the rows currently on screen.
//   <ExportButtons title="Expenses" subtitle="1 Apr 2026 – 5 Apr 2027 · all properties" filename="expenses-2026-27"
//                  columns={[{ key: 'date', label: 'Date' }, { key: 'amount', label: 'Amount', money: true }]} rows={rows} />
import { useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export interface ExportColumn { key: string; label: string; money?: boolean; align?: 'left' | 'right' }

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) && isNaN(Number(s)) ? "'" : '') + s.replace(/"/g, '""')}"` : s
}

export function toCsv(columns: ExportColumn[], rows: Record<string, unknown>[], totals?: Record<string, unknown>) {
  const line = (r: Record<string, unknown>) => columns.map(c => {
    const v = r[c.key]
    return csvCell(c.money && v != null && v !== '' && !isNaN(Number(v)) ? Number(v).toFixed(2) : v)   // plain numbers for spreadsheets
  }).join(',')
  return [columns.map(c => csvCell(c.label)).join(','), ...rows.map(line), ...(totals ? [line(totals)] : [])].join('\r\n')
}

export default function ExportButtons({ title, subtitle, filename, columns, rows, totals, className = '' }: {
  title: string; subtitle?: string; filename?: string; columns: ExportColumn[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown>; className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = (filename || title).replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'export'

  const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  const csv = () => save(new Blob(['﻿' + toCsv(columns, rows, totals)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`)   // BOM so Excel reads £ correctly
  const pdf = async () => {
    setBusy(true); setError('')
    try {
      const r = await adminFetch('/api/admin/export/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, subtitle, columns, rows, totals, filename: base }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not make the PDF')
      save(await r.blob(), `${base}.pdf`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not make the PDF') }
    finally { setBusy(false) }
  }
  const btn = 'rounded-lg border border-neutral-300 bg-white px-md py-xs text-xs font-bold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50'
  return (
    <div className={`flex flex-wrap items-center gap-sm ${className}`}>
      <span className="text-xs text-neutral-500">Export</span>
      <button type="button" onClick={csv} disabled={!rows.length} className={btn}>CSV</button>
      <button type="button" onClick={pdf} disabled={busy || !rows.length} className={btn}>{busy ? 'Making PDF…' : 'PDF'}</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

'use client'

// The log of what tenants have done for their houses (21 Nov 2026). Read-only. Newest first.
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

type Row = { id: string; when: string; who: string; house: string; what: string; amount: number | null; category: string | null }

export default function ContributionsLog() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    adminFetch('/api/admin/contributions')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load'); setRows(d.rows) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [])
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="What everyone has done" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {!rows && !error && <p className="text-sm text-neutral-500">Loading…</p>}
        {rows && rows.length === 0 && <p className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white p-xl text-center text-sm text-neutral-500">Nothing logged yet.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">House</th><th className="px-4 py-3">What</th><th className="px-4 py-3 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-neutral-100 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{when(r.when)}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-900">{r.who}</td>
                    <td className="px-4 py-3 text-neutral-700">{r.house}</td>
                    <td className="px-4 py-3 text-neutral-800">{r.what}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.amount == null ? '—' : `£${r.amount.toFixed(2)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

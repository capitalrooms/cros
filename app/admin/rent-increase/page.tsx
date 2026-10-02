'use client'

// Rent Reviews — every current tenancy, longest since its last rent change first. Opens the Section 13 notice builder.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

interface Row {
  tenancyId: string; tenant: string; personId: string | null; room: string; property: string
  rent: number; lastChanged: string; changedSource?: 'recorded' | 'section13' | 'start'; months: number; onNotice: boolean
  pending: { effective: string; proposed: number } | null
}

const date = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function RentReviewsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [dueOnly, setDueOnly] = useState(true)

  useEffect(() => {
    adminFetch('/api/admin/rent-reviews')
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load tenancies'); setRows(d.rows) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load tenancies'))
  }, [])

  const due = (r: Row) => r.months >= 12 && !r.onNotice && !r.pending
  const shown = (rows ?? []).filter(r => !dueOnly || due(r))

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Rent Reviews" />
      <PageHero
        title="Rent Reviews"
        subtitle="A Section 13 increase can take effect once a year — tenancies unchanged for 12 months or more are due"
        stats={rows ? [
          { label: 'Due a review', value: rows.filter(due).length, tone: 'warn' },
          { label: 'Increase pending', value: rows.filter(r => r.pending).length, tone: 'info' },
          { label: 'Tenancies', value: rows.length },
        ] : undefined}
        actions={<HeroButton href="/admin/rent-history">Correct last-changed dates</HeroButton>}
      />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <p className="text-xs text-neutral-500">“Last changed” is a date recorded here, a Section 13 increase, or otherwise the tenancy start — check them against your emails.</p>
          <div className="inline-flex rounded-lg bg-white p-0.5 text-sm font-semibold">
            <button onClick={() => setDueOnly(true)} className={`rounded-md px-md py-xs ${dueOnly ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Due {rows ? `(${rows.filter(due).length})` : ''}</button>
            <button onClick={() => setDueOnly(false)} className={`rounded-md px-md py-xs ${!dueOnly ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>All {rows ? `(${rows.length})` : ''}</button>
          </div>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {!rows && !error && <p className="text-sm text-neutral-400">Loading tenancies…</p>}
        {rows && shown.length === 0 && <p className="rounded-xl bg-white px-lg py-lg text-sm text-neutral-500">No tenancies are due a review.</p>}

        {shown.length > 0 && (
          <div className="overflow-x-auto rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-lg py-sm font-semibold">Tenant</th>
                  <th className="px-lg py-sm font-semibold">Room</th>
                  <th className="px-lg py-sm font-semibold text-right">Rent</th>
                  <th className="px-lg py-sm font-semibold">Last changed</th>
                  <th className="px-lg py-sm font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {shown.map(r => (
                  <tr key={r.tenancyId}>
                    <td className="px-lg py-sm font-semibold text-neutral-900">
                      {r.personId ? <Link href={`/admin/tenant/${r.personId}`} className="hover:underline">{r.tenant}</Link> : r.tenant}
                    </td>
                    <td className="px-lg py-sm text-neutral-600">{[r.room, r.property].filter(Boolean).join(', ')}</td>
                    <td className="px-lg py-sm text-right tabular-nums">{gbp(r.rent)}</td>
                    <td className="px-lg py-sm text-neutral-600 whitespace-nowrap">
                      {date(r.lastChanged)} <span className="text-neutral-400">· {r.months} mo</span>
                      <span className="block text-[11px] text-neutral-400">{r.changedSource === 'start' ? 'start of tenancy — no change recorded' : r.changedSource === 'section13' ? 'Section 13 increase' : 'recorded change'}</span>
                      {r.pending && <span className="ml-sm rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">{gbp(r.pending.proposed)} from {date(r.pending.effective)}</span>}
                      {r.onNotice && <span className="ml-sm rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">On notice</span>}
                    </td>
                    <td className="px-lg py-sm text-right">
<span className="inline-flex items-center gap-sm">
                        <Link href={`/admin/lettings/${r.tenancyId}?tab=notice&from=/admin/rent-increase`} className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap">File</Link>
                        <Link href={`/admin/rent-increase/${r.tenancyId}`} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-semibold text-white hover:bg-neutral-700 whitespace-nowrap">Review rent</Link>
                      </span>
                    </td>
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

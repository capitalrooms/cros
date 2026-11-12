'use client'
// Official local rents for a house's borough (12 Nov 2026) — ONS Price Index of Private Rents (lib/rents/ons). Average
// monthly rent for whole homes by bedrooms, and the change on a year ago. Shown on a house's Details and in the
// valuation form. Rooms aren't in the official figures, so this is the borough's market, not a room price.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface R { areaName: string; period: string; all: number | null; one: number | null; two: number | null; three: number | null; fourPlus: number | null; flat: number | null; changeAll: number | null; changeOne: number | null; changeTwo: number | null; changeThree: number | null; changeFour: number | null }
const gbp = (n: number | null) => n == null ? '—' : `£${n.toLocaleString('en-GB')}`
const pct = (n: number | null) => n == null ? '' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`

export default function LocalRents({ propertyId, postcode }: { propertyId?: string; postcode?: string | null }) {
  const [d, setD] = useState<{ rents: R | null; source: string } | null>(null)
  useEffect(() => {
    const q = postcode ? `postcode=${encodeURIComponent(postcode)}` : propertyId ? `propertyId=${propertyId}` : ''
    if (!q) { setD(null); return }
    adminFetch(`/api/admin/local-rents?${q}`).then(r => r.json()).then(setD).catch(() => setD(null))
  }, [propertyId, postcode])
  if (!d) return null
  const r = d.rents
  if (!r) return <p className="rounded-xl border border-neutral-200 bg-white px-lg py-md text-xs text-neutral-500">Official local rents appear here once the house has a postcode.</p>
  const month = new Date(`${r.period}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const rows: [string, number | null, number | null][] = [['1 bed', r.one, r.changeOne], ['2 bed', r.two, r.changeTwo], ['3 bed', r.three, r.changeThree], ['4+ bed', r.fourPlus, r.changeFour]]
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-sm font-bold text-neutral-900">Local rents — {r.areaName}</h3>
        <span className="text-xs text-neutral-500">{month} · official figures</span>
      </div>
      <p className="mt-xs text-sm text-neutral-700">Average rent <b className="tabular-nums">{gbp(r.all)}</b> a month <span className={`tabular-nums ${r.changeAll != null && r.changeAll < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{pct(r.changeAll)} on a year ago</span>{r.flat ? <> · flats {gbp(r.flat)}</> : null}</p>
      <dl className="mt-sm grid grid-cols-2 gap-sm sm:grid-cols-4">
        {rows.map(([k, v, c]) => (
          <div key={k} className="rounded-lg bg-neutral-50 px-sm py-xs">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{k}</dt>
            <dd className="text-base font-bold tabular-nums text-neutral-900">{gbp(v)}</dd>
            {c != null && <dd className={`text-[11px] tabular-nums ${c < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{pct(c)} a year</dd>}
          </div>
        ))}
      </dl>
      <p className="mt-sm text-[11px] text-neutral-500">Whole homes, not rooms. Source: {d.source}, ons.gov.uk — Crown copyright, Open Government Licence.</p>
    </section>
  )
}

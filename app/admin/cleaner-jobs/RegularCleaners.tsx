'use client'

// Each house's regular cleaner (24 Oct 2026, Harry: "we should be able to assign certain cleaners"). New move-out
// cleans at the house go to them unless someone else is picked, and Quick Notify's "Cleaners" reaches them.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

type House = { id: string; name: string; regularCleanerId: string | null; openCleans: number }
type Cleaner = { id: string; name: string; test: boolean }

export default function RegularCleaners({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<{ ready: boolean; houses: House[]; cleaners: Cleaner[] } | null>(null)
  const [error, setError] = useState('')
  const [handOver, setHandOver] = useState(true)
  const [saving, setSaving] = useState('')
  const [note, setNote] = useState('')

  const load = () => adminFetch('/api/admin/cleaner/regular').then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'The houses couldn’t be loaded'); return }
    setData(d)
  }).catch(() => setError('The houses couldn’t be loaded — check the connection.'))
  useEffect(() => { load() }, [])

  async function choose(h: House, cleanerId: string) {
    setSaving(h.id); setNote(''); setError('')
    const r = await adminFetch('/api/admin/cleaner/regular', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: h.id, cleanerId: cleanerId || null, handOver }) })
    const d = await r.json().catch(() => ({}))
    setSaving('')
    if (!r.ok) { setError(d.error ?? 'Not saved'); return }
    const who = data?.cleaners.find(c => c.id === cleanerId)?.name
    setNote(who ? `${h.name}: ${who} is the regular cleaner${d.moved ? ` — ${d.moved} open clean${d.moved === 1 ? '' : 's'} handed over` : ''}.` : `${h.name} has no regular cleaner now.`)
    await load(); if (d.moved) onChanged()
  }

  if (error && !data) return <p className="mb-lg text-sm font-semibold text-red-700">{error}</p>
  if (!data) return null
  const withOne = data.houses.filter(h => h.regularCleanerId).length
  const real = data.cleaners.filter(c => !c.test)

  return (
    <details className="mb-xl rounded-2xl border border-neutral-200 bg-white" open={withOne === 0}>
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-sm px-lg py-md">
        <span className="text-base font-bold text-neutral-900">Regular cleaners</span>
        <span className="text-xs text-neutral-500">{withOne} of {data.houses.length} houses have one</span>
      </summary>
      <div className="space-y-md border-t border-neutral-100 px-lg py-md">
        <p className="text-sm text-neutral-600">Choose who usually cleans each house. New move-out cleans there go to them unless you pick someone else, and Quick Notify’s “Cleaners” reaches them.</p>
        {!data.ready && <p className="rounded-lg bg-amber-50 px-md py-sm text-sm font-semibold text-amber-900">Run migration 243 first — it adds each house’s regular cleaner.</p>}
        {real.length === 0 && <p className="rounded-lg bg-amber-50 px-md py-sm text-sm text-amber-900">The only cleaners in CROS are test accounts. Add your cleaners on <Link href="/admin/people?tab=cleaners" className="font-semibold underline">People › Cleaners</Link> first.</p>}
        <label className="flex items-center gap-sm text-sm text-neutral-700">
          <input type="checkbox" checked={handOver} onChange={e => setHandOver(e.target.checked)} className="h-4 w-4" />
          Also give them the house’s open cleans nobody has accepted yet
        </label>
        {note && <p className="text-sm font-semibold text-green-800">{note}</p>}
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {data.houses.map(h => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-sm px-md py-sm">
              <span className="min-w-0 flex-[1_1_200px]">
                <span className="block text-sm font-semibold text-neutral-900">{h.name}</span>
                {h.openCleans > 0 && <span className="text-xs text-neutral-500">{h.openCleans} open clean{h.openCleans === 1 ? '' : 's'}</span>}
              </span>
              <select value={h.regularCleanerId ?? ''} disabled={!data.ready || saving === h.id} onChange={e => choose(h, e.target.value)}
                aria-label={`Regular cleaner for ${h.name}`}
                className="min-w-[200px] rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900 disabled:opacity-50">
                <option value="">No regular cleaner</option>
                {data.cleaners.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

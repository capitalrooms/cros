'use client'

// House improvements across every house (8 Nov 2026) — a read-only overview for planning refreshes. The notes, Reimagine
// looks and landlord proposals are made and sent at each house (Maintenance → Improvements); this just shows where each stands.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { plannerTabs } from '@/lib/plannerTabs'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

type Item = { id: string; propertyId: string; house: string; space: string | null; note: string; status: string; looks: number; sent: number
  answer: { style: string | null; choice: number | 'none' | null; budget?: string; at: string } | null; updatedAt: string }

const STAGES: [string, string, string][] = [
  ['noted', 'Noted', 'bg-neutral-100 text-neutral-700'],
  ['sent_to_landlord', 'With the landlord', 'bg-blue-50 text-blue-800'],
  ['approved', 'Approved', 'bg-emerald-50 text-emerald-800'],
  ['quoting', 'Getting quotes', 'bg-amber-50 text-amber-800'],
  ['done', 'Done', 'bg-green-50 text-green-800'],
]
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ImprovementsOverview() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [stage, setStage] = useState<string>('open')
  useEffect(() => { adminFetch('/api/admin/improvements?all=1').then(r => r.json()).then(j => setItems(j.items ?? [])).catch(() => setItems([])) }, [])

  const shown = useMemo(() => (items ?? []).filter(i => i.status !== 'dismissed' && (stage === 'open' ? i.status !== 'done' : i.status === stage)), [items, stage])
  const houses = useMemo(() => {
    const m = new Map<string, { id: string; house: string; items: Item[] }>()
    for (const i of shown) { const h = m.get(i.propertyId) ?? { id: i.propertyId, house: i.house, items: [] }; h.items.push(i); m.set(i.propertyId, h) }
    return [...m.values()].sort((a, b) => a.house.localeCompare(b.house))
  }, [shown])
  const count = (k: string) => (items ?? []).filter(i => i.status === k).length

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/planner" />} title="House improvements" />
      <PageHero title="Planner" tabs={plannerTabs('improvements')} subtitle="Refresh ideas across every house — where each one stands. Make notes, Reimagine looks and send proposals at the house." />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div className="flex flex-wrap gap-xs">
          {[['open', `Open (${(items ?? []).filter(i => !['done', 'dismissed'].includes(i.status)).length})`] as const, ...STAGES.map(([k, l]) => [k, `${l} (${count(k)})`] as const)].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStage(k)} className={`rounded-full px-md py-xs text-sm font-semibold ${stage === k ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50'}`}>{l}</button>
          ))}
        </div>
        {items === null ? <p className="text-sm text-neutral-500">Loading…</p> : !houses.length ? (
          <p className="rounded-xl bg-white p-lg text-sm text-neutral-600 ring-1 ring-neutral-200">Nothing here. Add improvement notes at a house (Maintenance → Improvements), or use ✨ Reimagine on a room photo.</p>
        ) : houses.map(h => (
          <section key={h.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
            <header className="flex items-center justify-between gap-sm border-b border-neutral-100 px-md py-sm">
              <h2 className="text-base font-bold text-neutral-900">{h.house}</h2>
              <Link href={`/admin/properties/${h.id}?tab=improvements`} className="text-sm font-semibold text-blue-700 hover:underline">Open at the house →</Link>
            </header>
            <ul className="divide-y divide-neutral-100">
              {h.items.map(i => { const st = STAGES.find(s => s[0] === i.status); return (
                <li key={i.id} className="flex flex-wrap items-start gap-sm px-md py-sm text-sm">
                  <span className="min-w-[220px] flex-1"><span className="font-semibold text-neutral-900">{i.space ?? 'Whole house'}</span> — {i.note}
                    <span className="block text-xs text-neutral-500">{[i.looks ? `${i.looks} looks` : 'no looks yet', i.sent ? `sent ${i.sent}×` : null, `updated ${day(i.updatedAt)}`].filter(Boolean).join(' · ')}</span>
                    {i.answer && <span className="mt-0.5 block text-xs text-emerald-800">Landlord: {i.answer.style ? `likes “${i.answer.style}”` : i.answer.choice === 'none' ? 'not this one' : 'no choice'}{i.answer.budget ? ` · ceiling ${i.answer.budget}` : ''}</span>}
                  </span>
                  <span className={`rounded-full px-sm py-0.5 text-xs font-semibold ${st?.[2] ?? 'bg-neutral-100'}`}>{st?.[1] ?? i.status}</span>
                </li>
              ) })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

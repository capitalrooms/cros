'use client'

// Tenant feedback — what each house's tenants scored, what they said, and an AI summary of what would improve the
// house most (22 Oct 2026). Forms are sent from Quick Notify → Feedback and filled in at /tenant/feedback.
import { use, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { FEEDBACK_AREAS } from '@/lib/feedback/areas'
import type { FeedbackSummary } from '@/lib/feedback/summarise'

interface House { id: string; name: string; forms: number; lastAt: string; areas: { key: string; label: string; average: number; count: number }[] }
interface Form { id: string; who: string; at: string; ratings: Record<string, number>; comments: Record<string, string>; anything_else: string | null }

const ukDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
const tone = (n: number) => n >= 4 ? 'bg-green-100 text-green-800' : n >= 3 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'

export default function FeedbackPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const [houseId, setHouseId] = useState<string | null>(one(sp.property) ?? null)
  const [houses, setHouses] = useState<House[] | null>(null)
  const [forms, setForms] = useState<Form[]>([])
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ summary: FeedbackSummary; basedOn: number } | null>(null)
  const [summarising, setSummarising] = useState(false)

  useEffect(() => {
    adminFetch('/api/admin/feedback').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'Couldn’t load the feedback.'); setHouses([]); return }
      setHouses(d.houses)
    })
  }, [])
  useEffect(() => {
    setSummary(null); setForms([])
    if (!houseId) return
    window.history.replaceState(null, '', `/admin/feedback?property=${houseId}`)
    adminFetch(`/api/admin/feedback?property=${houseId}`).then(r => r.json()).then(d => setForms(d.forms ?? []))
  }, [houseId])

  const summarise = async () => {
    if (!houseId) return
    setSummarising(true); setError(null)
    try {
      const r = await adminFetch('/api/admin/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id: houseId }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error ?? 'The summary didn’t work.')
      else setSummary(d)
    } finally { setSummarising(false) }
  }

  const house = houses?.find(h => h.id === houseId) ?? null
  const label = (k: string) => FEEDBACK_AREAS.find(a => a.key === k)?.label ?? k

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero eyebrow="Comms" title="Tenant feedback" subtitle="What tenants scored each part of their house, and what they’d improve. Send the form from Quick Notify → Feedback." />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-md text-sm font-semibold text-red-800">{error}</p>}
        {houses === null ? <p className="text-sm text-neutral-400">Loading…</p>
          : houses.length === 0 && !error ? <p className="rounded-xl border border-neutral-200 bg-white p-lg text-sm text-neutral-500">No feedback yet. Open Quick Notify on a house, choose Feedback and send “How are we doing?”.</p>
          : (
            <div className="grid gap-lg md:grid-cols-[260px_1fr]">
              <ul className="space-y-xs">
                {houses.map(h => (
                  <li key={h.id}>
                    <button onClick={() => setHouseId(h.id)} className={`w-full rounded-xl border px-md py-sm text-left ${houseId === h.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400'}`}>
                      <span className="block text-sm font-bold">{h.name}</span>
                      <span className={`block text-xs ${houseId === h.id ? 'text-neutral-300' : 'text-neutral-500'}`}>{h.forms} form{h.forms === 1 ? '' : 's'} · last {ukDate(h.lastAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {!house ? <p className="text-sm text-neutral-500">Pick a house.</p> : (
                <div className="space-y-lg">
                  <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
                    <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
                      <h2 className="text-lg font-bold text-neutral-900">{house.name}</h2>
                      <button onClick={summarise} disabled={summarising} className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-50">{summarising ? 'Reading the answers…' : summary ? 'Summarise again' : 'What would improve it most? (AI)'}</button>
                    </div>
                    <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
                      {house.areas.map(a => (
                        <div key={a.key} className="flex items-center justify-between rounded-lg border border-neutral-100 px-md py-sm">
                          <span className="text-sm text-neutral-700">{a.label}</span>
                          <span className={`rounded-full px-sm py-[2px] text-xs font-bold tabular-nums ${tone(a.average)}`}>{a.average.toFixed(1)}<span className="font-normal opacity-70"> · {a.count}</span></span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {summary && (
                    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-lg text-sm text-blue-950">
                      <p className="mb-sm text-xs font-bold uppercase tracking-wide text-blue-700">AI summary · from {summary.basedOn} form{summary.basedOn === 1 ? '' : 's'}</p>
                      <p className="mb-md font-semibold">{summary.summary.headline}</p>
                      <ol className="mb-md list-decimal space-y-sm pl-lg">
                        {summary.summary.improvements.map((x, i) => <li key={i}><strong>{x.action}</strong> <span className="text-blue-800">({x.area})</span> — {x.why}</li>)}
                      </ol>
                      {summary.summary.going_well.length > 0 && <p><strong>Going well:</strong> {summary.summary.going_well.join(' · ')}</p>}
                    </section>
                  )}

                  <section className="space-y-sm">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Every answer</h3>
                    {forms.map(f => (
                      <div key={f.id} className="rounded-xl border border-neutral-200 bg-white p-md text-sm">
                        <p className="mb-sm text-xs text-neutral-500"><strong className="text-neutral-900">{f.who}</strong> · {ukDate(f.at)}</p>
                        <ul className="space-y-xs">
                          {FEEDBACK_AREAS.filter(a => f.ratings?.[a.key] || f.comments?.[a.key]).map(a => (
                            <li key={a.key} className="flex gap-sm">
                              {f.ratings?.[a.key] ? <span className={`h-fit shrink-0 rounded-full px-sm text-xs font-bold ${tone(f.ratings[a.key])}`}>{f.ratings[a.key]}</span> : null}
                              <span><strong>{label(a.key)}</strong>{f.comments?.[a.key] ? ` — ${f.comments[a.key]}` : ''}</span>
                            </li>
                          ))}
                        </ul>
                        {f.anything_else && <p className="mt-sm text-neutral-700"><strong>Anything else:</strong> {f.anything_else}</p>}
                      </div>
                    ))}
                  </section>
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  )
}

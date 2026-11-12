'use client'
// "Ask the data" on the Market page (12 Nov 2026) — a question in plain English; the AI answers from the official
// figures for the areas named (or the one on screen) and searches recent news for possible reasons, kept apart.
import { useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import AdvertText from '@/components/listing/AdvertText'

const EXAMPLES = ['Why have house prices fallen in Tower Hamlets?', 'Which has the best yield: Southwark, Lewisham or Greenwich?', 'Where are 2-bed rents rising fastest in east London?']

export default function AskData({ areaCode, areaName }: { areaCode?: string; areaName?: string }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [a, setA] = useState<{ answer: string; sources: { url: string; title: string }[]; areas: { name: string }[] } | null>(null)
  const [err, setErr] = useState('')
  async function ask(text = q) {
    if (text.trim().length < 5) return
    setQ(text); setBusy(true); setErr(''); setA(null)
    const r = await adminFetch('/api/admin/market/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, areas: areaCode ? [areaCode] : [] }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || 'Couldn’t answer that'); return }
    setA(d)
  }
  return (
    <section className="rounded-2xl bg-white p-lg ring-1 ring-neutral-200">
      <h2 className="text-base font-bold text-neutral-900">Ask the data</h2>
      <p className="text-xs text-neutral-500">Ask in plain English about any area{areaName ? ` — it uses ${areaName} unless you name others` : ''}. Answers come from the official figures; possible reasons come from recent news and are marked as such.</p>
      <div className="mt-sm flex gap-xs">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask() }} placeholder="e.g. Why have prices fallen in Tower Hamlets?" className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-md py-sm text-base" />
        <button type="button" onClick={() => ask()} disabled={busy} className="rounded-xl bg-neutral-900 px-lg text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Thinking…' : 'Ask'}</button>
      </div>
      {!a && !busy && <div className="mt-sm flex flex-wrap gap-xs">{EXAMPLES.map(x => <button key={x} type="button" onClick={() => ask(x)} className="rounded-full border border-neutral-300 px-sm py-0.5 text-xs text-neutral-700 hover:bg-neutral-50">{x}</button>)}</div>}
      {busy && <p className="mt-md text-sm text-neutral-500">Reading the figures and checking the news — about 20 seconds…</p>}
      {err && <p className="mt-md text-sm text-red-700">{err}</p>}
      {a && (
        <div className="mt-md text-sm leading-relaxed text-neutral-800">
          <AdvertText text={a.answer} headingStyle={{ fontSize: 15, margin: '14px 0 6px' }} />
          {a.sources.length > 0 && <p className="mt-sm text-xs text-neutral-500">News: {a.sources.map((s, i) => <span key={s.url}>{i ? ' · ' : ''}<a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title}</a></span>)}</p>}
          <p className="mt-xs text-[11px] text-neutral-400">Figures: ONS rents, HM Land Registry prices{a.areas.length ? ` for ${a.areas.map(x => x.name).join(', ')}` : ''}.</p>
        </div>
      )}
    </section>
  )
}

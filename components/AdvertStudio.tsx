'use client'

// The room's Advert studio (6 Nov 2026 — lib/marketing/advert, /api/admin/advert). The questions a great advert answers
// (the gaps first), a box for what to change or add ("put the room details together", "it has 3 wardrobes"), an
// optional line of local history, then four versions written at once: a short summary, the website listing, the
// SpareRoom ad and an informal Facebook post. Answers are kept — the bedroom's on the room, the house's on the house —
// so the next room in the house already knows them.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { FACTS } from '@/lib/marketing/facts'

const TABS = [['website', 'Website listing'], ['spareroom', 'SpareRoom'], ['facebook', 'Facebook post'], ['summary', 'Short summary']] as const

export default function AdvertStudio({ roomId }: { roomId: string }) {
  const [facts, setFacts] = useState<Record<string, string>>({})
  const [missing, setMissing] = useState<string[]>([])
  const [adverts, setAdverts] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [history, setHistory] = useState(false)
  const [tab, setTab] = useState<typeof TABS[number][0]>('website')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    adminFetch(`/api/admin/advert?roomId=${roomId}`).then(r => r.json()).then(j => {
      if (j.error) { setErr(j.error); return }
      setFacts(j.facts ?? {}); setMissing(j.missing ?? []); setAdverts(j.adverts); setNotes(j.adverts?.instructions ?? '')
    }).catch(() => setErr('Couldn’t load the advert'))
  }, [roomId])

  async function generate() {
    setBusy(true); setErr('')
    const r = await adminFetch('/api/admin/advert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, facts, instructions: notes, history }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? 'Couldn’t write the adverts'); return }
    setAdverts(j.adverts); setMissing(FACTS.filter(f => !facts[f.key]?.trim()).map(f => f.key))
  }
  const text = (k: string) => !adverts ? '' : k === 'website' ? `${adverts.website.title}\n\n${adverts.website.text}` : k === 'spareroom' ? `${adverts.spareroom.title}\n\n${adverts.spareroom.text}` : k === 'facebook' ? adverts.facebook : adverts.summary
  const shown = FACTS.filter(f => showAll || missing.includes(f.key))
  const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'

  return (
    <div className="space-y-md">
      {err && <p className="rounded-lg bg-red-50 px-md py-sm text-sm text-red-800">{err}</p>}

      <section className="rounded-xl border border-neutral-200 bg-white p-md">
        <div className="flex flex-wrap items-baseline justify-between gap-sm">
          <h3 className="text-sm font-bold text-neutral-900">{missing.length ? `What the advert still needs · ${missing.length}` : 'Everything a great advert needs is here'}</h3>
          <button type="button" onClick={() => setShowAll(!showAll)} className="text-xs font-semibold text-blue-700 hover:underline">{showAll ? 'Only what’s missing' : 'Show all answers'}</button>
        </div>
        <p className="text-xs text-neutral-500">The things the best-responding room adverts always say. Bedroom answers stay with this room; house and area answers are shared with every room in the house.</p>
        <div className="mt-sm grid gap-sm md:grid-cols-2">
          {shown.map(f => (
            <label key={f.key} className="block"><span className="text-xs font-semibold text-neutral-700">{f.ask} <span className="font-normal text-neutral-400">· {f.scope === 'room' ? 'this room' : 'the house'}</span></span>
              {f.options ? (
                <span className="mt-1 flex flex-wrap gap-xs">{f.options.map(o => <button key={o} type="button" onClick={() => setFacts({ ...facts, [f.key]: facts[f.key] === o ? '' : o })} className={`rounded-full border px-sm py-0.5 text-xs ${facts[f.key] === o ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700'}`}>{o}</button>)}</span>
              ) : <input className={`${input} mt-1`} value={facts[f.key] ?? ''} placeholder={f.placeholder} onChange={e => setFacts({ ...facts, [f.key]: e.target.value })} />}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-md space-y-sm">
        <label className="block"><span className="text-sm font-bold text-neutral-900">Anything to change or add?</span>
          <textarea rows={3} className={`${input} mt-1`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Put all the room details together in one section · It has 3 wardrobes · Mention the roof terrace · Less salesy" /></label>
        <p className="text-xs text-neutral-500">Used for every version next time they’re written, and kept for this room.</p>
        <label className="flex items-center gap-xs text-sm"><input type="checkbox" checked={history} onChange={() => setHistory(!history)} /> Add a line of local history for the area (looked up and checked)</label>
        <button type="button" disabled={busy} onClick={generate} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50">{busy ? 'Writing all four…' : adverts ? 'Rewrite all four' : 'Write the adverts'}</button>
      </section>

      {adverts && (
        <section className="rounded-xl border border-neutral-200 bg-white p-md">
          <div className="flex flex-wrap gap-xs border-b border-neutral-100 pb-sm">
            {TABS.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-md py-xs text-sm font-semibold ${tab === k ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>{l}</button>)}
          </div>
          <pre className="mt-sm whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-800">{text(tab)}</pre>
          {adverts.historyLine && tab === 'website' && <p className="mt-xs text-xs text-neutral-500">Local history used: {adverts.historyLine}</p>}
          <div className="mt-sm flex flex-wrap items-center gap-sm">
            <button type="button" onClick={() => { navigator.clipboard.writeText(text(tab)); setCopied(tab); setTimeout(() => setCopied(''), 1500) }} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50">{copied === tab ? 'Copied' : 'Copy'}</button>
            <span className="text-xs text-neutral-500">The website version is the room’s listing text. Written {new Date(adverts.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.</span>
          </div>
        </section>
      )}
    </div>
  )
}

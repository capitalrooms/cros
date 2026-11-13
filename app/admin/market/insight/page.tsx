'use client'
// The quarterly market insight — three styles to choose from (12 Nov 2026). Each opens on a London scene for the season.
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

const STYLES = [['editorial', 'Editorial'], ['ink', 'Ink'], ['graphic', 'Graphic']] as const
const SEASONS = [['winter', 'Winter · Q1'], ['spring', 'Spring · Q2'], ['summer', 'Summer · Q3'], ['autumn', 'Autumn · Q4']] as const

export default function InsightPage() {
  const [style, setStyle] = useState<string>('editorial')
  const [season, setSeason] = useState<string>('autumn')
  const [d, setD] = useState<{ subject: string; html: string; styles: { key: string; note: string }[] } | null>(null)
  useEffect(() => { setD(null); adminFetch(`/api/admin/market/insight?style=${style}&season=${season}`).then(r => r.json()).then(setD) }, [style, season])
  const pill = (on: boolean) => `rounded-full px-md py-xs text-sm font-semibold ${on ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200'}`
  return (
    <div className="office min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/market" />} title="Market insight" />
      <PageHero eyebrow="Communications · Market updates" title="Quarterly market insight" subtitle="The same London figures in three styles, each opening on a London scene for the season. Pick the one you like for the landlord updates." />
      <div className="mx-auto max-w-4xl space-y-md px-lg py-xl">
        <div className="flex flex-wrap gap-xs">{STYLES.map(([k, l]) => <button key={k} type="button" className={pill(style === k)} onClick={() => setStyle(k)}>{l}</button>)}</div>
        <div className="flex flex-wrap gap-xs">{SEASONS.map(([k, l]) => <button key={k} type="button" className={pill(season === k)} onClick={() => setSeason(k)}>{l}</button>)}</div>
        {d && <p className="text-sm text-neutral-600">{d.styles.find(x => x.key === style)?.note} · Subject: <b>{d.subject}</b></p>}
        {d ? <iframe title="Insight preview" srcDoc={d.html} className="h-[1500px] w-full rounded-2xl bg-white ring-1 ring-neutral-200" /> : <p className="text-sm text-neutral-500">Loading…</p>}
      </div>
    </div>
  )
}

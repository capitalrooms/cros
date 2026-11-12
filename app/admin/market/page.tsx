'use client'
// Market — what homes rent and sell for in an area, at a glance (12 Nov 2026, Harry: "a valuation estimator … what would a
// 1 bed, 2–5 bed or a room or an en-suite typically go for in x area … sales and rents both … a smart graphic summary …
// metrics we could use in conversation … a clickable map … as well as a search"). Search any area, or tap a London
// borough. Rents: ONS. Sales: HM Land Registry. Rooms: our own. Data: /api/admin/market.
import { useEffect, useMemo, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import Link from 'next/link'
import AskData from './AskData'

interface Area { code: string; name: string; region: string | null; rent: number | null; change: number | null; period: string; changes?: Record<string, number | null> }
const gbp = (n: number | null | undefined) => n == null ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`
const gbpK = (n: number | null | undefined) => n == null ? '—' : n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(2)}m` : `£${Math.round(n / 1000)}k`
const pct = (n: number | null | undefined) => n == null ? '' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
const month = (iso: string) => new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// London on a grid — each borough a square, roughly where it sits
const LONDON: [string, number, number][] = [
  ['Enfield', 4, 0],
  ['Barnet', 3, 1], ['Haringey', 4, 1], ['Waltham Forest', 5, 1],
  ['Harrow', 1, 2], ['Brent', 2, 2], ['Camden', 3, 2], ['Islington', 4, 2], ['Hackney', 5, 2], ['Redbridge', 6, 2], ['Havering', 7, 2],
  ['Hillingdon', 0, 3], ['Ealing', 1, 3], ['Kensington and Chelsea', 2, 3], ['Westminster', 3, 3], ['City of London', 4, 3], ['Tower Hamlets', 5, 3], ['Newham', 6, 3], ['Barking and Dagenham', 7, 3],
  ['Hounslow', 0, 4], ['Hammersmith and Fulham', 1, 4], ['Wandsworth', 2, 4], ['Lambeth', 3, 4], ['Southwark', 4, 4], ['Lewisham', 5, 4], ['Greenwich', 6, 4], ['Bexley', 7, 4],
  ['Richmond upon Thames', 1, 5], ['Kingston upon Thames', 2, 5], ['Merton', 3, 5], ['Croydon', 4, 5], ['Bromley', 5, 5],
  ['Sutton', 3, 6],
]
const short = (n: string) => n.replace(' and ', ' & ').replace(' upon Thames', '').replace('City of London', 'City').replace('Kensington & Chelsea', 'Kens & Chelsea').replace('Hammersmith & Fulham', 'Ham & Fulham').replace('Barking & Dagenham', 'Barking & Dag')

function Tile({ label, value, change, note }: { label: string; value: string; change?: number | null; note?: string }) {
  return (
    <div className="rounded-xl bg-white p-md ring-1 ring-neutral-200">
      <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-neutral-900">{value}</p>
      {change != null && <p className={`text-xs font-semibold tabular-nums ${change < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{change < 0 ? '▼' : '▲'} {pct(change)} on a year ago</p>}
      {note && <p className="text-xs text-neutral-500">{note}</p>}
    </div>
  )
}

export default function MarketPage() {
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [setup, setSetup] = useState(false)
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Area | null>(null)
  const [mapBy, setMapBy] = useState<'rent' | 'change'>('change')
  // the map's change over 1, 3, 6 or 12 months (12 Nov 2026, Harry)
  const [span, setSpan] = useState<1 | 3 | 6 | 12>(12)
  const chg = (a: Area) => a.changes?.[span] ?? (span === 12 ? a.change : null)
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const loadAreas = () => adminFetch('/api/admin/market').then(r => r.json()).then(x => { setAreas(x.areas ?? []); setSetup(!!x.setupNeeded) })
  useEffect(() => { loadAreas() }, [])
  useEffect(() => {
    if (!pick) return
    setD(null); setErr(''); setBusy('area')
    adminFetch(`/api/admin/market?area=${pick.code}`).then(async r => { const x = await r.json(); setBusy(''); if (!r.ok) setErr(x.error || 'Couldn’t load'); else setD(x) })
  }, [pick])
  // open on Southwark the first time
  useEffect(() => { if (areas?.length && !pick) setPick(areas.find(a => a.name === 'Southwark') ?? areas[0]) }, [areas])   // eslint-disable-line react-hooks/exhaustive-deps

  const byName = useMemo(() => new Map((areas ?? []).map(a => [a.name, a])), [areas])
  const hits = q.trim().length >= 2 ? (areas ?? []).filter(a => a.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : []
  const london = LONDON.map(([n]) => byName.get(n)).filter(Boolean) as Area[]
  const vals = london.map(a => (mapBy === 'rent' ? a.rent : chg(a)) ?? 0)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const shade = (a?: Area) => {
    if (!a) return '#f1f1ef'
    const v = (mapBy === 'rent' ? a.rent : chg(a)) ?? 0, t = hi > lo ? (v - lo) / (hi - lo) : 0.5
    return `hsl(${mapBy === 'change' ? 150 : 205} ${35 + t * 30}% ${92 - t * 52}%)`
  }

  async function refresh() {
    setBusy('refresh'); setErr('')
    const r = await adminFetch('/api/admin/local-rents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) })
    const x = await r.json().catch(() => ({}))
    setBusy(''); if (!r.ok) setErr(x.error || 'Couldn’t load the figures'); else loadAreas()
  }

  const r = d?.rents, s = d?.sales, o = d?.ours, L = d?.london
  const yieldAll = r?.rent_all && s?.average ? (r.rent_all * 12 / s.average) * 100 : null
  const yieldFlat = r?.rent_flat && s?.flat ? (r.rent_flat * 12 / s.flat) * 100 : null
  // talking points — plain facts from the figures, nothing guessed
  const points: string[] = []
  if (r?.change_all != null) points.push(`Rents in ${d.area.name} are ${r.change_all >= 0 ? 'up' : 'down'} ${Math.abs(r.change_all).toFixed(1)}% on a year ago${L?.change != null ? ` (London ${pct(L.change)})` : ''} — the average home now lets for ${gbp(r.rent_all)} a month.`)
  if (s?.change12 != null) points.push(`House prices are ${s.change12 >= 0 ? 'up' : 'down'} ${Math.abs(s.change12).toFixed(1)}% in a year, to an average of ${gbpK(s.average)}${s.flat ? ` (flats of any size ${gbpK(s.flat)})` : ''}.`)
  if (r?.change_all != null && s?.change12 != null && r.change_all > s.change12) points.push(`Rents are rising faster than prices, so yields are improving — about ${yieldAll?.toFixed(1)}% gross on an average home${yieldFlat ? `, ${yieldFlat.toFixed(1)}% on a flat` : ''}.`)
  if (o?.roomMedian) points.push(`Our rooms here typically let for ${gbp(o.roomMedian)} a month${o.ensuiteMedian ? `, en-suites ${gbp(o.ensuiteMedian)}` : ''} — ${o.rooms + o.ensuites} rooms on our books.`)

  const estimate: [string, string, string][] = r ? [
    ['Room (shared bathroom)', o?.roomMedian ? gbp(o.roomMedian) : '—', o?.roomMedian ? (o.roomLow && o.roomHigh ? `usually ${gbp(o.roomLow)}–${gbp(o.roomHigh)} · our ${o.rooms} rooms` : `our ${o.rooms} room${o.rooms === 1 ? '' : 's'}`) : 'none of ours in this area yet'],
    ['En-suite room', o?.ensuiteMedian ? gbp(o.ensuiteMedian) : '—', o?.ensuiteMedian ? (o.ensuiteLow && o.ensuiteHigh ? `usually ${gbp(o.ensuiteLow)}–${gbp(o.ensuiteHigh)} · our ${o.ensuites}` : `our ${o.ensuites} en-suite${o.ensuites === 1 ? '' : 's'}`) : 'none of ours in this area yet'],
    ['1-bedroom home', gbp(r.rent_1), pct(r.change_1) && `${pct(r.change_1)} a year · ONS average`],
    ['2-bedroom home', gbp(r.rent_2), pct(r.change_2) && `${pct(r.change_2)} a year · ONS average`],
    ['3-bedroom home', gbp(r.rent_3), pct(r.change_3) && `${pct(r.change_3)} a year · ONS average`],
    ['4 or 5+ bedroom home', gbp(r.rent_4), 'ONS groups 4 bedrooms and more together'],
  ] : []

  return (
    <div className="office min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/lettings" />} title="Market" />
      <PageHero eyebrow="Lettings" title="What it rents and sells for" subtitle="Search an area or tap a London borough: official rents and house prices, what a room or home typically goes for, and talking points for landlords."
        actions={<Link href={`/admin/market/report${pick ? `?areas=${pick.code}` : ''}`} className="rounded-full bg-white px-lg py-sm text-sm font-semibold text-neutral-900">Make a report</Link>} />
      <div className="mx-auto max-w-6xl space-y-lg px-lg py-xl">
        {setup && <p className="rounded-xl bg-amber-50 px-lg py-md text-sm text-amber-900">Run migration 280 in Supabase first.</p>}
        {areas && !areas.length && !setup && (
          <div className="rounded-xl bg-white p-lg ring-1 ring-neutral-200">
            <p className="text-sm text-neutral-700">The official figures haven’t been loaded yet. They update by themselves each month after this.</p>
            <button type="button" onClick={refresh} disabled={busy === 'refresh'} className="mt-sm rounded-full bg-neutral-900 px-lg py-sm text-sm font-semibold text-white disabled:opacity-50">{busy === 'refresh' ? 'Loading — about a minute…' : 'Load the latest figures'}</button>
          </div>
        )}
        {err && <p className="text-sm text-red-700">{err}</p>}

        {!!areas?.length && (
          <div className="grid gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* find an area: search anywhere, or the London map */}
            <section className="space-y-md rounded-2xl bg-white p-lg ring-1 ring-neutral-200">
              <div className="relative">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search any area — e.g. Southwark, Manchester, Brighton" className="w-full rounded-xl border border-neutral-300 px-md py-sm text-base" />
                {hits.length > 0 && <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200">{hits.map(a => <li key={a.code}><button type="button" onClick={() => { setPick(a); setQ('') }} className="flex w-full justify-between px-md py-sm text-left text-sm hover:bg-neutral-50"><span>{a.name}</span><span className="text-neutral-500">{a.region}</span></button></li>)}</ul>}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">London</p>
                <div className="flex gap-1 rounded-full bg-neutral-100 p-0.5 text-xs font-semibold">
                  {([['change', 'Rent change'], ['rent', 'Average rent']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setMapBy(k)} className={`rounded-full px-sm py-0.5 ${mapBy === k ? 'bg-white shadow' : 'text-neutral-500'}`}>{l}</button>)}
                </div>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {Array.from({ length: 7 * 8 }).map((_, i) => {
                  const x = i % 8, y = Math.floor(i / 8)
                  const cell = LONDON.find(([, cx, cy]) => cx === x && cy === y)
                  if (!cell) return <div key={i} />
                  const a = byName.get(cell[0])
                  const on = pick?.name === cell[0]
                  return (
                    <button key={i} type="button" disabled={!a} onClick={() => a && setPick(a)} title={a ? `${a.name}: ${gbp(a.rent)} · ${pct(chg(a))} over ${span} month${span === 1 ? '' : 's'}` : cell[0]}
                      className={`flex aspect-square flex-col items-center justify-center rounded-md p-0.5 text-center leading-tight transition hover:scale-105 ${on ? 'ring-2 ring-neutral-900' : ''}`} style={{ background: shade(a) }}>
                      <span className="text-[9px] font-semibold text-neutral-900 sm:text-[10px]">{short(cell[0])}</span>
                      {a && <span className="text-[9px] tabular-nums text-neutral-700 sm:text-[10px]">{mapBy === 'rent' ? gbpK(a.rent) : pct(chg(a)) || '—'}</span>}
                    </button>
                  )
                })}
              </div>
              {mapBy === 'change' && (
                <div className="flex items-center gap-xs text-xs">
                  <span className="text-neutral-500">Over</span>
                  {([1, 3, 6, 12] as const).map(n => <button key={n} type="button" onClick={() => setSpan(n)} className={`rounded-full px-sm py-0.5 font-semibold ${span === n ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{n === 12 ? '12 months' : `${n}m`}</button>)}
                </div>
              )}
              <p className="text-[11px] text-neutral-500">Darker = {mapBy === 'rent' ? 'higher average rent' : `rents rising faster over ${span === 1 ? 'the last month' : `${span} months`}`}. Tap a borough.</p>
            </section>

            {/* the area at a glance */}
            <section className="space-y-md">
              {busy === 'area' && <p className="text-sm text-neutral-500">Loading {pick?.name}…</p>}
              {d && (
                <>
                  <div className="rounded-2xl bg-neutral-900 p-lg text-white">
                    <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">{d.area.region ?? 'Area'} · rents {month(r.period)}{s ? ` · prices ${month(s.month)}` : ''}</p>
                    <h2 className="text-3xl font-extrabold">{d.area.name}</h2>
                    {points.length > 0 && <ul className="mt-sm space-y-1 text-sm text-neutral-200">{points.map(p => <li key={p}>• {p}</li>)}</ul>}
                  </div>
                  {d.changes && (
                    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-neutral-200">
                      <table className="w-full text-sm tabular-nums">
                        <thead><tr className="text-[11px] uppercase tracking-wide text-neutral-500"><th className="px-md py-xs text-left font-bold">Change over</th>{[1, 3, 6, 12].map(n => <th key={n} className="px-sm py-xs text-right font-bold">{n === 12 ? '12 months' : `${n} month${n === 1 ? '' : 's'}`}</th>)}</tr></thead>
                        <tbody>
                          {([['Average rent', d.changes.rent], ['Average house price', d.changes.price]] as const).map(([k, c]) => (
                            <tr key={k} className="border-t border-neutral-100"><td className="px-md py-xs font-semibold text-neutral-800">{k}</td>
                              {[1, 3, 6, 12].map(n => { const v = (c as any)?.[n]; return <td key={n} className={`px-sm py-xs text-right font-semibold ${v == null ? 'text-neutral-400' : v < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{v == null ? '—' : `${v < 0 ? '▼' : '▲'} ${pct(v)}`}</td> })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div>
                    <p className="mb-xs text-xs font-bold uppercase tracking-wide text-neutral-500">Renting</p>
                    <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
                      <Tile label="Average rent" value={gbp(r.rent_all)} change={r.change_all} note="a month" />
                      <Tile label="1 bed" value={gbp(r.rent_1)} change={r.change_1} />
                      <Tile label="2 bed" value={gbp(r.rent_2)} change={r.change_2} />
                      <Tile label="3 bed" value={gbp(r.rent_3)} change={r.change_3} />
                      <Tile label="Flat or maisonette" value={gbp(r.rent_flat)} note="any size" />
                      <Tile label="Gross yield" value={yieldAll ? `${yieldAll.toFixed(1)}%` : '—'} note={yieldFlat ? `flats ${yieldFlat.toFixed(1)}%` : 'average rent × 12 ÷ average price'} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-xs text-xs font-bold uppercase tracking-wide text-neutral-500">Buying <span className="font-semibold normal-case tracking-normal text-neutral-400">· average prices by type of home (the Land Registry doesn’t split by bedrooms)</span></p>
                    {s ? (
                      <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
                        <Tile label="Average price" value={gbpK(s.average)} change={s.change12} />
                        <Tile label="Flat or maisonette" value={gbpK(s.flat)} change={s.changeFlat} note="any size, studio to 3-bed" />
                        <Tile label="Terraced house" value={gbpK(s.terraced)} change={s.changeTerraced} />
                        <Tile label="First-time buyer" value={gbpK(s.firstTime)} />
                        <Tile label="Semi-detached house" value={gbpK(s.semi)} />
                        <Tile label="Last month" value={pct(s.change1) || '—'} note="change on the month before" />
                      </div>
                    ) : <p className="text-sm text-neutral-500">No house price figures for this area.</p>}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {!!areas?.length && <AskData areaCode={pick?.code} areaName={pick?.name} />}
        {!!areas?.length && <p className="text-right text-xs text-neutral-500">Official rents {areas[0]?.period ? month(areas[0].period) : ''} · they update every week by themselves · <button type="button" onClick={refresh} disabled={busy === 'refresh'} className="font-semibold underline">{busy === 'refresh' ? 'Checking…' : 'Check for new figures now'}</button></p>}

        {d && (
          <section className="rounded-2xl bg-white ring-1 ring-neutral-200">
            <header className="border-b border-neutral-100 px-lg py-md">
              <h2 className="text-base font-bold text-neutral-900">What it would typically go for in {d.area.name}</h2>
              <p className="text-xs text-neutral-500">A guide for a first conversation — every house is different. Rooms are from our own lets here; homes are the official average.</p>
            </header>
            <ul className="divide-y divide-neutral-100">
              {estimate.map(([k, v, n]) => (
                <li key={k} className="flex items-center justify-between gap-md px-lg py-sm">
                  <span className="text-sm font-semibold text-neutral-800">{k}</span>
                  <span className="text-right"><span className="block text-lg font-extrabold tabular-nums text-neutral-900">{v}{v !== '—' && <span className="text-xs font-semibold text-neutral-500"> a month</span>}</span>{n && <span className="block text-xs text-neutral-500">{n}</span>}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-neutral-100 px-lg py-sm text-[11px] text-neutral-500">Sources: {d.sources.rents} (ONS, Crown copyright, Open Government Licence) · {d.sources.sales} (HM Land Registry, Crown copyright, Open Government Licence) · Capital Rooms’ own lets.</p>
          </section>
        )}
      </div>
    </div>
  )
}

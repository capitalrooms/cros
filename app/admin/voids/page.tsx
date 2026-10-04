'use client'

// Voids: how long managed rooms sat empty over the last 3, 6 or 12 months — overall, by landlord (open one for its
// houses) and room by room on a timeline. Counted only from when CROS has a record for each room (lib/voids).

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

type Win = 3 | 6 | 12
type Seg = [number, number, 'let' | 'empty' | 'unknown' | 'check']
interface Group { id: string; name: string; rooms: number; counted: number; empty: number; lost: number; rate: number }
interface Room { id: string; name: string; houseId: string; house: string; landlordId: string | null; landlord: string; knownFrom: string; rent: number | null; w: Record<Win, { counted: number; empty: number; lost: number; segments: Seg[] }> }
interface Data {
  today: string; rooms: Room[]; avgDaysToRelet: number | null; relets: number
  summary: Record<Win, { rate: number; emptyDays: number; countedDays: number; lost: number; fullyOnRecord: number; rooms: number; byLandlord: Group[]; byHouse: Group[] }>
  emptyNow: { room: string; house: string; since: string; rent: number | null }[]
  checks: { room: string; house: string; houseId: string; why: string }[]
}

const SEG: Record<Seg[2], string> = { let: '#2F6B4F', empty: '#C8372D', check: 'repeating-linear-gradient(135deg,#F6D58E 0 4px,#EBC46A 4px 6px)', unknown: 'repeating-linear-gradient(135deg,#F1EFEB 0 4px,#E6E2DC 4px 5px)' }
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const card = 'rounded-[10px] border border-[#E4E1DB] bg-white'
const th = 'px-md py-sm text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500'
const td = 'px-md py-sm text-[13px] tabular-nums'

export default function VoidsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [win, setWin] = useState<Win>(12)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/voids').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load voids'); setData(d) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load voids'))
  }, [])

  const sum = data?.summary[win]
  const total = data?.rooms[0]?.w[win].segments.reduce((a, s) => Math.max(a, s[1]), 0) ?? 1
  const start = data ? (() => { const d = new Date(`${data.today}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - win); return d })() : null
  const ticks = start ? Array.from({ length: win + 1 }, (_, i) => { const d = new Date(start); d.setUTCMonth(d.getUTCMonth() + i, 1); const off = Math.round((d.getTime() - start.getTime()) / 86400000); return { off, label: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) } }).filter(t => t.off > 0 && t.off < total) : []
  const houses = data ? [...new Set(data.rooms.map(r => r.houseId))] : []

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/lettings" />} title="Voids" />
      <PageHero
        title="Voids"
        subtitle="How long rooms sat empty. Each room is counted from when CROS first has a record for it; earlier history isn't on file yet."
        stats={sum ? [
          { label: `void rate · last ${win} months`, value: `${sum.rate}%`, tone: sum.rate > 5 ? 'bad' : sum.rate > 2 ? 'warn' : 'good' },
          { label: 'empty room-days', value: sum.emptyDays.toLocaleString('en-GB') },
          { label: 'rent lost', value: gbp(sum.lost), tone: sum.lost ? 'bad' : undefined },
          { label: `days to re-let · average of ${data!.relets}`, value: data!.avgDaysToRelet ?? '—' },
        ] : undefined}
        tabs={([3, 6, 12] as Win[]).map(m => ({ key: String(m), label: `${m} months`, active: win === m, onClick: () => setWin(m) }))}
      />
      <div className="mx-auto max-w-6xl space-y-md px-lg py-xl">
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="text-sm text-neutral-500">Working out voids…</p>}
        {data && sum && (<>
          <p className="text-[12.5px] text-neutral-600">
            {sum.fullyOnRecord} of {sum.rooms} rooms have records for the whole {win} months; the rest count from their first tenancy on file. Rent lost uses each room’s latest rent.
          </p>

          {(data.emptyNow.length > 0 || data.checks.length > 0) && (
            <div className="grid gap-md md:grid-cols-2">
              <section className={card}>
                <h2 className="border-b border-[#E4E1DB] px-md py-sm text-[11.5px] font-bold uppercase tracking-[0.06em] text-neutral-600">Empty now</h2>
                {data.emptyNow.length ? data.emptyNow.map(e => (
                  <div key={e.house + e.room} className="flex justify-between gap-sm border-t border-[#F0EEEA] px-md py-sm text-[13px] first-of-type:border-t-0">
                    <span>{e.room}, {e.house}</span><span className="text-neutral-500">since {day(e.since)}{e.rent ? ` · ${gbp(e.rent)}/month` : ''}</span>
                  </div>
                )) : <p className="px-md py-sm text-[13px] text-neutral-500">No rooms empty.</p>}
              </section>
              <section className={`${card} border-amber-300`}>
                <h2 className="border-b border-amber-200 bg-amber-50 px-md py-sm text-[11.5px] font-bold uppercase tracking-[0.06em] text-amber-800">Records to check · not counted</h2>
                {data.checks.length ? data.checks.map(c => (
                  <Link key={c.house + c.room} href={`/admin/properties/${c.houseId}`} className="block border-t border-[#F0EEEA] px-md py-sm text-[13px] first-of-type:border-t-0 hover:bg-neutral-50">
                    <b>{c.room}, {c.house}</b> <span className="text-neutral-600">— {c.why}</span>
                  </Link>
                )) : <p className="px-md py-sm text-[13px] text-neutral-500">Records and rooms agree.</p>}
              </section>
            </div>
          )}

          <section className={`${card} overflow-x-auto`}>
            <h2 className="border-b border-[#E4E1DB] px-md py-sm text-[11.5px] font-bold uppercase tracking-[0.06em] text-neutral-600">By landlord · open one for its houses</h2>
            <table className="w-full min-w-[620px]">
              <thead><tr className="bg-[#FAF9F7]"><th className={th}>Landlord</th><th className={th}>Rooms</th><th className={th}>Days counted</th><th className={th}>Empty days</th><th className={th}>Void rate</th><th className={th}>Rent lost</th></tr></thead>
              <tbody>
                {sum.byLandlord.map(l => {
                  const hs = sum.byHouse.filter(h => data.rooms.some(r => r.houseId === h.id && (r.landlordId ?? 'none') === l.id))
                  return (
                    <Fragment key={l.id}>
                      <tr className="cursor-pointer border-t border-[#F0EEEA] hover:bg-neutral-50" onClick={() => setOpen(open === l.id ? null : l.id)}>
                        <td className={`${td} font-semibold`}>{open === l.id ? '▾' : '▸'} {l.name}</td><td className={td}>{l.rooms}</td><td className={td}>{l.counted.toLocaleString('en-GB')}</td>
                        <td className={td}>{l.empty}</td><td className={`${td} font-bold`} style={{ color: l.rate > 5 ? '#C8372D' : undefined }}>{l.rate}%</td><td className={td}>{l.lost ? gbp(l.lost) : '—'}</td>
                      </tr>
                      {open === l.id && hs.map(h => (
                        <tr key={h.id} className="bg-[#FAF9F7] text-neutral-700">
                          <td className={`${td} pl-xl`}><Link href={`/admin/properties/${h.id}`} className="hover:underline">{h.name}</Link></td><td className={td}>{h.rooms}</td><td className={td}>{h.counted.toLocaleString('en-GB')}</td>
                          <td className={td}>{h.empty}</td><td className={td}>{h.rate}%</td><td className={td}>{h.lost ? gbp(h.lost) : '—'}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-sm border-b border-[#E4E1DB] px-md py-sm">
              <h2 className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-neutral-600">Every room · last {win} months</h2>
              <span className="flex flex-wrap gap-x-md gap-y-1 text-[11.5px] text-neutral-500">
                {([['let', 'Let'], ['empty', 'Empty'], ['check', 'Records to check'], ['unknown', 'Not on record yet']] as const).map(([k, l]) => <span key={k} className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: SEG[k] }} />{l}</span>)}
              </span>
            </div>
            <div className="overflow-x-auto px-md py-sm">
              <div className="min-w-[640px]">
                <div className="relative ml-[200px] h-4 text-[10.5px] text-neutral-500">
                  {ticks.map(t => <span key={t.off} className="absolute -translate-x-1/2" style={{ left: `${t.off / total * 100}%` }}>{t.label}</span>)}
                </div>
                {houses.map(hid => {
                  const rs = data.rooms.filter(r => r.houseId === hid)
                  return (
                    <div key={hid} className="border-t border-[#F0EEEA] py-1 first:border-t-0">
                      {rs.map((r, i) => (
                        <div key={r.id} className="flex items-center gap-sm py-[2px]">
                          <span className="w-[192px] flex-none truncate text-[12px]">{i === 0 ? <b>{r.house}</b> : null}{i === 0 ? ' · ' : <span className="pl-sm" />}{r.name}</span>
                          <div className="relative h-[14px] flex-1 overflow-hidden rounded-[3px] bg-[#F1EFEB]">
                            {r.w[win].segments.map(([a, b, k], j) => <i key={j} className="absolute inset-y-0" title={`${k} · ${b - a} days`} style={{ left: `${a / total * 100}%`, width: `${(b - a) / total * 100}%`, background: SEG[k] }} />)}
                            {ticks.map(t => <i key={t.off} className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${t.off / total * 100}%` }} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        </>)}
      </div>
    </div>
  )
}

'use client'
// Planned Works — the office's view of multi-day projects (24 Nov 2026). Make a job planned, see every live project
// across the houses, mark facilities, confirm the expected date, and close a project after inspection.
import { useCallback, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { FACILITY_LABEL, ALL_FACILITY_STATUS } from '@/lib/plannedWorks'

type Item = {
  id: string; title: string; address: string; projectStatus: string | null; day: number; duration: number | null
  expectedCompleteOn: string | null; facilities: { name: string; facility_status: string }[]
  latest: { update_date: string; message: string; kind: string } | null; stale: boolean
}
type Candidate = { id: string; title: string; address: string; status: string }

const FACILITY_NAMES = ['Sink', 'Shower', 'Bath', 'Toilet', 'Kitchen', 'Cooker', 'Heating', 'Hot water']
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export default function PlannedWorksPage() {
  const [items, setItems] = useState<Item[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState('')
  const [pick, setPick] = useState('')
  const [dur, setDur] = useState('5')
  const [startOn, setStartOn] = useState(today())

  const load = useCallback(async () => {
    const r = await adminFetch('/api/planned-works?active=1').catch(() => null)
    const j = r?.ok ? await r.json() : { items: [], candidates: [] }
    setItems(j.items ?? []); setCandidates(j.candidates ?? []); setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  async function act(body: Record<string, unknown>) {
    setMsg('')
    const r = await adminFetch('/api/planned-works', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { setMsg(j.error || 'That didn’t save — try again.'); return }
    setMsg('Saved.'); await load()
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Planned works" />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
          <h2 className="font-bold text-neutral-900">Make a job a planned project</h2>
          <p className="mt-xs text-sm text-neutral-600">For work that runs over several working days. The contractor sends a daily update; the project stays open over weekends until you close it.</p>
          <div className="mt-md grid gap-sm sm:grid-cols-4">
            <select value={pick} onChange={e => setPick(e.target.value)} className="rounded-xl border border-neutral-300 px-sm py-sm text-sm sm:col-span-2">
              <option value="">Choose a job…</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.title}{c.address ? ` · ${c.address}` : ''}</option>)}
            </select>
            <label className="text-sm text-neutral-700">Working days<input type="number" min={1} max={60} value={dur} onChange={e => setDur(e.target.value)} className="mt-xs block w-full rounded-xl border border-neutral-300 px-sm py-sm" /></label>
            <label className="text-sm text-neutral-700">Start date<input type="date" value={startOn} onChange={e => setStartOn(e.target.value)} className="mt-xs block w-full rounded-xl border border-neutral-300 px-sm py-sm" /></label>
          </div>
          <button type="button" disabled={!pick} onClick={() => act({ action: 'raise', ticketId: pick, durationDays: Number(dur), startOn })}
            className="mt-md rounded-full bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">Make it a planned project</button>
        </section>

        {msg && <p className="text-sm font-semibold text-neutral-800">{msg}</p>}

        <section className="space-y-md">
          <h2 className="font-bold text-neutral-900">Live projects</h2>
          {loaded && items.length === 0 && <p className="rounded-2xl bg-white p-lg text-sm text-neutral-600">No planned projects are live.</p>}
          {items.map(it => (
            <div key={it.id} className="rounded-2xl border border-neutral-200 bg-white p-lg">
              <div className="flex flex-wrap items-baseline justify-between gap-sm">
                <p className="font-bold text-neutral-900">{it.title}</p>
                <p className="text-sm text-neutral-600">{it.address}</p>
              </div>
              <p className="mt-xs text-sm text-neutral-700">
                {it.projectStatus === 'delayed' ? 'Delayed' : it.projectStatus === 'paused' ? 'Paused' : 'In progress'} · day {it.day} of {it.duration ?? '?'} · expected {it.expectedCompleteOn ?? 'not set'}
                {it.stale && <span className="ml-sm rounded-full bg-amber-100 px-sm py-xs text-xs font-semibold text-amber-900">No update today</span>}
              </p>
              {it.latest && <p className="mt-xs text-sm text-neutral-600">Latest ({it.latest.update_date}): {it.latest.message}</p>}
              <div className="mt-md flex flex-wrap gap-sm">
                {FACILITY_NAMES.map(name => {
                  const cur = it.facilities.find(f => f.name === name)?.facility_status ?? 'unavailable'
                  return (
                    <label key={name} className="text-xs text-neutral-700">{name}
                      <select value={cur} onChange={e => act({ action: 'facility', ticketId: it.id, name, status: e.target.value })} className="ml-xs rounded-lg border border-neutral-300 px-xs py-xs text-xs">
                        {ALL_FACILITY_STATUS.map(s => <option key={s} value={s}>{FACILITY_LABEL[s]}</option>)}
                      </select>
                    </label>
                  )
                })}
              </div>
              <div className="mt-md flex flex-wrap gap-sm">
                <label className="text-xs text-neutral-700">Expected finish
                  <input type="date" defaultValue={it.expectedCompleteOn ?? ''} onBlur={e => e.target.value && e.target.value !== it.expectedCompleteOn && act({ action: 'confirm_expected', ticketId: it.id, date: e.target.value })} className="ml-xs rounded-lg border border-neutral-300 px-xs py-xs text-xs" />
                </label>
                <button type="button" onClick={() => { if (confirm('Close this project? Only do this after the final inspection.')) act({ action: 'confirm_complete', ticketId: it.id }) }}
                  className="rounded-full bg-white px-md py-xs text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300">Close after inspection</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

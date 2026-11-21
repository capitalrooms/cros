'use client'

// The house: jobs anyone can tick off, and your own private spending record (21 Nov 2026).
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

type Job = { key: string; label: string; lastBy: string | null; lastAt: string | null }
type Spend = { id: string; description: string; amount_gbp: number | null; bought_on: string }

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
const field = 'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[15px] text-neutral-900'

export default function HouseJobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [mine, setMine] = useState<Spend[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [boughtOn, setBoughtOn] = useState(new Date().toISOString().slice(0, 10))

  async function loadJobs() {
    const r = await adminFetch('/api/tenant/house-jobs'); const d = await r.json()
    if (r.ok) setJobs(d.jobs)
  }
  async function loadSpend() {
    const r = await adminFetch('/api/tenant/personal-spending'); const d = await r.json()
    if (r.ok) setMine(d.rows)
  }
  useEffect(() => { loadJobs(); loadSpend() }, [])

  async function didIt(key: string) {
    setBusy(key); setMsg('')
    const r = await adminFetch('/api/tenant/house-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobKey: key }) })
    setBusy('')
    if (!r.ok) { setMsg('That didn’t save. Please try again.'); return }
    setMsg('Thanks, that’s logged.')
    loadJobs()
  }

  async function addSpend() {
    setBusy('spend'); setMsg('')
    const r = await adminFetch('/api/tenant/personal-spending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: desc, amount, boughtOn }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setMsg(d.error || 'That didn’t save.'); return }
    setDesc(''); setAmount(''); setMsg('Saved to your record.')
    loadSpend()
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/tenant" />} title="The house" />
      <div className="mx-auto max-w-xl px-lg py-xl space-y-lg">
        <section className="rounded-2xl bg-white p-lg shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Jobs around the house</h2>
          <p className="mt-xs text-sm text-neutral-600">Tap “I did this” when you’ve done one, so housemates know it’s taken care of.</p>
          {!jobs && <p className="mt-md text-sm text-neutral-500">Loading…</p>}
          <div className="mt-md divide-y divide-neutral-100">
            {(jobs ?? []).map(j => (
              <div key={j.key} className="flex items-center justify-between gap-md py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">{j.label}</p>
                  <p className="text-xs text-neutral-500">{j.lastBy && j.lastAt ? `Last done by ${j.lastBy}, ${when(j.lastAt)}` : 'Not done recently'}</p>
                </div>
                <button type="button" disabled={busy === j.key} onClick={() => didIt(j.key)} className="shrink-0 rounded-full bg-[#17332B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy === j.key ? '…' : 'I did this'}</button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-lg shadow-sm space-y-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">What I’ve bought for the house</h2>
          <p className="text-sm text-neutral-600">Only you can see this. We don’t pay anyone back, so this is just for your own records. The amount is optional.</p>
          <input className={field} value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Bleach and bin bags" />
          <div className="grid grid-cols-2 gap-sm">
            <input className={field} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="£ (optional)" />
            <input className={field} type="date" value={boughtOn} onChange={e => setBoughtOn(e.target.value)} />
          </div>
          <button type="button" disabled={busy === 'spend' || desc.trim().length < 2} onClick={addSpend} className="w-full rounded-full bg-[#17332B] py-3 text-sm font-bold text-white disabled:opacity-40">{busy === 'spend' ? 'Saving…' : 'Save to my record'}</button>
          {mine.length > 0 && (
            <ul className="mt-md divide-y divide-neutral-100 text-sm">
              {mine.map(r => (
                <li key={r.id} className="flex justify-between py-2"><span>{r.description} <span className="text-neutral-500">· {when(r.bought_on)}</span></span><span className="tabular-nums">{r.amount_gbp == null ? '' : `£${Number(r.amount_gbp).toFixed(2)}`}</span></li>
              ))}
            </ul>
          )}
        </section>
        {msg && <p role="status" className="text-center text-sm text-neutral-700">{msg}</p>}
      </div>
    </div>
  )
}

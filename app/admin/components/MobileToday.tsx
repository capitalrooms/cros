'use client'

// Phone "Today" — what needs you now, with the action on the card. Shown below md only.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'
import type { TodayItem } from '@/app/api/admin/today/route'

const TONE: Record<string, string> = {
  red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-800', green: 'bg-emerald-50 text-emerald-700', grey: 'bg-neutral-100 text-neutral-600',
}
const GROUPS: [TodayItem['group'], string][] = [['needs_you', 'Needs you'], ['today', 'Later today'], ['coming_up', 'Coming up']]
const ACTION: Partial<Record<TodayItem['kind'], string>> = {
  job_approve: 'Approve & assign', quote_review: 'Review quote', aml_review: 'Review', certificate: 'Open', move_out: 'Open', viewing: 'Open', appointment: 'Open',
}

export default function MobileToday() {
  const [items, setItems] = useState<TodayItem[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [first, setFirst] = useState('')

  async function load() {
    try {
      const res = await adminFetch('/api/admin/today')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not load today')
      setItems(d.items); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load today') }
  }
  useEffect(() => {
    load()
    adminFetch('/api/admin/profile').then(r => r.json()).then(d => setFirst(d.person?.first_name || '')).catch(() => {})
  }, [])

  async function markPaid(it: TodayItem) {
    if (!it.chargeId) return
    setBusy(it.id)
    try {
      const res = await adminFetch(`/api/admin/rent-charges/${it.chargeId}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_received: it.amount, payment_date: new Date().toISOString().slice(0, 10), payment_method: 'bank_transfer', payment_notes: 'Marked paid from phone' }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not mark as paid')
      setItems(prev => (prev ?? []).filter(x => x.id !== it.id))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not mark as paid') }
    finally { setBusy('') }
  }

  const hour = new Date().getHours()
  const hello = `${hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'}${first ? `, ${first}` : ''}`
  const needs = items?.filter(i => i.group === 'needs_you').length ?? 0
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
      <header>
        <p className="text-xs text-neutral-500">{dateLabel}</p>
        <h1 className="text-[26px] leading-tight font-bold text-neutral-950">{hello}</h1>
        {items && <p className="text-sm text-neutral-500 mt-0.5">{needs ? `${needs} thing${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} you` : 'Nothing needs you right now'}</p>}
      </header>

      {/* photograph post, a room or a safety-check sheet — filed from the Capture inbox */}
      <Link href="/admin/capture" className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-neutral-200">
        <span><span className="block text-sm font-bold text-neutral-950">📷 Capture</span><span className="block text-xs text-neutral-500">Photo of post, a room or a check sheet → filed</span></span>
        <span className="text-neutral-400">›</span>
      </Link>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error} <button className="underline ml-1" onClick={load}>Try again</button></div>}
      {!items && !error && <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-white animate-pulse" />)}</div>}

      {items && items.length === 0 && (
        <div className="rounded-2xl bg-neutral-950 text-white p-5">
          <p className="text-lg font-bold">All clear</p>
          <p className="text-sm text-white/70 mt-1">No jobs to approve, no overdue rent and nothing expiring. Enjoy it.</p>
        </div>
      )}

      {items && GROUPS.map(([g, label]) => {
        const list = items.filter(i => i.group === g)
        if (!list.length) return null
        return (
          <section key={g} className="space-y-2">
            <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{label} · {list.length}</h2>
            {list.map(it => (
              <div key={it.id} className="rounded-2xl bg-white p-3.5 shadow-[0_1px_0_rgba(0,0,0,0.04)] space-y-2">
                <Link href={it.href} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[15px] font-bold text-neutral-950 leading-snug">{it.title}</p>
                    {it.tag && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONE[it.tag.tone]}`}>{it.tag.text}</span>}
                  </div>
                  {it.detail && <p className="text-[13px] text-neutral-500 mt-0.5">{it.detail}</p>}
                </Link>
                <div className="flex flex-wrap gap-2">
                  {it.kind === 'rent_overdue' ? (
                    <>
                      <button type="button" disabled={busy === it.id} onClick={() => markPaid(it)}
                        className="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busy === it.id ? '…' : 'Mark paid'}</button>
                      <Link href={it.href} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-800">Open</Link>
                    </>
                  ) : (
                    <Link href={it.href} className="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-bold text-white">{ACTION[it.kind] ?? 'Open'}</Link>
                  )}
                  {it.phone && <a href={`tel:${it.phone}`} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-800">Call</a>}
                </div>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

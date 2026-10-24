'use client'

// This month's rent timing on the Arrears page (22 Oct 2026): how many paid on time, who paid late and by how much,
// who hasn't paid — and a kind reminder to the ones you tick, in their app and by email (lib/rent/timing).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import type { RentTiming } from '@/lib/rent/timing'

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const addMonth = (m: string, n: number) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7) }

export default function RentTimingPanel() {
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7))
  const [data, setData] = useState<{ rows: RentTiming[]; collecting: boolean; from: string; previews: Record<string, { title: string; body: string }> } | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<string | null>(null)
  const [channels, setChannels] = useState<'push_email' | 'push_only'>('push_email')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    setData(null); setNote(null); setLoadError(null)
    adminFetch(`/api/admin/rent-reminders?month=${month}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      // a refused request (e.g. signed out) is an error to show, never data to draw — it crashed the Arrears screen
      if (!r.ok || !Array.isArray(d.rows)) { setLoadError(d.error ?? 'Rent timing couldn’t be loaded — sign in again, or try later.'); return }
      setData(d)
      // late payers ticked; unpaid ones left for you to choose
      setPicked(new Set(((d.rows ?? []) as RentTiming[]).filter(r => r.state === 'late').map(r => r.tenancyId)))
    }).catch(() => setLoadError('Rent timing couldn’t be loaded — check the connection.'))
  }, [month])

  const rows = data?.rows ?? []
  const late = rows.filter(r => r.state === 'late'), unpaid = rows.filter(r => r.state === 'unpaid'), onTime = rows.filter(r => r.state === 'on_time')
  const chase = [...late, ...unpaid]

  async function send() {
    if (!picked.size) return
    if (!window.confirm(`Send a kind reminder to ${picked.size} tenant${picked.size === 1 ? '' : 's'} (${channels === 'push_only' ? 'in their app' : 'in their app and by email'})?`)) return
    setSending(true); setNote(null)
    try {
      const r = await adminFetch('/api/admin/rent-reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, tenancyIds: [...picked], channels }) })
      const d = await r.json().catch(() => ({}))
      setNote(r.ok ? { ok: true, text: `Sent to ${d.sent} tenant${d.sent === 1 ? '' : 's'} — ${d.pushes} phone notification${d.pushes === 1 ? '' : 's'}${channels === 'push_email' ? `, ${d.emails} email${d.emails === 1 ? '' : 's'}` : ''}.` } : { ok: false, text: d.error ?? 'Not sent.' })
    } finally { setSending(false) }
  }

  return (
    <section className="mb-lg rounded-xl border border-neutral-200 bg-white p-lg">
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Rent timing — {monthName(month)}</h2>
          <p className="text-xs text-neutral-500">When each rent reached us against its due date. Tick tenants for a kind reminder.</p>
        </div>
        <div className="flex gap-xs">
          <button onClick={() => setMonth(m => addMonth(m, -1))} className="rounded-lg border border-neutral-200 px-sm py-xs text-sm" aria-label="Previous month">‹</button>
          <button onClick={() => setMonth(m => addMonth(m, 1))} className="rounded-lg border border-neutral-200 px-sm py-xs text-sm" aria-label="Next month">›</button>
        </div>
      </div>

      {loadError ? <p className="text-sm font-semibold text-red-700">{loadError}</p>
        : !data ? <p className="text-sm text-neutral-400">Loading…</p>
        : !data.collecting ? <p className="text-sm text-neutral-500">{monthName(month)} is in the import period — CROS collects rent from {monthName((data.from || month).slice(0, 7))}, so timing starts then.</p>
        : !rows.length ? <p className="text-sm text-neutral-500">No rent charges for {monthName(month)} yet — they’re raised on the 1st.</p>
        : <>
          <div className="mb-md grid grid-cols-3 gap-sm">
            {[['On time', onTime.length, 'text-green-700'], ['Paid late', late.length, 'text-amber-700'], ['Not paid yet', unpaid.length, 'text-red-700']].map(([l, n, c]) => (
              <div key={l as string} className="rounded-lg bg-neutral-50 px-md py-sm"><p className="text-xs text-neutral-500">{l}</p><p className={`text-xl font-bold tabular-nums ${c}`}>{n}</p></div>
            ))}
          </div>
          {chase.length === 0 ? <p className="text-sm text-green-800">Everyone due so far has paid on time. 🎉</p> : <>
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
              {chase.map(r => (
                <li key={r.tenancyId} className="px-md py-sm text-sm">
                  <div className="flex flex-wrap items-center gap-sm">
                    <input type="checkbox" className="h-4 w-4" aria-label={`Remind ${r.tenant}`} checked={picked.has(r.tenancyId)}
                      onChange={() => setPicked(p => { const n = new Set(p); n.has(r.tenancyId) ? n.delete(r.tenancyId) : n.add(r.tenancyId); return n })} />
                    <span className="min-w-0 flex-1"><strong>{r.tenant}</strong> <span className="text-neutral-500">· {r.room}, {r.property}</span></span>
                    <span className={`rounded-full px-sm py-[2px] text-xs font-bold ${r.state === 'late' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>
                      {r.state === 'late' ? `Paid ${short(r.paidOn!)} · ${r.daysLate} day${r.daysLate === 1 ? '' : 's'} late` : `${gbp(r.amount)} due ${short(r.due)} · ${r.daysLate} day${r.daysLate === 1 ? '' : 's'}`}
                    </span>
                    <span className="text-[11px] text-neutral-500">{r.hasApp ? 'App on phone' : r.hasEmail ? 'Email only' : 'No app or email'}</span>
                    <button onClick={() => setPreview(p => p === r.tenancyId ? null : r.tenancyId)} className="text-xs font-semibold text-blue-700 underline">{preview === r.tenancyId ? 'Hide' : 'See message'}</button>
                  </div>
                  {preview === r.tenancyId && data.previews[r.tenancyId] && (
                    <div className="mt-sm rounded-lg bg-neutral-50 p-sm text-xs text-neutral-700"><p className="font-bold text-neutral-900">{data.previews[r.tenancyId].title}</p><p>Dear {r.dear}, {data.previews[r.tenancyId].body}</p></div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-md flex flex-wrap items-center justify-between gap-sm">
              <div className="flex gap-xs">
                {([['push_email', 'App + email'], ['push_only', 'App only']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setChannels(v)} className={`rounded-lg border px-md py-xs text-sm font-semibold ${channels === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700'}`}>{l}</button>
                ))}
              </div>
              <button onClick={send} disabled={sending || !picked.size} className="rounded-lg bg-blue-600 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{sending ? 'Sending…' : `Send a kind reminder to ${picked.size}`}</button>
            </div>
          </>}
          {note && <p className={`mt-sm text-sm font-semibold ${note.ok ? 'text-green-800' : 'text-red-700'}`}>{note.text}</p>}
        </>}
    </section>
  )
}

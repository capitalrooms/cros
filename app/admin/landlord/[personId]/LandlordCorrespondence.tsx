'use client'

// Landlord profile → Correspondence (22 Oct 2026): how they like to hear from us, who's copied in (an accountant, a
// partner), and everything we've sent them, newest first. Migration 239.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Cc = { name: string; email: string; role: string }
type Item = { at: string; kind: string; title: string; to: string }
const PREFS = [
  { v: 'app_and_email', l: 'App and email', h: 'A note in their app and an email' },
  { v: 'app_only', l: 'App only', h: 'They keep everything in the app — no email' },
  { v: 'email_only', l: 'Email only', h: 'Email, nothing in the app' },
] as const
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })

export default function LandlordCorrespondence({ personId }: { personId: string }) {
  const [data, setData] = useState<{ contactPref: string; cc: Cc[]; setupNeeded: boolean; items: Item[] } | null>(null)
  const [cc, setCc] = useState<Cc[]>([])
  const [pref, setPref] = useState('app_and_email')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [kind, setKind] = useState('All')

  useEffect(() => {
    adminFetch(`/api/admin/landlords/${personId}/correspondence`).then(r => r.json()).then(d => { setData(d); setCc(d.cc ?? []); setPref(d.contactPref ?? 'app_and_email') })
  }, [personId])

  async function save(patch: Record<string, unknown>) {
    setMsg(null)
    const r = await adminFetch(`/api/admin/landlords/${personId}/correspondence`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const d = await r.json().catch(() => ({}))
    setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: d.error ?? 'Not saved' })
  }

  if (!data) return <p className="text-sm text-neutral-400">Loading…</p>
  const kinds = ['All', ...new Set(data.items.map(i => i.kind))]
  const shown = data.items.filter(i => kind === 'All' || i.kind === kind)
  const input = 'rounded-lg border border-neutral-200 px-sm py-xs text-sm'

  return (
    <div className="space-y-lg">
      {data.setupNeeded && <p className="rounded-lg bg-amber-50 px-md py-sm text-sm text-amber-900">Run migration 239 in Supabase to save how they like to hear from us and who to copy in.</p>}
      {msg && <p className={`rounded-lg px-md py-sm text-sm ${msg.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}

      <section className="rounded-xl border border-neutral-200 bg-white p-lg">
        <h2 className="mb-xs text-base font-bold text-neutral-900">How they like to hear from us</h2>
        <p className="mb-md text-xs text-neutral-500">Shown to whoever sends them a statement, invoice or letter.</p>
        <div className="grid gap-sm sm:grid-cols-3">
          {PREFS.map(p => (
            <button key={p.v} onClick={() => { setPref(p.v); save({ contact_pref: p.v }) }}
              className={`rounded-xl border p-sm text-left ${pref === p.v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'}`}>
              <span className="block text-sm font-bold">{p.l}</span>
              <span className={`block text-[11px] ${pref === p.v ? 'text-neutral-300' : 'text-neutral-500'}`}>{p.h}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-lg">
        <h2 className="mb-xs text-base font-bold text-neutral-900">Copy in</h2>
        <p className="mb-md text-xs text-neutral-500">Their accountant or anyone else who should get a copy of statements, invoices and letters. Added to the CC line when you send — you can still remove them for one send.</p>
        <div className="space-y-sm">
          {cc.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-sm">
              <input className={`${input} w-40`} placeholder="Name" value={c.name} onChange={e => setCc(l => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <input className={`${input} w-56`} placeholder="Email" value={c.email} onChange={e => setCc(l => l.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
              <input className={`${input} w-32`} placeholder="e.g. Accountant" value={c.role} onChange={e => setCc(l => l.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
              <button onClick={() => setCc(l => l.filter((_, j) => j !== i))} className="text-sm text-neutral-400 hover:text-red-700" aria-label="Remove">×</button>
            </div>
          ))}
          <div className="flex gap-sm">
            <button onClick={() => setCc(l => [...l, { name: '', email: '', role: 'Accountant' }])} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">+ Add someone</button>
            <button onClick={() => save({ correspondence_cc: cc.filter(c => c.email.trim()) })} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-semibold text-white">Save</button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-lg">
        <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
          <h2 className="text-base font-bold text-neutral-900">Everything we’ve sent ({data.items.length})</h2>
          <div className="flex flex-wrap gap-xs">
            {kinds.map(k => <button key={k} onClick={() => setKind(k)} className={`rounded-full px-sm py-[2px] text-xs font-semibold ${kind === k ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{k}</button>)}
          </div>
        </div>
        {!shown.length ? <p className="text-sm text-neutral-500">Nothing yet.</p> : (
          <ul className="divide-y divide-neutral-100">
            {shown.map((i, n) => (
              <li key={n} className="flex flex-wrap items-baseline gap-x-md gap-y-xs py-sm text-sm">
                <span className="w-24 shrink-0 text-xs tabular-nums text-neutral-500">{when(i.at)}</span>
                <span className="w-32 shrink-0 text-xs font-semibold text-neutral-600">{i.kind}</span>
                <span className="min-w-0 flex-1 text-neutral-900">{i.title}</span>
                <span className="text-xs text-neutral-500">{i.to}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

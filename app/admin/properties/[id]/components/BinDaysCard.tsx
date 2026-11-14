'use client'
// Bin days on the property page (14 Nov 2026, lib/bins/lookup): the usual day and the next collections from the
// council, when it was last checked, "Look up now", and any tenant reports (bins not collected / day changed).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type D = { ready: boolean; day: string | null; schedule: { date: string; collections: { name: string }[] }[] | null; source: string | null; sourceUrl: string | null; checkedAt: string | null; error: string | null; reports: { id: string; kind: string; left_out: boolean | null; created_at: string }[] }
const day = (iso: string) => new Date(iso + (iso.length === 10 ? 'T12:00' : '')).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })

export default function BinDaysCard({ propertyId }: { propertyId: string }) {
  const [d, setD] = useState<D | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const load = () => adminFetch(`/api/admin/bins?propertyId=${propertyId}`).then(r => r.ok ? r.json() : null).then(setD).catch(() => {})
  useEffect(() => { load() }, [propertyId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const next = (d.schedule ?? []).filter(x => x.date >= today).slice(0, 4)
  async function lookUp() {
    setBusy(true); setMsg('')
    const r = await adminFetch('/api/admin/bins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false); setMsg(r.ok ? `Found: ${j.day ?? 'dates'}${j.next ? `, next ${day(j.next)}` : ''}` : j.error || 'Lookup failed'); load()
  }
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Bin days</p>
        <button type="button" disabled={busy || !d.ready} onClick={lookUp} className="text-xs font-semibold underline disabled:opacity-40" title={d.ready ? '' : 'Needs the WhenIsBins token on Vercel'}>{busy ? 'Looking up…' : 'Look up with the council now'}</button>
      </div>
      <p className="mt-xs text-sm text-neutral-900"><b>{d.day ?? 'Not set'}</b>{d.source === 'whenisbins' && d.checkedAt ? <span className="text-neutral-500"> · from the council, checked {day(d.checkedAt.slice(0, 10))}</span> : d.day ? <span className="text-neutral-500"> · typed in by the office</span> : null}{d.sourceUrl && <> · <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="underline">council page</a></>}</p>
      {next.length > 0 && <ul className="mt-xs space-y-0.5 text-xs text-neutral-700">{next.map(x => <li key={x.date}>{day(x.date)} — {x.collections.map(c => c.name).join(', ')}</li>)}</ul>}
      {!d.ready && <p className="mt-xs text-xs text-amber-800">Automatic lookups switch on once the WhenIsBins token is added (WHENISBINS_API_TOKEN).</p>}
      {d.error && <p className="mt-xs text-xs text-red-700">Last lookup: {d.error}</p>}
      {msg && <p className="mt-xs text-xs text-neutral-700">{msg}</p>}
      {d.reports.length > 0 && <div className="mt-sm space-y-xs">{d.reports.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-sm rounded-lg bg-amber-50 px-sm py-xs text-xs text-amber-950">
          <span>{r.kind === 'missed' ? `Bins not collected${r.left_out ? ' (they were out)' : ''}` : 'Tenant says the day changed'} · {day(r.created_at.slice(0, 10))}</span>
          <button type="button" onClick={async () => { await adminFetch('/api/admin/bins', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId: r.id }) }); load() }} className="font-semibold underline">Dealt with</button>
        </div>
      ))}</div>}
    </div>
  )
}

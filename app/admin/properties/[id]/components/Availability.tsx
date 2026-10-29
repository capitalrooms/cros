'use client'
// "Not available to let" (29 Oct 2026, Harry: 24 Spurgeon Road is empty for subsidence works and was dragging the void
// rate). From the date given its empty rooms aren't counted as void. Saved through /api/admin/properties/[id]/availability.
import { useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

const fullDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export default function Availability({ propertyId, from, reason, onChange }: { propertyId: string; from?: string | null; reason?: string | null; onChange: (u: { unavailable_from: string | null; unavailable_reason: string | null }) => void }) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(from ?? todayIso())
  const [why, setWhy] = useState(reason ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save(unavailable: boolean) {
    setBusy(true); setErr('')
    const r = await adminFetch(`/api/admin/properties/${propertyId}/availability`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unavailable_from: unavailable ? date : null, reason: why }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Couldn’t save that — try again'); return }
    onChange({ unavailable_from: d.unavailable_from ?? null, unavailable_reason: d.unavailable_reason ?? null }); setEditing(false)
  }

  return (
    <div className="rounded-xl border border-neutral-200 p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Available to let</p>
          <p className="text-xs text-neutral-500">
            {from ? <>Not available since {fullDate(from)}{reason ? ` — ${reason}` : ''}. Its empty rooms aren’t counted in the void rate.</> : 'Yes. Switch this off while a house can’t be let (major works, subsidence) so its empty rooms don’t count as voids.'}
          </p>
        </div>
        {from
          ? <button type="button" onClick={() => save(false)} disabled={busy} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50">{busy ? 'Saving…' : 'Available again'}</button>
          : !editing && <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50">Mark not available</button>}
      </div>
      {editing && !from && (
        <div className="mt-md flex flex-wrap items-end gap-sm">
          <label className="text-xs text-neutral-600">Not available from<input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block rounded-lg border border-neutral-200 px-sm py-xs text-sm" /></label>
          <label className="min-w-[14rem] flex-1 text-xs text-neutral-600">Why<input value={why} onChange={e => setWhy(e.target.value)} placeholder="e.g. Subsidence repairs" className="mt-1 block w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm" /></label>
          <button type="button" onClick={() => save(true)} disabled={busy || !date} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => setEditing(false)} className="px-sm py-xs text-sm text-neutral-500">Cancel</button>
        </div>
      )}
      {err && <p className="mt-xs text-xs text-red-700">{err}</p>}
    </div>
  )
}

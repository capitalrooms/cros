'use client'

// Remove a property added by mistake (a duplicate). Only an empty property can go — the server refuses if anything
// is attached — and a copy of the record is kept in the audit log. Administrators only.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'

export default function RemoveProperty({ propertyId, code, name }: { propertyId: string; code: string | null; name?: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [others, setOthers] = useState<{ id: string; name: string }[]>([])
  const [intoId, setIntoId] = useState('')
  const label = String(name ?? code ?? 'this property').split('\n')[0]

  // Delete: one "are you sure", listing what goes with it (Harry, 15 Oct 2026)
  async function del() {
    setBusy(true); setErr('')
    const r = await adminFetch(`/api/admin/property-remove?id=${propertyId}`)
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Could not check'); return }
    const what = (d.linked ?? []).map((l: { table: string; count: number }) => `${l.count} ${l.table.replace(/_/g, ' ')}`).join(', ')
    if (!window.confirm(`Delete ${label}${what ? ` and everything attached to it — ${what}` : ''}? Documents and photos are deleted too. This can’t be undone.`)) return
    setBusy(true)
    const r2 = await adminFetch('/api/admin/property-remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId }) })
    const d2 = await r2.json().catch(() => ({}))
    setBusy(false)
    if (!r2.ok) { setErr(d2.error ?? 'Could not delete it'); return }
    router.push('/admin/active-rooms')
  }
  // A duplicate of a property you're keeping: move everything across, then remove this one
  async function loadOthers() {
    const { data } = await createClient().from('properties').select('id, name, is_demo').neq('id', propertyId).order('name')
    setOthers(((data ?? []) as any[]).filter(p => !p.is_demo).map(p => ({ id: p.id, name: String(p.name ?? '').replace(/\n/g, ', ') })))
  }
  async function merge() {
    const into = others.find(o => o.id === intoId)
    if (!into || !window.confirm(`Move everything on ${label} to “${into.name}”, then delete ${label}?`)) return
    setBusy(true); setErr('')
    const r = await adminFetch('/api/admin/property-remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId, action: 'merge', intoId }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Could not merge'); return }
    router.push(`/admin/properties/${intoId}`)
  }

  return (
    <div className="border-t border-neutral-200 pt-lg space-y-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Delete this property</p>
      <div className="flex flex-wrap items-center gap-sm">
        <button type="button" onClick={del} disabled={busy} className="rounded-lg border border-red-300 px-md py-xs text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">{busy ? 'Working…' : 'Delete property'}</button>
        {!others.length
          ? <button type="button" onClick={loadOthers} disabled={busy} className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">It’s a duplicate — merge it into another property…</button>
          : (
            <>
              <select value={intoId} onChange={e => setIntoId(e.target.value)} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm">
                <option value="">The property to keep…</option>
                {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button type="button" onClick={merge} disabled={busy || !intoId} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40">Merge and delete this one</button>
            </>
          )}
      </div>
      <p className="text-xs text-neutral-500">Delete removes the property and everything attached to it. Merge moves everything to the property you keep first.</p>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  )
}

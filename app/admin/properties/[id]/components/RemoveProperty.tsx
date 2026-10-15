'use client'

// Remove a property added by mistake (a duplicate). Only an empty property can go — the server refuses if anything
// is attached — and a copy of the record is kept in the audit log. Administrators only.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'

export default function RemoveProperty({ propertyId, code }: { propertyId: string; code: string | null }) {
  const router = useRouter()
  const [check, setCheck] = useState<{ canRemove: boolean; linked: { table: string; count: number }[] } | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // merge a duplicate into the property to keep (15 Oct 2026)
  const [others, setOthers] = useState<{ id: string; name: string }[]>([])
  const [intoId, setIntoId] = useState('')
  async function loadOthers() {
    const { data } = await createClient().from('properties').select('id, name, is_demo').neq('id', propertyId).order('name')
    setOthers(((data ?? []) as any[]).filter(p => !p.is_demo).map(p => ({ id: p.id, name: String(p.name ?? '').replace(/\n/g, ', ') })))
  }
  async function merge() {
    const into = others.find(o => o.id === intoId)
    if (!into || !window.confirm(`Move everything on this property to “${into.name}”, then remove this one? A copy of its record is kept in the audit log.`)) return
    setBusy(true); setErr('')
    const r = await adminFetch('/api/admin/property-remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId, confirm, action: 'merge', intoId }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Could not merge'); return }
    router.push(`/admin/properties/${intoId}`)
  }

  async function look() {
    setBusy(true); setErr('')
    const r = await adminFetch(`/api/admin/property-remove?id=${propertyId}`)
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Could not check'); return }
    setCheck(d)
  }
  async function remove() {
    if (!window.confirm('Remove this property for good? A copy of its record is kept in the audit log.')) return
    setBusy(true); setErr('')
    const r = await adminFetch('/api/admin/property-remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId, confirm }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Could not remove it'); return }
    router.push('/admin/active-rooms')
  }

  return (
    <div className="border-t border-neutral-200 pt-lg">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Remove this property</p>
      <p className="text-sm text-neutral-600">For a property added by mistake or twice. Only possible when nothing is attached to it — no rooms, tenancies, certificates, documents, jobs or money.</p>
      {!check ? (
        <button type="button" onClick={look} disabled={busy} className="mt-sm rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">{busy ? 'Checking…' : 'Check if it can be removed'}</button>
      ) : check.canRemove ? (
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <span className="text-sm text-neutral-700">Nothing is attached. Type <span className="font-mono font-semibold">{code}</span> to confirm:</span>
          <input value={confirm} onChange={e => setConfirm(e.target.value)} className="w-36 rounded-lg border border-neutral-300 px-sm py-xs font-mono text-sm" />
          <button type="button" onClick={remove} disabled={busy || confirm.trim().toUpperCase() !== String(code ?? '').toUpperCase()}
            className="rounded-lg border border-red-300 px-md py-xs text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">{busy ? 'Removing…' : 'Remove property'}</button>
        </div>
      ) : (
        <div className="mt-sm space-y-sm">
          <p className="text-sm text-neutral-700">It has {check.linked.map(l => `${l.count} ${l.table.replace(/_/g, ' ')}`).join(', ')}. If it’s a duplicate, merge it into the property to keep — everything moves across, then this one is removed.</p>
          {!others.length ? (
            <button type="button" onClick={loadOthers} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Merge into another property…</button>
          ) : (
            <div className="flex flex-wrap items-center gap-sm">
              <select value={intoId} onChange={e => setIntoId(e.target.value)} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm">
                <option value="">The property to keep…</option>
                {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <span className="text-sm text-neutral-700">Type <span className="font-mono font-semibold">{code}</span>:</span>
              <input value={confirm} onChange={e => setConfirm(e.target.value)} className="w-28 rounded-lg border border-neutral-300 px-sm py-xs font-mono text-sm" />
              <button type="button" onClick={merge} disabled={busy || !intoId || confirm.trim().toUpperCase() !== String(code ?? '').toUpperCase()}
                className="rounded-lg border border-red-300 px-md py-xs text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">{busy ? 'Merging…' : 'Merge and remove this one'}</button>
            </div>
          )}
        </div>
      )}
      {err && <p className="mt-xs text-sm text-red-700">{err}</p>}
    </div>
  )
}

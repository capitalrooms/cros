'use client'

// Remove a property added by mistake (a duplicate). Only an empty property can go — the server refuses if anything
// is attached — and a copy of the record is kept in the audit log. Administrators only.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminFetch } from '@/lib/adminFetch'

export default function RemoveProperty({ propertyId, code }: { propertyId: string; code: string | null }) {
  const router = useRouter()
  const [check, setCheck] = useState<{ canRemove: boolean; linked: { table: string; count: number }[] } | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

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
        <p className="mt-sm text-sm text-neutral-700">It can’t be removed — it has {check.linked.map(l => `${l.count} ${l.table.replace(/_/g, ' ')}`).join(', ')}.</p>
      )}
      {err && <p className="mt-xs text-sm text-red-700">{err}</p>}
    </div>
  )
}

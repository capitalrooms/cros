'use client'

// Delete a property: one "are you sure", listing what goes with it (Harry, 15 Oct 2026 — no merge option on screen;
// the merge still exists in /api/admin/property-remove for us to use). A copy of the record is kept in the audit log.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminFetch } from '@/lib/adminFetch'

export default function RemoveProperty({ propertyId, code, name }: { propertyId: string; code: string | null; name?: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
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
  return (
    <div className="border-t border-neutral-200 pt-lg space-y-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Delete this property</p>
      <div className="flex flex-wrap items-center gap-sm">
        <button type="button" onClick={del} disabled={busy} className="rounded-lg border border-red-300 px-md py-xs text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">{busy ? 'Working…' : 'Delete property'}</button>
      </div>
      <p className="text-xs text-neutral-500">Deletes the property and everything attached to it, including its documents and photos.</p>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  )
}

'use client'
// Tenant messages for one property (14 Nov 2026) — while automatic tenant messages are paused for CROS, switch them on
// for this property alone: approvals, bookings, "on our way", completions all go out here. /api/admin/comms-properties.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export default function TenantMessagesSwitch({ propertyId }: { propertyId: string }) {
  const [d, setD] = useState<{ master: boolean; on: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { adminFetch(`/api/admin/comms-properties?propertyId=${propertyId}`).then(r => r.ok ? r.json() : null).then(setD).catch(() => {}) }, [propertyId])
  if (!d) return null
  if (d.master) return <p className="rounded-xl border border-neutral-200 bg-white p-md text-sm text-neutral-700"><b>Tenant messages:</b> on for every property (Settings).</p>
  async function flip() {
    setBusy(true)
    const r = await adminFetch('/api/admin/comms-properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, on: !d!.on }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { alert(j.error || 'Didn’t save'); return }
    setD({ ...d!, on: j.on })
  }
  return (
    <div className={`flex flex-wrap items-center justify-between gap-sm rounded-xl border p-md ${d.on ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
      <p className="text-sm text-neutral-900"><b>Tenant messages here: {d.on ? 'ON' : 'paused'}</b><br /><span className="text-xs text-neutral-600">{d.on ? 'Tenants here get every update — approvals, bookings, “on our way”, finished jobs — while the rest of CROS stays paused.' : 'Automatic messages are paused for CROS. Switch them on for this property alone.'}</span></p>
      <button type="button" disabled={busy} onClick={flip} className={`rounded-full px-md py-sm text-sm font-bold ${d.on ? 'border border-neutral-400 bg-white text-neutral-900' : 'bg-emerald-700 text-white'}`}>{busy ? '…' : d.on ? 'Pause here' : 'Switch on here'}</button>
    </div>
  )
}

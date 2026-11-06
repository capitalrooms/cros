'use client'

// Property › Maintenance › Upkeep (6 Nov 2026 — lib/property/upkeep, components/UpkeepPanel).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import UpkeepPanel, { type UpkeepData } from '@/components/UpkeepPanel'

export default function UpkeepTab({ propertyId }: { propertyId: string }) {
  const [d, setD] = useState<UpkeepData | null>(null)
  const load = () => adminFetch(`/api/admin/upkeep?propertyId=${propertyId}`).then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { load() }, [propertyId])   // eslint-disable-line react-hooks/exhaustive-deps
  // set how a job naming several areas is divided — returns an error to show, or null
  const onSplit = async (line: any, splits: { area: string; amount: number }[]) => {
    const r = await adminFetch('/api/admin/upkeep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: line.source, lineId: line.id, splits }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return j.error ?? 'Couldn’t save'
    await load(); return null
  }
  return d ? <UpkeepPanel data={d} onSplit={onSplit} /> : <p className="text-sm text-neutral-400">Loading…</p>
}

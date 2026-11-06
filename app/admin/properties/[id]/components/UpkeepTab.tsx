'use client'

// Property › Maintenance › Upkeep (6 Nov 2026 — lib/property/upkeep, components/UpkeepPanel).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import UpkeepPanel, { type UpkeepData } from '@/components/UpkeepPanel'

export default function UpkeepTab({ propertyId }: { propertyId: string }) {
  const [d, setD] = useState<UpkeepData | null>(null)
  useEffect(() => { adminFetch(`/api/admin/upkeep?propertyId=${propertyId}`).then(r => r.json()).then(setD).catch(() => {}) }, [propertyId])
  return d ? <UpkeepPanel data={d} /> : <p className="text-sm text-neutral-400">Loading…</p>
}

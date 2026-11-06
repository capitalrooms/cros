'use client'

// Property › Maintenance › Upkeep (6 Nov 2026 — lib/property/upkeep, components/UpkeepPanel).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import UpkeepPanel, { type UpkeepData } from '@/components/UpkeepPanel'

export default function UpkeepTab({ propertyId }: { propertyId: string }) {
  const [d, setD] = useState<(UpkeepData & { undated?: any[] }) | null>(null)
  const [years, setYears] = useState<Record<string, string>>({})
  const load = () => adminFetch(`/api/admin/upkeep?propertyId=${propertyId}`).then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { load() }, [propertyId])   // eslint-disable-line react-hooks/exhaustive-deps
  // set how a job naming several areas is divided — returns an error to show, or null
  const onSplit = async (line: any, splits: { area: string; amount: number }[]) => {
    const r = await adminFetch('/api/admin/upkeep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: line.source, lineId: line.id, splits }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return j.error ?? 'Couldn’t save'
    await load(); return null
  }
  const onSuggest = async (line: any) => {
    const r = await adminFetch('/api/admin/upkeep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'suggest', source: line.source, lineId: line.id, areas: line.areas }) })
    const j = await r.json().catch(() => ({}))
    return r.ok ? j : (j.error ?? 'Couldn’t suggest a split')
  }
  const dateItem = async (id: string, year: string) => {
    await adminFetch('/api/admin/upkeep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'date_item', id, year }) })
    await load()
  }
  return d ? <div className="space-y-md">
    {(d.undated ?? []).length > 0 && (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-md">
        <p className="text-sm font-semibold text-amber-900">When were these bought? · {d.undated!.length}</p>
        <p className="text-xs text-amber-900/80">From walk-round photos — no matching expense was found. A rough year is enough; it’s how old each thing is.</p>
        <ul className="mt-xs divide-y divide-amber-200/60 text-xs">
          {d.undated!.map((it: any) => (
            <li key={it.id} className="flex flex-wrap items-center justify-between gap-sm py-xs">
              <span className="min-w-0"><span className="font-semibold">{it.item}</span> · {it.description} <span className="text-amber-900/70">— {it.rooms?.name ?? it.area}{it.added_by ? `, photo by ${String(it.added_by).split('@')[0]}` : ''}</span></span>
              <span className="flex items-center gap-xs">
                <input className="w-16 rounded border border-amber-300 px-xs py-0.5" placeholder="Year" value={years[it.id] ?? ''} onChange={e => setYears({ ...years, [it.id]: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                <button type="button" disabled={(years[it.id] ?? '').length !== 4} onClick={() => dateItem(it.id, years[it.id])} className="rounded-lg border border-amber-300 bg-white px-sm py-0.5 font-semibold text-amber-900 disabled:opacity-40">Save</button>
                <button type="button" onClick={() => dateItem(it.id, 'unknown')} className="text-amber-900/70 underline">Don’t know</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}
    <UpkeepPanel data={d} onSplit={onSplit} onSuggest={onSuggest} />
  </div> : <p className="text-sm text-neutral-400">Loading…</p>
}

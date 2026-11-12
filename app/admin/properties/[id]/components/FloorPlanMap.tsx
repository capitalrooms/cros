'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useStoredUrl } from '@/lib/files/useStoredFile'

interface DetectedRoom {
  label: string
  area_sqm: number
  dimensions: string
}

interface Row {
  label: string
  dimensions: string
  area: string        // editable
  targetRoomId: string // '' = skip
  ensuite: boolean
}

/**
 * Review + confirm step after an AI floor-plan scan: map each detected room to
 * one of the property's units and confirm the area, then write room_size.
 */
export default function FloorPlanMap({
  propertyId,
  detected,
  notes,
  bathroomsCount,
  ensuiteLabels,
  layoutNotes,
  existingNotes,
  planUrl,
  planIsPdf,
  onClose,
  onApplied,
}: {
  propertyId: string
  detected: DetectedRoom[]
  notes?: string
  bathroomsCount?: number
  ensuiteLabels?: string[]
  layoutNotes?: string
  existingNotes?: string
  /** the floor plan itself (a stored file or a local preview), shown beside the sizes so they can be checked (12 Nov 2026) */
  planUrl?: string
  planIsPdf?: boolean
  onClose: () => void
  onApplied: (msg: string) => void
}) {
  const supabase = createClient()
  const storedLink = useStoredUrl(planUrl && !planUrl.startsWith('blob:') ? planUrl : '')
  const planLink = planUrl?.startsWith('blob:') ? planUrl : storedLink
  const [rooms, setRooms] = useState<Array<{ id: string; name: string; room_size: number | null }>>([])
  const [rows, setRows] = useState<Row[]>([])
  const [bathrooms, setBathrooms] = useState(bathroomsCount ? String(bathroomsCount) : '')
  const ensuiteSummary = (ensuiteLabels && ensuiteLabels.length) ? `Ensuite rooms: ${ensuiteLabels.join(', ')}.` : ''
  const [propertyNotes, setPropertyNotes] = useState([existingNotes, layoutNotes, ensuiteSummary].filter(Boolean).join('\n'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('rooms')
        .select('id, name, room_size')
        .eq('property_id', propertyId)
        .order('name')
      const rms = (data || []) as Array<{ id: string; name: string; room_size: number | null }>
      setRooms(rms)
      // Default mapping (12 Nov 2026): same name ("Room 1" ↔ "Room 1"), then same number on a bedroom-type label
      // ("Bedroom 2" ↔ "Room 2"); kitchens, lounges and bathrooms aren't let rooms, so they start unmapped.
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
      const numOf = (x: string) => x.match(/\d+/)?.[0] ?? ({ one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' } as Record<string, string>)[x.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/)?.[1] ?? ''] ?? ''
      const taken = new Set<string>()
      const pick = (label: string) => {
        const byName = rms.find(r => !taken.has(r.id) && norm(r.name) === norm(label))
        const bedroomish = /\b(room|bed|bedroom|studio|unit|flat)\b/i.test(label) && !/bath|shower|wc|kitchen|living|lounge|dining|utility|store|hall/i.test(label)
        const byNum = !byName && bedroomish && numOf(label) ? rms.find(r => !taken.has(r.id) && numOf(r.name) === numOf(label)) : undefined
        const hit = byName ?? byNum
        if (hit) taken.add(hit.id)
        return hit?.id ?? ''
      }
      setRows(
        detected.map((d) => ({
          label: d.label,
          dimensions: d.dimensions,
          area: d.area_sqm ? String(d.area_sqm) : '',
          targetRoomId: pick(d.label),
          ensuite: (ensuiteLabels || []).some((l) => l.toLowerCase() === d.label.toLowerCase()),
        }))
      )
    }
    load()
  }, [propertyId]) // eslint-disable-line react-hooks/exhaustive-deps

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function handleApply() {
    const toApply = rows.filter((r) => r.targetRoomId) // any mapped room (size and/or ensuite)
    const ids = toApply.map((r) => r.targetRoomId)
    if (new Set(ids).size !== ids.length) { setError('Each unit can only be mapped once'); return }

    const propUpdate: Record<string, unknown> = {}
    if (bathrooms && Number(bathrooms) >= 0) propUpdate.bathrooms = Number(bathrooms)
    if (propertyNotes.trim() !== (existingNotes || '').trim()) propUpdate.property_notes = propertyNotes.trim() || null

    if (toApply.length === 0 && Object.keys(propUpdate).length === 0) {
      setError('Nothing to save — map a room to a unit, or edit the bathrooms/notes')
      return
    }
    setSaving(true)
    setError('')
    try {
      for (const r of toApply) {
        const upd: Record<string, unknown> = { has_ensuite: r.ensuite }
        if (r.area && Number(r.area) > 0) upd.room_size = Number(r.area)
        const { error: e } = await supabase.from('rooms').update(upd).eq('id', r.targetRoomId)
        if (e) throw new Error(e.message)
      }
      if (Object.keys(propUpdate).length) {
        const { error: e } = await supabase.from('properties').update(propUpdate).eq('id', propertyId)
        if (e) throw new Error(e.message)
      }
      const bits = []
      if (toApply.length) bits.push(`${toApply.length} unit size${toApply.length === 1 ? '' : 's'}`)
      if ('bathrooms' in propUpdate) bits.push('bathrooms')
      if ('property_notes' in propUpdate) bits.push('property notes')
      onApplied(`Saved from floor plan: ${bits.join(', ')}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => !saving && onClose()}>
      <div className={`w-full ${planUrl ? 'max-w-5xl' : 'max-w-xl'} max-h-[90dvh] overflow-y-auto rounded-2xl bg-neutral-900 border border-neutral-700 p-lg shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-lg font-bold text-white">Room sizes from the floor plan</h3>
          <button onClick={() => !saving && onClose()} className="text-neutral-500 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className={planUrl ? 'grid gap-lg md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start' : ''}>
        {planUrl && (
          <div className="md:sticky md:top-0 rounded-lg overflow-hidden bg-white border border-neutral-700">
            {!planLink ? <p className="p-lg text-sm text-neutral-500">Opening the floor plan…</p>
              : planIsPdf ? <iframe src={planLink} title="Floor plan" className="w-full h-[60vh] md:h-[70vh] bg-white" />
              : <a href={planLink} target="_blank" rel="noreferrer" title="Open full size"><img src={planLink} alt="Floor plan" className="w-full h-auto block" /></a>}
          </div>
        )}
        <div>

        {detected.length === 0 ? (
          <p className="text-sm text-neutral-400">
            The AI couldn&apos;t read any room sizes from this floor plan (it may not show dimensions or areas). The floor plan has still been uploaded.
          </p>
        ) : (
          <>
            <p className="text-sm text-neutral-400 mb-lg">
              Check each room found on the plan is matched to the right unit and the size is right, then apply. Sizes save to each unit and show on its dashboard.
            </p>
            <div className="space-y-md">
              {rows.map((r, i) => (
                <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-850 p-md">
                  <div className="flex items-center justify-between gap-md">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{r.label || 'Unlabelled'}</p>
                      {r.dimensions && <p className="text-xs text-neutral-500">{r.dimensions}</p>}
                    </div>
                  </div>
                  <div className="mt-sm grid grid-cols-[1fr_90px] gap-sm items-end">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-xs">Maps to unit</label>
                      <select
                        value={r.targetRoomId}
                        onChange={(e) => update(i, { targetRoomId: e.target.value })}
                        className="w-full rounded border border-neutral-600 bg-neutral-800 px-sm py-xs text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Skip</option>
                        {rooms.map((rm) => (
                          <option key={rm.id} value={rm.id}>
                            {rm.name}{rm.room_size ? ` (now ${rm.room_size} m²)` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-xs">Area m²</label>
                      <input
                        value={r.area}
                        onChange={(e) => update(i, { area: e.target.value.replace(/[^0-9.]/g, '') })}
                        placeholder="—"
                        className="w-full rounded border border-neutral-600 bg-neutral-800 px-sm py-xs text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <label className="mt-sm flex items-center gap-sm text-xs text-neutral-300 cursor-pointer">
                    <input type="checkbox" checked={r.ensuite} onChange={(e) => update(i, { ensuite: e.target.checked })} className="h-3.5 w-3.5" />
                    Has ensuite
                  </label>
                </div>
              ))}
            </div>
            {notes && <p className="mt-md text-xs text-neutral-500 italic">AI notes: {notes}</p>}
          </>
        )}

        {/* Property facts (fact sheet) — bathrooms + layout notes, editable */}
        <div className="mt-lg border-t border-neutral-800 pt-lg">
          <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-md">Property facts</h4>
          <div className="grid grid-cols-[110px_1fr] gap-md items-start">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-xs">Bathrooms</label>
              <input
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="—"
                className="w-full rounded border border-neutral-600 bg-neutral-800 px-sm py-xs text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-xs">Property notes (layout, ensuites…)</label>
              <textarea
                value={propertyNotes}
                onChange={(e) => setPropertyNotes(e.target.value)}
                rows={3}
                className="w-full rounded border border-neutral-600 bg-neutral-800 px-sm py-xs text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {error && <p className="mt-md text-sm text-red-400">{error}</p>}

        <div className="mt-lg flex gap-md">
          <button onClick={() => !saving && onClose()} className="flex-1 rounded-lg border border-neutral-700 px-lg py-sm text-sm font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50" disabled={saving}>
            Cancel
          </button>
          <button onClick={handleApply} disabled={saving} className="flex-1 rounded-lg bg-blue-600 px-lg py-sm text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}

'use client'
// Paste the words from a floor plan or listing ("ROOM 1 8SQM", "Bedroom 2 3.2m x 2.9m"…) → room sizes to confirm,
// and anything else useful kept in the house notes (12 Nov 2026). lib/floorplan/parseText — plain rules, no AI.
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { parseFloorPlanText, type TextPlan } from '@/lib/floorplan/parseText'
import FloorPlanMap from './FloorPlanMap'

export default function FloorPlanText({ propertyId, onApplied, className }: { propertyId: string; onApplied?: (msg: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<(TextPlan & { existing: string }) | null>(null)
  const [msg, setMsg] = useState('')

  async function read() {
    const p = parseFloorPlanText(text)
    if (!p.detected_rooms.length && !p.notes.length) { setMsg('Nothing found — paste lines like “Room 1 8 sqm” or “Bedroom 2 3.2m x 2.9m”.'); return }
    const { data } = await createClient().from('properties').select('property_notes').eq('id', propertyId).maybeSingle()
    setPlan({ ...p, existing: (data as any)?.property_notes || '' }); setOpen(false); setMsg('')
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setMsg('') }} className={className ?? 'rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-800 hover:bg-neutral-100'}>Paste room sizes</button>
      {msg && !open && <p className="mt-xs text-xs text-emerald-700">{msg}</p>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900">Paste room sizes</h3>
            <p className="mt-xs text-sm text-neutral-500">Copy the words from the floor plan or listing — e.g. “ROOM 1 8SQM”, “Bedroom 2 3.20m x 2.90m”, “Kitchen 140 sq ft”. Sizes go to the matching rooms for you to check; anything else useful is kept in the house notes.</p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={8} autoFocus placeholder={'Room 1 8 sqm\nRoom 2 3.2m x 2.9m\nTotal area 85 sq m'} className="mt-md w-full rounded-lg border border-neutral-300 p-sm font-mono text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
            {msg && <p className="mt-xs text-sm text-amber-700">{msg}</p>}
            <div className="mt-md flex gap-sm">
              <button type="button" onClick={read} disabled={!text.trim()} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white disabled:opacity-40">Read the sizes</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-800">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {plan && (
        <FloorPlanMap
          propertyId={propertyId}
          detected={plan.detected_rooms}
          notes={plan.total_sqm ? `Total area ${plan.total_sqm} m².` : ''}
          bathroomsCount={plan.bathrooms_count}
          ensuiteLabels={plan.ensuite_room_labels}
          layoutNotes={plan.notes.filter(n => !(plan.existing || '').includes(n)).join('\n')}
          existingNotes={plan.existing}
          onClose={() => setPlan(null)}
          onApplied={m => { setPlan(null); setText(''); setMsg(m); onApplied?.(m) }}
        />
      )}
    </>
  )
}

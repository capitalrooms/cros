'use client'
// Fire evacuation plan (17 Nov 2026, Harry): the plan as text on the property — typed, or filled from a plan on file —
// printed as a standard landscape PDF with the logo (the house's own floor-plan drawing beside it if there's one as an
// image), and shown to tenants as a simple card in their app. /api/admin/fire-plan · lib/firePlan.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Plan = { address: string | null; onDiscovery: string[]; escapeRoutes: string[]; callForHelp: string[]; evacuate: string[]; assemblyPoint: string | null; doNot: string[]; other: string[] }
const FIELDS: [keyof Plan, string, string][] = [
  ['escapeRoutes', 'Escape routes', 'Through the front door\nThrough the kitchen door at the back'],
  ['onDiscovery', 'If you discover a fire or hear the alarm', 'Raise the alarm — shout “Fire!”\nClose the door behind you'],
  ['callForHelp', 'Call for help', 'Dial 999 and ask for the fire service — give the address\nThen call Capital Rooms on 0207 112 9163'],
  ['evacuate', 'Evacuate the building', 'Leave calmly; help anyone who needs it\nLeave your belongings behind'],
  ['doNot', 'Do not', 'Go back in for anything\nUse a lift'],
  ['other', 'Also', 'Fire blanket in the kitchen'],
]
const lines = (v: string[] | undefined) => (v ?? []).join('\n')

export default function FirePlanCard({ propertyId }: { propertyId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [docs, setDocs] = useState<{ id: string; file_name: string; document_type: string }[]>([])
  const [drawing, setDrawing] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [setup, setSetup] = useState(false)
  useEffect(() => { adminFetch(`/api/admin/fire-plan?propertyId=${propertyId}`).then(r => r.json()).then(d => { setPlan(d.plan); setDocs(d.docs ?? []); setSetup(!!d.setupNeeded) }).catch(() => {}) }, [propertyId])
  if (!plan) return null
  const filled = FIELDS.some(([k]) => (plan[k] as string[]).length) || !!plan.assemblyPoint
  const set = (k: keyof Plan, v: string) => setPlan({ ...plan, [k]: k === 'assemblyPoint' || k === 'address' ? v : v.split('\n') } as Plan)
  const images = docs.filter(d => /\.(png|jpe?g|webp)$/i.test(d.file_name))

  async function save() {
    setBusy('save'); setMsg('')
    const r = await adminFetch('/api/admin/fire-plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, plan }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(''); setMsg(r?.ok ? 'Saved — tenants see it in their app.' : (d as any).error || 'Not saved')
  }
  async function fill(docId: string) {
    setBusy('fill'); setMsg('')
    const r = await adminFetch('/api/admin/fire-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, docId }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy('')
    if (!r?.ok) { setMsg((d as any).error || 'Couldn’t read it'); return }
    setPlan((d as any).plan); setOpen(true); setMsg('Filled from the file — check it, then Save.')
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <p className="text-sm font-bold text-neutral-900">Fire evacuation plan</p>
          <p className="text-xs text-neutral-500">{filled ? 'Printable plan and the tenants’ in-app card are made from this.' : 'Not written yet — type it, or fill it from a plan on file.'}</p>
        </div>
        <div className="flex flex-wrap gap-xs">
          {filled && <a href={`/api/admin/fire-plan?propertyId=${propertyId}&pdf=1${drawing ? `&drawing=${drawing}` : ''}`} onClick={async e => { e.preventDefault(); const r = await adminFetch(`/api/admin/fire-plan?propertyId=${propertyId}&pdf=1${drawing ? `&drawing=${drawing}` : ''}`); const b = await r.blob(); window.open(URL.createObjectURL(b), '_blank') }} className="rounded-lg border border-neutral-300 px-sm py-xs text-xs font-semibold">Print / PDF</a>}
          <button type="button" onClick={() => setOpen(o => !o)} className="rounded-lg bg-neutral-900 px-sm py-xs text-xs font-bold text-white">{open ? 'Close' : filled ? 'Edit' : 'Write it'}</button>
        </div>
      </div>
      {setup && <p className="mt-sm text-xs text-amber-800">Run migration 292 to save fire plans.</p>}
      {open && (
        <div className="mt-md space-y-sm">
          {!!docs.length && (
            <div className="flex flex-wrap items-center gap-xs text-xs">
              <span className="text-neutral-500">Fill from a plan on file:</span>
              {docs.filter(d => d.document_type === 'evacuation_plan').slice(0, 4).map(d => <button key={d.id} type="button" disabled={!!busy} onClick={() => fill(d.id)} className="rounded-full border border-neutral-300 px-sm py-0.5">{busy === 'fill' ? 'Reading…' : d.file_name}</button>)}
            </div>
          )}
          {FIELDS.map(([k, label, ph]) => (
            <label key={k} className="block text-xs font-semibold text-neutral-700">{label} <span className="font-normal text-neutral-400">— one per line</span>
              <textarea rows={Math.max(2, (plan[k] as string[]).length + 1)} value={lines(plan[k] as string[])} onChange={e => set(k, e.target.value)} placeholder={ph} className="mt-1 w-full rounded-lg border border-neutral-300 p-sm text-sm font-normal" />
            </label>
          ))}
          <label className="block text-xs font-semibold text-neutral-700">Assembly point
            <input value={plan.assemblyPoint ?? ''} onChange={e => set('assemblyPoint', e.target.value)} placeholder="On the pavement opposite the house" className="mt-1 w-full rounded-lg border border-neutral-300 p-sm text-sm font-normal" />
          </label>
          {!!images.length && (
            <label className="block text-xs font-semibold text-neutral-700">Floor-plan drawing beside it on the printout (optional)
              <select value={drawing} onChange={e => setDrawing(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 p-sm text-sm font-normal"><option value="">None</option>{images.map(d => <option key={d.id} value={d.id}>{d.file_name}</option>)}</select>
            </label>
          )}
          <button type="button" disabled={!!busy} onClick={save} className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      )}
      {msg && <p className="mt-sm text-xs font-semibold text-neutral-700">{msg}</p>}
    </div>
  )
}

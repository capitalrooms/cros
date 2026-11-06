'use client'

// The house's appliances (6 Nov 2026 — migration 268, lib/house/snap): what, make and model, where, how old (from the
// expense it was bought with), and whether tenants see it. Added from photos (/admin/house-snap); tidied here.
// Each has a care guide researched from the manufacturer's pages (migration 269, lib/house/careGuide): checked here,
// edited if needed and approved — only then do tenants and the fault-reporting AI see it.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

const KINDS: Record<string, string> = {
  washing_machine: 'Washing machine', washer_dryer: 'Washer-dryer', tumble_dryer: 'Tumble dryer', dishwasher: 'Dishwasher',
  fridge_freezer: 'Fridge freezer', fridge: 'Fridge', freezer: 'Freezer', oven: 'Oven', hob: 'Hob', cooker: 'Cooker',
  extractor: 'Extractor hood', microwave: 'Microwave', boiler: 'Boiler', water_heater: 'Water heater', shower: 'Electric shower', heater: 'Heater', other: 'Appliance',
}
const age = (iso: string | null) => {
  if (!iso) return null
  const m = Math.round((Date.now() - Date.parse(`${iso}T12:00:00Z`)) / (30.44 * 86_400_000))
  return m < 12 ? `${m} month${m === 1 ? '' : 's'} old` : `${(m / 12).toFixed(m < 36 ? 1 : 0)} years old`
}

export default function AppliancesSection({ propertyId }: { propertyId: string }) {
  const [d, setD] = useState<{ ready: boolean; appliances: any[] } | null>(null)
  const load = () => adminFetch(`/api/admin/appliances?propertyId=${propertyId}`).then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { load() }, [propertyId])   // eslint-disable-line react-hooks/exhaustive-deps
  const patch = async (id: string, body: Record<string, unknown>) => { await adminFetch('/api/admin/appliances', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) }); load() }
  const [review, setReview] = useState<any | null>(null)   // the appliance whose care guide is open
  // while a guide is being researched, look again every 20 seconds
  useEffect(() => {
    if (!d?.appliances?.some(a => a.guide_status === 'researching')) return
    const t = setTimeout(load, 20000)
    return () => clearTimeout(t)
  }, [d])   // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (id: string) => { if (!confirm('Take this off the house’s appliances?')) return; await adminFetch(`/api/admin/appliances?id=${id}`, { method: 'DELETE' }); load() }

  return (
    <section className="border-t border-neutral-100 pt-2xl">
      <div className="mb-xs flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-base font-bold text-neutral-900">Appliances</h3>
        <Link href={`/admin/house-snap?propertyId=${propertyId}`} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700">Add from photos</Link>
      </div>
      <p className="mb-md text-sm text-neutral-500">Tenants see these in the app, and pick one when they report a fault — so the troubleshooting and the job name the exact model. Photos of labels, WiFi screenshots, meters and the fuse box can all go in through “Add from photos”.</p>
      {!d ? <p className="text-sm text-neutral-400">Loading…</p> : !d.ready ? <p className="text-sm text-amber-800">Run migration 268 in Supabase to record appliances.</p>
        : !d.appliances.length ? <p className="text-sm text-neutral-500">None recorded yet.</p> : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {d.appliances.map(a => (
            <li key={a.id} className="flex flex-wrap items-center gap-sm px-md py-sm text-sm">
              <span className="min-w-[220px] flex-1">
                <span className="font-semibold text-neutral-900">{KINDS[a.kind] ?? 'Appliance'}</span> <span className="text-neutral-700">{[a.brand, a.model].filter(Boolean).join(' ')}</span>
                <span className="block text-xs text-neutral-500">{[a.location, a.bought_on ? `bought ${new Date(`${a.bought_on}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} · ${age(a.bought_on)}` : 'age not known', a.bought_note].filter(Boolean).join(' · ')}</span>
              </span>
              <input defaultValue={a.location ?? ''} placeholder="Where" onBlur={e => e.target.value !== (a.location ?? '') && patch(a.id, { location: e.target.value })} className="w-32 rounded-lg border border-neutral-300 px-sm py-0.5 text-xs" />
              <label className="flex items-center gap-xs text-xs"><input type="checkbox" checked={a.visible_to_tenants} onChange={() => patch(a.id, { visible: !a.visible_to_tenants })} /> Tenants see it</label>
              {a.guide_status === 'researching' ? <span className="rounded-full bg-neutral-100 px-sm py-[2px] text-[11px] font-semibold text-neutral-600">Researching care guide…</span>
                : a.guide_status === 'ready' ? <button type="button" onClick={() => setReview({ ...a, guide: JSON.parse(JSON.stringify(a.guide)) })} className="rounded-full bg-amber-100 px-sm py-[2px] text-[11px] font-bold text-amber-900 hover:bg-amber-200">Care guide ready — check it</button>
                : a.guide_status === 'approved' ? <button type="button" onClick={() => setReview({ ...a, guide: JSON.parse(JSON.stringify(a.guide)) })} className="rounded-full bg-emerald-50 px-sm py-[2px] text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100">Care guide ✓</button>
                : <button type="button" onClick={() => patch(a.id, { guideAction: 'research' })} className="text-xs font-semibold text-blue-700 hover:underline">{a.guide_status === 'not_found' ? 'Nothing found — try again' : a.guide_status === 'failed' ? 'Research failed — try again' : 'Find care guide'}</button>}
              <button type="button" onClick={() => remove(a.id)} className="text-xs font-semibold text-red-700 hover:underline">Remove</button>
            </li>
          ))}
        </ul>
      )}
      {review && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-lg" onClick={() => setReview(null)}>
          <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-neutral-200 px-lg py-md">
              <h3 className="text-lg font-bold text-neutral-900">Care guide · {review.guide?.product}</h3>
              <p className="mt-xs text-xs text-neutral-500">Researched from the manufacturer’s information — check it reads right for this house, edit anything, then approve. Tenants see it in the app, and the AI uses it when they report a fault.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-md overflow-y-auto px-lg py-md text-sm">
              <label className="block"><span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Summary</span>
                <textarea rows={3} className="mt-1 w-full rounded-lg border border-neutral-300 px-sm py-xs" value={review.guide.summary} onChange={e => setReview({ ...review, guide: { ...review.guide, summary: e.target.value } })} /></label>
              {review.guide.sections.map((sec: any, i: number) => (
                <label key={i} className="block"><span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{sec.title}</span>
                  <textarea rows={Math.min(8, sec.steps.length + 1)} className="mt-1 w-full rounded-lg border border-neutral-300 px-sm py-xs" value={sec.steps.join('\n')}
                    onChange={e => setReview({ ...review, guide: { ...review.guide, sections: review.guide.sections.map((x: any, j: number) => j === i ? { ...x, steps: e.target.value.split('\n').filter((t: string) => t.trim()) } : x) } })} /></label>
              ))}
              {review.guide.errorCodes?.length > 0 && <div><p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Error codes</p>
                <ul className="mt-1 space-y-0.5">{review.guide.errorCodes.map((e: any) => <li key={e.code}><strong>{e.code}</strong> — {e.meaning}. {e.whatToDo}</li>)}</ul></div>}
              {review.guide.reportIf?.length > 0 && <div><p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Report it to us if</p>
                <ul className="mt-1 list-disc pl-lg">{review.guide.reportIf.map((t: string) => <li key={t}>{t}</li>)}</ul></div>}
              <div><p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Sources</p>
                <ul className="mt-1 space-y-0.5 text-xs">{review.guide.manualUrl && <li><a href={review.guide.manualUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">The manual ↗</a></li>}
                  {review.guide.sources.map((x: any) => <li key={x.url}><a href={x.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{x.title} ↗</a></li>)}</ul></div>
            </div>
            <div className="flex flex-wrap items-center gap-sm border-t border-neutral-200 px-lg py-md">
              <button type="button" onClick={async () => { await patch(review.id, { guideAction: 'approve', guide: review.guide }); setReview(null) }} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700">{review.guide_status === 'approved' ? 'Save changes' : 'Approve for tenants'}</button>
              <button type="button" onClick={async () => { if (confirm('Throw this guide away?')) { await patch(review.id, { guideAction: 'discard' }); setReview(null) } }} className="text-sm font-semibold text-red-700 underline">Discard</button>
              <button type="button" onClick={() => setReview(null)} className="text-sm font-semibold text-neutral-600 underline">Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

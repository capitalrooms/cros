'use client'

// The house's appliances (6 Nov 2026 — migration 268, lib/house/snap): what, make and model, where, how old (from the
// expense it was bought with), and whether tenants see it. Added from photos (/admin/house-snap); tidied here.
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
              <button type="button" onClick={() => remove(a.id)} className="text-xs font-semibold text-red-700 hover:underline">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

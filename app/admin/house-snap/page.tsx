'use client'

// Add from photos (6 Nov 2026, Harry: "upload a screenshot like this into CROS and it says which property is this for …
// I could upload 20 photos … I want to approve and then it goes to the admin info … and also forms part of the tenant
// info about the property"). Drop in screenshots and photos — the WiFi settings, an appliance's label, a meter, the fuse
// box — AI reads each (lib/house/snap), suggests the house, the office checks, ticks and approves. Photos are shrunk on
// the device and never kept: only what's read from them. Appliances can be matched to the expense they were bought
// with, so their age is known.
import { use, useEffect, useMemo, useState } from 'react'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'

const KINDS: Record<string, string> = {
  washing_machine: 'Washing machine', washer_dryer: 'Washer-dryer', tumble_dryer: 'Tumble dryer', dishwasher: 'Dishwasher',
  fridge_freezer: 'Fridge freezer', fridge: 'Fridge', freezer: 'Freezer', oven: 'Oven', hob: 'Hob', cooker: 'Cooker',
  extractor: 'Extractor hood', microwave: 'Microwave', boiler: 'Boiler', water_heater: 'Water heater', shower: 'Electric shower', heater: 'Heater', other: 'Other appliance',
}
const WHAT: Record<string, string> = { wifi: 'WiFi', appliance: 'Appliance', meter: 'Meter', fuse_box: 'Fuse box', stopcock: 'Stopcock', smoke_alarm: 'Smoke alarms', bins: 'Bins', other: 'Note', unreadable: 'Couldn’t read' }

type Match = { source: 'expense' | 'statement'; id: string; date: string; amount: number; description: string }
type Item = { key: string; name: string; status: 'reading' | 'ready' | 'error'; error?: string; snap?: any; suggestion?: { propertyId: string; why: string } | null
  include: boolean; visible: boolean; location: string; matches?: Match[]; bought?: string }   // bought: a match id, '' = none

const card = 'rounded-2xl border border-neutral-200 bg-white p-md'
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
const label = 'block text-[11px] font-bold uppercase tracking-wider text-neutral-500'
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.88).split(',')[1]
  } finally { URL.revokeObjectURL(url) }
}

function SnapPage({ initialHouse }: { initialHouse: string }) {
  const [houses, setHouses] = useState<{ id: string; name: string }[]>([])
  const [house, setHouse] = useState(initialHouse)
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    createClient().from('properties').select('id, name, is_demo').order('name').then(({ data }) =>
      setHouses(((data ?? []) as any[]).filter(p => !p.is_demo).map(p => ({ id: p.id, name: String(p.name ?? '').split('\n')[0] }))))
  }, [])
  const set = (key: string, patch: Partial<Item>) => setItems(xs => xs.map(x => x.key === key ? { ...x, ...patch } : x))
  const setSnap = (key: string, path: string, v: string) => setItems(xs => xs.map(x => {
    if (x.key !== key) return x
    const [a, b2] = path.split('.')
    return { ...x, snap: { ...x.snap, [a]: { ...(x.snap?.[a] ?? {}), [b2]: v } } }
  }))

  async function add(files: FileList | null) {
    if (!files?.length) return
    setDone(null); setErr('')
    const list = Array.from(files).slice(0, 40).map(f => ({ f, key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }))
    setItems(xs => [...xs, ...list.map(({ f, key }) => ({ key, name: f.name, status: 'reading' as const, include: true, visible: true, location: '' }))])
    // two at a time — quick without flooding the AI
    let i = 0
    const next = async (): Promise<void> => {
      const job = list[i++]; if (!job) return
      try {
        const image = await shrink(job.f)
        const r = await adminFetch('/api/admin/house-snap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', image, mime: 'image/jpeg' }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? 'Couldn’t read it')
        const unreadable = j.snap?.kind === 'unreadable'
        set(job.key, { status: 'ready', snap: j.snap, suggestion: j.suggestion, include: !unreadable, visible: !['meter'].includes(j.snap?.kind) })
        if (j.suggestion?.propertyId) setHouse(h => h || j.suggestion.propertyId)
      } catch (e: any) { set(job.key, { status: 'error', error: e?.message ?? 'Couldn’t read it', include: false }) }
      return next()
    }
    await Promise.all([next(), next()])
  }

  // with a house chosen, look for when each appliance was bought
  const applianceKeys = items.filter(x => x.snap?.kind === 'appliance').map(x => `${x.key}:${x.snap.appliance?.kind}:${x.snap.appliance?.brand}:${x.snap.appliance?.model}`).join('|')
  useEffect(() => {
    if (!house) return
    for (const x of items.filter(x => x.snap?.kind === 'appliance')) {
      adminFetch('/api/admin/house-snap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'matches', propertyId: house, appliance: x.snap.appliance }) })
        .then(r => r.json()).then(j => set(x.key, { matches: j.matches ?? [], bought: x.bought ?? '' })).catch(() => {})
    }
  }, [house, applianceKeys])   // eslint-disable-line react-hooks/exhaustive-deps

  const elsewhere = useMemo(() => items.filter(x => x.suggestion && house && x.suggestion.propertyId !== house), [items, house])
  const ticked = items.filter(x => x.include && x.status === 'ready' && x.snap?.kind !== 'unreadable')

  async function approve() {
    if (!house) { setErr('Choose the house first'); return }
    setBusy(true); setErr('')
    const payload = ticked.map(x => {
      const m = (x.matches ?? []).find(m => m.id === x.bought)
      return { snap: x.snap, location: x.location || null, visible: x.visible, bought: m ? { source: m.source, id: m.id, date: m.date, note: `${m.description}, ${gbp(m.amount)}` } : null }
    })
    const r = await adminFetch('/api/admin/house-snap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply', propertyId: house, items: payload }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? 'Couldn’t add them'); return }
    setDone(j.done ?? []); setItems([])
  }

  const houseName = houses.find(h => h.id === house)?.name
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/active-rooms" />} title="Add from photos" />
      <PageHero trail={[{ label: 'Properties', href: '/admin/active-rooms' }]} title="Add from photos"
        subtitle="Screenshots and photos of the WiFi, appliance labels, meters, the fuse box — read for you, checked by you, then added to the house" />
      <main className="mx-auto max-w-6xl space-y-md px-lg py-xl">
        <section className={`${card} flex flex-wrap items-end gap-md`}>
          <label className="min-w-[260px] flex-1"><span className={label}>The house</span>
            <select className={`${input} mt-1`} value={house} onChange={e => setHouse(e.target.value)}>
              <option value="">Choose…</option>
              {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label className="cursor-pointer rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700">
            + Add photos or screenshots
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = '' }} />
          </label>
          <p className="w-full text-xs text-neutral-500">The photos aren’t kept — only the details read from them, once you approve. On a phone you can take the photos straight from here.</p>
        </section>

        {done && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-md text-sm text-emerald-900">
          <p className="font-semibold">Added to {houseName}:</p>
          <ul className="mt-xs list-disc pl-lg">{done.map(d => <li key={d}>{d}</li>)}</ul>
        </section>}
        {elsewhere.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">
          {elsewhere.length === 1 ? 'One photo looks' : `${elsewhere.length} photos look`} like {houses.find(h => h.id === elsewhere[0].suggestion!.propertyId)?.name ?? 'another house'} ({elsewhere[0].suggestion!.why.toLowerCase()}) — check before approving.
        </p>}

        <section className="grid gap-md md:grid-cols-2">
          {items.map(x => {
            const sn = x.snap
            return (
              <div key={x.key} className={`${card} space-y-sm ${!x.include ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <p className={label}>{x.status === 'reading' ? 'Reading…' : x.status === 'error' ? 'Couldn’t read' : WHAT[sn?.kind] ?? 'Note'}{sn?.confidence === 'low' ? ' · check carefully' : ''}</p>
                    <p className="truncate font-semibold text-neutral-900">{sn?.title ?? x.name}</p>
                  </div>
                  {x.status === 'ready' && sn?.kind !== 'unreadable' && <label className="flex shrink-0 items-center gap-xs text-sm"><input type="checkbox" checked={x.include} onChange={() => set(x.key, { include: !x.include })} /> Add</label>}
                </div>
                {x.status === 'error' && <p className="text-xs text-red-700">{x.error}</p>}
                {sn?.kind === 'unreadable' && <p className="text-xs text-neutral-500">Try a closer, sharper photo of the label.</p>}

                {sn?.kind === 'wifi' && <div className="grid gap-sm sm:grid-cols-3">
                  <label><span className={label}>Network</span><input className={`${input} mt-1`} value={sn.wifi?.network ?? ''} onChange={e => setSnap(x.key, 'wifi.network', e.target.value)} /></label>
                  <label><span className={label}>Password</span><input className={`${input} mt-1 font-mono`} value={sn.wifi?.password ?? ''} onChange={e => setSnap(x.key, 'wifi.password', e.target.value)} /></label>
                  <label><span className={label}>Provider</span><input className={`${input} mt-1`} value={sn.wifi?.provider ?? ''} onChange={e => setSnap(x.key, 'wifi.provider', e.target.value)} /></label>
                </div>}
                {sn?.kind === 'appliance' && <>
                  <div className="grid gap-sm sm:grid-cols-3">
                    <label><span className={label}>What</span><select className={`${input} mt-1`} value={sn.appliance?.kind ?? 'other'} onChange={e => setSnap(x.key, 'appliance.kind', e.target.value)}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                    <label><span className={label}>Manufacturer</span><input className={`${input} mt-1`} value={sn.appliance?.brand ?? ''} onChange={e => setSnap(x.key, 'appliance.brand', e.target.value)} /></label>
                    <label><span className={label}>Model</span><input className={`${input} mt-1 font-mono`} value={sn.appliance?.model ?? ''} onChange={e => setSnap(x.key, 'appliance.model', e.target.value)} /></label>
                  </div>
                  {house && x.matches && (x.matches.length ? (
                    <div className="rounded-lg bg-neutral-50 p-sm">
                      <p className="text-xs font-semibold text-neutral-700">Could it be one of these? (tells us how old it is)</p>
                      {x.matches.map(m => (
                        <label key={m.id} className="mt-xs flex items-start gap-xs text-xs"><input type="radio" name={`b-${x.key}`} checked={x.bought === m.id} onChange={() => set(x.key, { bought: m.id })} className="mt-0.5" />
                          <span>{m.description} — {gbp(m.amount)}, {day(m.date)} <span className="text-neutral-500">({m.source === 'expense' ? 'expense' : 'on a statement'})</span></span></label>
                      ))}
                      <label className="mt-xs flex items-center gap-xs text-xs"><input type="radio" name={`b-${x.key}`} checked={!x.bought} onChange={() => set(x.key, { bought: '' })} /> None of these</label>
                    </div>
                  ) : <p className="text-xs text-neutral-500">No purchase found in {houseName}’s expenses or statements.</p>)}
                </>}
                {sn?.kind === 'meter' && <div className="grid gap-sm sm:grid-cols-3">
                  <label><span className={label}>Serial</span><input className={`${input} mt-1 font-mono`} value={sn.meter?.serial ?? ''} onChange={e => setSnap(x.key, 'meter.serial', e.target.value)} /></label>
                  <label><span className={label}>{sn.meter?.fuel === 'gas' ? 'MPRN' : 'MPAN'}</span><input className={`${input} mt-1 font-mono`} value={sn.meter?.mpan_mprn ?? ''} onChange={e => setSnap(x.key, 'meter.mpan_mprn', e.target.value)} /></label>
                  <label><span className={label}>Reading</span><input className={`${input} mt-1 font-mono`} value={sn.meter?.reading ?? ''} onChange={e => setSnap(x.key, 'meter.reading', e.target.value)} /></label>
                </div>}
                {sn?.info && <div className="grid gap-sm">
                  <label><span className={label}>Label</span><input className={`${input} mt-1`} value={sn.info.label} onChange={e => setSnap(x.key, 'info.label', e.target.value)} /></label>
                  <label><span className={label}>What tenants should know</span><textarea rows={2} className={`${input} mt-1`} value={sn.info.value} onChange={e => setSnap(x.key, 'info.value', e.target.value)} /></label>
                </div>}
                {x.status === 'ready' && sn?.kind !== 'unreadable' && <div className="flex flex-wrap items-center gap-md">
                  {sn?.kind !== 'wifi' && <label className="min-w-[180px] flex-1"><span className={label}>Where in the house (optional)</span><input className={`${input} mt-1`} placeholder="e.g. Kitchen, under the stairs" value={x.location} onChange={e => set(x.key, { location: e.target.value })} /></label>}
                  <label className="flex items-center gap-xs text-sm"><input type="checkbox" checked={x.visible} onChange={() => set(x.key, { visible: !x.visible })} /> Show to tenants</label>
                </div>}
              </div>
            )
          })}
        </section>

        {items.length > 0 && <section className="sticky bottom-md flex flex-wrap items-center gap-sm rounded-2xl border border-neutral-200 bg-white p-md shadow-lg">
          <button type="button" disabled={busy || !house || !ticked.length || items.some(x => x.status === 'reading')} onClick={approve} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40">
            {busy ? 'Adding…' : `Approve ${ticked.length} → ${houseName ?? 'choose the house'}`}
          </button>
          <button type="button" onClick={() => setItems([])} className="text-sm font-semibold text-neutral-600 underline">Clear</button>
          {err && <span className="text-sm text-red-700">{err}</span>}
        </section>}
      </main>
    </div>
  )
}

// the query string comes in as a prop (never useSearchParams in Suspense — see the admin pages that stuck on Loading)
export default function Page({ searchParams }: { searchParams: PageSearchParams }) { return <SnapPage initialHouse={one(use(searchParams).propertyId) ?? ''} /> }

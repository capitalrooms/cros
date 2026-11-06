'use client'

// Walk round a house (6 Nov 2026 — lib/house/walkthrough). Take photos room by room: for each, say where it is (a
// bedroom or a shared area — required), tick what's in it for the inventory (matched to its purchase where CROS can
// find one, or "roughly what year?"), and note anything that could be better. Photos are read, never kept.
import { use, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

const AREAS = ['Kitchen', 'Lounge', 'Hallway & stairs', 'Bathroom', 'Garden & outside', 'Other shared area']
const AREA_GUESS: Record<string, string> = { kitchen: 'Kitchen', lounge: 'Lounge', hallway: 'Hallway & stairs', bathroom: 'Bathroom', garden: 'Garden & outside' }
type Match = { source: 'expense' | 'statement'; id: string; date: string; amount: number; description: string }
type Item = { item: string; description: string; kind: string | null; brand: string | null; model: string | null; bulb: string | null; sure: boolean; question: string | null
  keep: boolean; matches?: Match[]; bought?: string; year?: string }
type Shot = { key: string; name: string; status: 'reading' | 'ready' | 'error'; error?: string; place: string; items: Item[]; notes: { text: string; keep: boolean }[]; myNote: string }

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const label = 'block text-[11px] font-bold uppercase tracking-wider text-neutral-500'
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.88).split(',')[1]
  } finally { URL.revokeObjectURL(url) }
}

function Walk({ initialHouse }: { initialHouse: string }) {
  const [houses, setHouses] = useState<{ id: string; name: string }[]>([])
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([])
  const [house, setHouse] = useState(initialHouse)
  const [shots, setShots] = useState<Shot[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const post = (body: unknown) => adminFetch('/api/admin/walkthrough', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))

  useEffect(() => { createClient().from('properties').select('id, name, is_demo').order('name').then(({ data }) => setHouses(((data ?? []) as any[]).filter(p => !p.is_demo).map(p => ({ id: p.id, name: String(p.name ?? '').split('\n')[0] })))) }, [])
  useEffect(() => { if (!house) { setRooms([]); return } createClient().from('rooms').select('id, name').eq('property_id', house).order('name').then(({ data }) => setRooms(((data ?? []) as any[]).map(r => ({ id: r.id, name: r.name })))) }, [house])
  const set = (key: string, f: (s: Shot) => Shot) => setShots(xs => xs.map(x => x.key === key ? f(x) : x))

  async function add(files: FileList | null) {
    if (!files?.length) return
    setMsg('')
    const list = Array.from(files).slice(0, 30).map(f => ({ f, key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }))
    setShots(xs => [...xs, ...list.map(({ f, key }) => ({ key, name: f.name, status: 'reading' as const, place: '', items: [], notes: [], myNote: '' }))])
    let i = 0
    const next = async (): Promise<void> => {
      const job = list[i++]; if (!job) return
      try {
        const { ok, j } = await post({ action: 'read', image: await shrink(job.f), mime: 'image/jpeg' })
        if (!ok) throw new Error(j.error ?? 'Couldn’t read it')
        set(job.key, s => ({ ...s, status: 'ready', place: s.place || (AREA_GUESS[j.area] ? `area:${AREA_GUESS[j.area]}` : ''), items: (j.items ?? []).map((it: any) => ({ ...it, keep: true })), notes: (j.improvements ?? []).map((t: string) => ({ text: t, keep: false })) }))
      } catch (e: any) { set(job.key, s => ({ ...s, status: 'error', error: e?.message })) }
      return next()
    }
    await Promise.all([next(), next()])
  }

  // with the house chosen, look for when each item was bought
  const itemsKey = shots.map(s => `${s.key}:${s.items.length}`).join('|')
  useEffect(() => {
    if (!house) return
    for (const sh of shots) sh.items.forEach((it, idx) => {
      if (it.matches) return
      post({ action: 'matches', propertyId: house, item: it }).then(({ j }) => set(sh.key, s => ({ ...s, items: s.items.map((x, k) => k === idx ? { ...x, matches: j.matches ?? [], bought: x.bought ?? '' } : x) })))
    })
  }, [house, itemsKey])   // eslint-disable-line react-hooks/exhaustive-deps

  const unplaced = shots.filter(s => s.status === 'ready' && !s.place)
  async function save() {
    if (!house) { setMsg('Choose the house first'); return }
    if (unplaced.length) { setMsg(`Say where ${unplaced.length === 1 ? 'one photo was' : `${unplaced.length} photos were`} taken first`); return }
    setBusy(true); setMsg('')
    const where = (p: string) => p.startsWith('room:') ? { roomId: p.slice(5), area: null } : { roomId: null, area: p.slice(5) }
    const items = shots.filter(s => s.status === 'ready').flatMap(s => s.items.filter(i => i.keep).map(i => {
      const m = (i.matches ?? []).find(m => m.id === i.bought)
      return { item: i, ...where(s.place), bought: m ? { source: m.source, id: m.id, date: m.date, note: `${m.description}, ${gbp(m.amount)}` } : null, boughtYear: m ? null : (i.year || null) }
    }))
    const notes = shots.filter(s => s.status === 'ready').flatMap(s => [...s.notes.filter(n => n.keep).map(n => n.text), ...(s.myNote.trim() ? [s.myNote.trim()] : [])].map(note => ({ note, ...where(s.place) })))
    const { ok, j } = await post({ action: 'save', propertyId: house, items, notes })
    setBusy(false)
    if (!ok) { setMsg(j.error ?? 'Couldn’t save'); return }
    setShots([])
    setMsg(`Saved ${j.saved} item${j.saved === 1 ? '' : 's'} to the inventory${j.toDate ? ` (${j.toDate} waiting for a rough date — in the house’s Upkeep › To sort)` : ''} and ${j.notes} improvement note${j.notes === 1 ? '' : 's'}.${j.applianceIds?.length ? ` ${j.applianceIds.length} appliance${j.applianceIds.length === 1 ? '' : 's'} added — care guides on their way.` : ''}`)
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/active-rooms" />} title="Walk round" />
      <PageHero trail={[{ label: 'Properties', href: '/admin/active-rooms' }]} title="Walk round"
        subtitle="Photos room by room — what’s in each for the inventory, and anything that could be better" />
      <main className="mx-auto max-w-6xl space-y-md px-lg py-xl">
        <section className="flex flex-wrap items-end gap-md rounded-2xl border border-neutral-200 bg-white p-md">
          <label className="min-w-[240px] flex-1"><span className={label}>The house</span>
            <select className={`${input} mt-1`} value={house} onChange={e => setHouse(e.target.value)}><option value="">Choose…</option>{houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <label className="cursor-pointer rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700">+ Add room photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = '' }} /></label>
          <p className="w-full text-xs text-neutral-500">The photos aren’t kept here — only what you tick. Use the room’s Photos tab for marketing photos.</p>
        </section>
        {msg && <p className="rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-800">{msg}</p>}

        {shots.map(sh => (
          <section key={sh.key} className="space-y-sm rounded-2xl border border-neutral-200 bg-white p-md">
            <div className="flex flex-wrap items-end justify-between gap-sm">
              <p className="font-semibold text-neutral-900">{sh.status === 'reading' ? 'Reading…' : sh.status === 'error' ? `Couldn’t read ${sh.name}` : sh.name}</p>
              {sh.status === 'ready' && <label className="min-w-[220px]"><span className={label}>Where is this? (needed)</span>
                <select className={`${input} mt-1 ${!sh.place ? 'border-amber-500' : ''}`} value={sh.place} onChange={e => set(sh.key, s => ({ ...s, place: e.target.value }))}>
                  <option value="">Choose the room or area…</option>
                  <optgroup label="Bedrooms">{rooms.map(r => <option key={r.id} value={`room:${r.id}`}>{r.name}</option>)}</optgroup>
                  <optgroup label="Shared areas">{AREAS.map(a => <option key={a} value={`area:${a}`}>{a}</option>)}</optgroup>
                </select></label>}
            </div>
            {sh.error && <p className="text-xs text-red-700">{sh.error}</p>}
            {sh.items.length > 0 && <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {sh.items.map((it, k) => (
                <li key={k} className={`space-y-xs px-md py-sm text-sm ${!it.keep ? 'opacity-50' : ''}`}>
                  <label className="flex items-start gap-sm"><input type="checkbox" checked={it.keep} onChange={() => set(sh.key, s => ({ ...s, items: s.items.map((x, j) => j === k ? { ...x, keep: !x.keep } : x) }))} className="mt-1" />
                    <span><span className="font-semibold">{it.item}</span> <span className="text-neutral-600">{it.description}</span>{it.bulb && <span className="block text-xs text-neutral-500">Takes: {it.bulb}</span>}
                      {it.question && <span className="block text-xs text-amber-800">{it.question}</span>}</span></label>
                  {it.keep && house && it.matches && (it.matches.length ? (
                    <div className="ml-lg text-xs">
                      {it.matches.map(m => <label key={m.id} className="flex items-start gap-xs"><input type="radio" name={`${sh.key}-${k}`} checked={it.bought === m.id} onChange={() => set(sh.key, s => ({ ...s, items: s.items.map((x, j) => j === k ? { ...x, bought: m.id } : x) }))} className="mt-0.5" /> Probably this? {m.description} — {gbp(m.amount)}, {day(m.date)}</label>)}
                      <label className="flex items-center gap-xs"><input type="radio" name={`${sh.key}-${k}`} checked={!it.bought} onChange={() => set(sh.key, s => ({ ...s, items: s.items.map((x, j) => j === k ? { ...x, bought: '' } : x) }))} /> None of these</label>
                    </div>) : null)}
                  {it.keep && !it.bought && <label className="ml-lg flex items-center gap-xs text-xs text-neutral-600">Roughly what year was it bought? <input className="w-20 rounded border border-neutral-300 px-xs py-0.5" placeholder="e.g. 2022" value={it.year ?? ''} onChange={e => set(sh.key, s => ({ ...s, items: s.items.map((x, j) => j === k ? { ...x, year: e.target.value.replace(/\D/g, '').slice(0, 4) } : x) }))} /> <span className="text-neutral-400">— or leave it and the office will be asked</span></label>}
                </li>
              ))}
            </ul>}
            {sh.status === 'ready' && <div className="rounded-xl bg-neutral-50 p-sm">
              <p className="text-sm font-semibold text-neutral-900">Any drawbacks or things that could be better here?</p>
              {sh.notes.map((n, k) => <label key={k} className="mt-xs flex items-start gap-xs text-sm"><input type="checkbox" checked={n.keep} onChange={() => set(sh.key, s => ({ ...s, notes: s.notes.map((x, j) => j === k ? { ...x, keep: !x.keep } : x) }))} className="mt-1" /> <span>{n.text} <span className="text-xs text-neutral-400">(suggested)</span></span></label>)}
              <textarea rows={2} className={`${input} mt-xs`} placeholder="e.g. Carpet worn by the door · needs a chest of drawers · lounge cluttered, needs storage" value={sh.myNote} onChange={e => set(sh.key, s => ({ ...s, myNote: e.target.value }))} />
              <p className="text-xs text-neutral-500">Optional. Saved to {sh.place.startsWith('room:') ? 'this room' : 'the house'}’s improvements, to send to the landlord or a contractor later.</p>
            </div>}
          </section>
        ))}

        {shots.length > 0 && <section className="sticky bottom-md flex flex-wrap items-center gap-sm rounded-2xl border border-neutral-200 bg-white p-md shadow-lg">
          <button type="button" disabled={busy || !house || shots.some(s => s.status === 'reading')} onClick={save} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40">{busy ? 'Saving…' : 'Save to the house'}</button>
          {unplaced.length > 0 && <span className="text-sm text-amber-800">{unplaced.length} photo{unplaced.length === 1 ? '' : 's'} still need{unplaced.length === 1 ? 's' : ''} a room or area</span>}
        </section>}
      </main>
    </div>
  )
}

export default function Page({ searchParams }: { searchParams: PageSearchParams }) { return <Walk initialHouse={one(use(searchParams).propertyId) ?? ''} /> }

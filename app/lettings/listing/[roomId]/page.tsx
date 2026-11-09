'use client'

// The listing editor (option B, 17 Oct 2026): the listing record (migration 227) on the left, the finished listing on
// the right — as the website page, a portal card (Rightmove-style) or the phone share page — so every change shows
// as you type. Along the top: where it is on the marketing board (/lettings/board) and the places it goes.
// Material information Part A (rent, deposit, council tax) is checked before it can be Ready. Saves as you go.
// Opened from Lettings › Availability, the marketing board, All Units, the property's Units tab and the room page.
import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import type { SpareRoomAd } from '@/lib/listing/spareroom'
import { isWholeLet } from '@/lib/lettings/letWording'
import PageHero, { HeroButton } from '@/components/PageHero'

type L = Record<string, any>
interface Photo { id: string; url: string; video: boolean; caption: string | null; ofRoom: boolean; otherRoom: boolean }
interface Chan { channel: string; label: string; available: boolean; enabled: boolean; status?: string | null }
const STEPS = [['draft', 'Draft'], ['ready', 'Ready'], ['live', 'Live'], ['let_agreed', 'Let agreed']] as const
const gbp = (n: number | null | undefined) => n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
const day = (d: string | null) => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export default function ListingEditor({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params)
  const [data, setData] = useState<null | { listing: L; house: any; room: any; photos: Photo[]; channels: Chan[]; missing: string[]; shareUrl: string | null; counts?: { applicants: number; viewings: number } }>(null)
  const [empty, setEmpty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [view, setView] = useState<'website' | 'portal' | 'phone'>('website')
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit')
  const [back, setBack] = useState('/lettings?tab=available')
  useEffect(() => { const f = new URLSearchParams(window.location.search).get('from'); if (f && f.startsWith('/')) setBack(f) }, [])

  const load = useCallback(async () => {
    const r = await fetch(`/api/lettings/listings?roomId=${roomId}`)
    const d = await r.json().catch(() => ({}))
    if (d.setupNeeded) { setError('Listings need migration 227 running in Supabase first.'); return }
    if (!r.ok) { setError(d.error || 'Could not open the listing'); return }
    // no listing yet: make one straight away from what CROS already holds (room, house, photos, rent) — never a blank
    // "Start the listing" screen (9 Nov 2026, Harry)
    if (!d.listing) {
      const r2 = await fetch('/api/lettings/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId }) })
      const d2 = await r2.json().catch(() => ({}))
      if (!r2.ok) { setEmpty(true); setError(d2.error || ''); return }
      setEmpty(false); setData(d2); return
    }
    setEmpty(false); setData(d)
  }, [roomId])
  useEffect(() => { load() }, [load])

  async function start() {
    setError('')
    const r = await fetch('/api/lettings/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error || 'Could not start the listing'); return }
    setEmpty(false); setData(d)
  }

  // save as you go — changes collect for a moment, then go together
  const pending = useRef<L>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function set(k: string, v: unknown) {
    if (!data) return
    setData({ ...data, listing: { ...data.listing, [k]: v } })
    pending.current[k] = v
    setSaving('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }
  async function flush() {
    if (!data) return
    const fields = pending.current; pending.current = {}
    if (!Object.keys(fields).length) return
    const r = await fetch('/api/lettings/listings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.listing.id, fields }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error || 'Could not save'); setSaving('idle'); return }
    setData(cur => cur ? { ...cur, missing: d.missing, channels: d.channels, listing: { ...d.listing, ...pending.current } } : cur)
    setSaving('saved')
  }
  async function act(body: L, done?: string) {
    if (!data) return
    await flush()
    setError(''); setNotice('')
    const r = await fetch('/api/lettings/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.listing.id, ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error || 'That didn’t work'); return }
    setData(d); if (done) setNotice(done)
  }

  // SpareRoom → the listing (and its photos into the room)
  const [srUrl, setSrUrl] = useState('')
  const [ad, setAd] = useState<SpareRoomAd | null>(null)
  // where the advert and CROS disagree; ticked = take SpareRoom's value (17 Oct 2026)
  const [checks, setChecks] = useState<{ field: string; label: string; spareroom: string; cros: string; note?: string; warn?: boolean }[]>([])
  const [takeSr, setTakeSr] = useState<Record<string, boolean>>({})
  const [srBusy, setSrBusy] = useState(false)
  // the AI fill: empty fields filled from the advert's own words; anything that disagrees listed to fix (9 Nov 2026)
  const [smart, setSmart] = useState<{ busy: boolean; checks: string[]; filled: string[] } | null>(null)
  async function fillFromAdvert(quiet = false) {
    if (!data) return
    await flush()
    setSmart({ busy: true, checks: [], filled: [] })
    const r = await fetch('/api/lettings/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.listing.id, action: 'smart-fill' }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setSmart(null); if (!quiet) setError(d.error || 'Couldn’t read the advert'); return }
    setData(d); setSmart({ busy: false, checks: d.checks ?? [], filled: d.filled ?? [] })
  }
  const [showImport, setShowImport] = useState(false)
  async function readAd() {
    setSrBusy(true); setError('')
    const r = await fetch('/api/lettings/spareroom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: srUrl.trim(), roomId }) })
    const d = await r.json().catch(() => ({}))
    setSrBusy(false)
    if (!r.ok) { setError(d.error || 'Could not read the advert'); return }
    setAd(d.ad); setChecks(d.checks ?? []); setTakeSr({})
  }
  async function importAd(withPhotos: boolean) {
    if (!ad || !data) return
    setSrBusy(true)
    if (withPhotos) await fetch('/api/lettings/spareroom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: srUrl.trim(), roomId, apply: { photos: ad.photos } }) })
    // a field SpareRoom disagrees on is only taken when it was ticked; the rest fill the gaps
    const differs = new Set(checks.map(c => c.field))
    const take = (field: string) => !differs.has(field) || !!takeSr[field]
    const monthly = ad.rent ? (ad.period === 'pw' ? Math.round(ad.rent * 52 / 12) : ad.rent) : null
    const cap = monthly ? Math.floor(monthly * 12 / 52 * 5 * 100) / 100 : null
    const fields: L = {
      headline: ad.title || data.listing.headline, description: ad.description || data.listing.description,
      rent: monthly && take('rent') ? monthly : data.listing.rent,
      deposit: ad.deposit != null && take('deposit') ? (cap != null ? Math.min(ad.deposit, cap) : ad.deposit) : data.listing.deposit,
      available_from: ad.available && take('available') ? ad.available : data.listing.available_from,
      ensuite: ad.ensuite != null && take('ensuite') ? ad.ensuite : data.listing.ensuite,
      living_room: ad.livingRoom != null && take('livingRoom') ? ad.livingRoom : data.listing.living_room,
      bills_included: ad.billsIncluded != null && take('bills') ? ad.billsIncluded : data.listing.bills_included,
      furnished: ad.furnished == null || !take('furnished') ? data.listing.furnished : ad.furnished ? 'furnished' : 'unfurnished',
    }
    await fetch('/api/lettings/listings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.listing.id, fields }) })
    // newly copied photos join the end of the listing's photos
    const r = await fetch(`/api/lettings/listings?roomId=${roomId}`); const d = await r.json()
    const order: string[] = d.listing.media_order ?? []
    const added = (d.photos as Photo[]).filter(p => p.ofRoom && !order.includes(p.id)).map(p => p.id)
    if (added.length) await fetch('/api/lettings/listings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.listing.id, fields: { media_order: [...order, ...added] } }) })
    setSrBusy(false); setAd(null); setChecks([]); setSrUrl(''); setShowImport(false); setNotice('Imported from SpareRoom — now filling the gaps from the description…'); await load(); fillFromAdvert(true).then(() => setNotice('Imported from SpareRoom and the gaps filled — check it over.'))
  }

  const shell = (body: React.ReactNode) => <div className="min-h-screen bg-neutral-100 pb-3xl"><AppBar left={<BackButton href={back} />} />{body}</div>
  if (error && !data) return shell(<p className="mx-auto max-w-5xl px-lg py-xl text-sm text-red-700">{error}</p>)
  if (empty) return shell(
    <main className="mx-auto max-w-xl px-lg py-2xl text-center">
      <h1 className="text-xl font-extrabold text-neutral-900">No listing for this room yet</h1>
      <p className="mt-sm text-sm text-neutral-600">Start one — it’s filled in from the room, the house and its photos, so most of it is ready to check.</p>
      <button type="button" onClick={start} className="mt-lg rounded-xl bg-neutral-900 px-xl py-md text-sm font-bold text-white">Start the listing</button>
      <p className="mt-md text-sm"><Link href="/lettings/board" className="underline">Marketing board</Link></p>
    </main>)
  if (!data) return shell(<p className="mx-auto max-w-5xl px-lg py-xl text-sm text-neutral-500">Loading…</p>)

  const l = data.listing
  const order: string[] = l.media_order ?? []
  const media = order.map(id => data.photos.find(p => p.id === id)).filter(Boolean) as Photo[]
  const notUsed = data.photos.filter(p => !order.includes(p.id) && !p.otherRoom)
  const stepIx = STEPS.findIndex(([k]) => k === l.status)
  const whole = isWholeLet(data.house?.property_type, data.room?.name)
  const houseLine = String(data.house?.address || data.house?.name || '').split('\n')[0]
  const title = whole ? houseLine : data.room ? `${data.room.name}, ${houseLine}` : houseLine
  const field = 'w-full rounded-xl border border-neutral-300 bg-white px-md py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10'
  const lbl = 'block space-y-1.5 text-sm font-semibold text-neutral-800'
  const hint = (t: string) => <span className="block text-xs font-normal text-neutral-500">{t}</span>
  const yn = (k: string) => (
    <select value={l[k] == null ? '' : l[k] ? 'yes' : 'no'} onChange={e => set(k, e.target.value === '' ? null : e.target.value === 'yes')} className={field}>
      <option value="">Not said</option><option value="yes">Yes</option><option value="no">No</option>
    </select>)
  const move = (to: string) => act({ action: 'move', to }, to === 'live' ? 'Live ✓' : to === 'let_agreed' ? 'Let agreed — taken down everywhere' : undefined)
  const filled = (k: string) => smart?.filled.includes(k) ? <span className="ml-xs rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">filled in</span> : null

  // the sections, each with whether it's done — the contents down the side and the readiness card read from this
  const SECTIONS: { id: string; title: string; done: boolean }[] = [
    { id: 'advert', title: 'The advert', done: !!(l.headline && l.description && l.summary) },
    { id: 'photos', title: 'Photos & video', done: media.length >= 3 },
    { id: 'price', title: 'Price & availability', done: !!(l.rent && l.deposit != null && l.available_from && l.council_tax_band) },
    { id: 'property', title: whole ? 'The property' : 'The room & house', done: !!(l.property_type && l.furnished && l.display_address) },
    { id: 'suits', title: 'Who it suits', done: !!l.let_type },
    { id: 'more', title: 'Anything that affects it', done: true },
  ]
  const go = (id: string) => { setMobilePane('edit'); setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30) }
  const btn = 'rounded-xl px-lg py-2.5 text-sm font-bold transition disabled:opacity-40'

  const preview = (
    <div className="space-y-md">
      <div className="flex gap-1 rounded-xl bg-white p-1 text-sm font-semibold shadow-sm" role="tablist">
        {([['website', 'Website'], ['portal', 'Portal card'], ['phone', 'Phone']] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`flex-1 rounded-lg px-sm py-1.5 ${view === k ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900'}`}>{t}</button>
        ))}
      </div>
      {view === 'portal' ? <PortalCard l={l} media={media} /> : <SitePage l={l} media={media} roomName={data.room?.name} narrow={view === 'phone'} />}
      <p className="text-xs text-neutral-500">{view === 'website' ? 'How it reads on a website page — the final look comes with the website design.' : view === 'portal' ? 'How it shows in Rightmove and Zoopla search results.' : 'The share link on a phone.'}</p>
    </div>)

  return shell(<>
    {/* ── header: the site's green band with where you came from (9 Nov 2026), then the next steps one click away ── */}
    <PageHero
      eyebrow={`${whole ? 'Whole property' : 'Room'} listing · ${l.agent_ref}`}
      title={title}
      chip={{ label: STEPS[stepIx]?.[1] ?? l.status, tone: l.status === 'live' ? 'good' : l.status === 'ready' ? 'info' : l.status === 'let_agreed' ? 'warn' : 'plain' }}
      subtitle={<>{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'All changes saved' : 'Saves as you go'}</>}
      trail={back.startsWith('/admin/properties')
        ? [{ label: 'Properties', href: '/admin/properties' }, { label: houseLine, href: `/admin/properties/${l.property_id}` }, ...(!whole && data.room ? [{ label: data.room.name, href: `/admin/properties/${l.property_id}/rooms/${roomId}` }] : []), { label: 'Listing' }]
        : back.startsWith('/admin/active-rooms')
          ? [{ label: 'All Units', href: '/admin/active-rooms' }, { label: houseLine, href: `/admin/properties/${l.property_id}` }, { label: 'Listing' }]
        : back.startsWith('/lettings/board')
          ? [{ label: 'Lettings', href: '/admin/lettings' }, { label: 'Marketing board', href: '/lettings/board' }, { label: 'Listing' }]
          : [{ label: 'Lettings', href: '/admin/lettings' }, { label: 'Availability', href: '/admin/available-and-lettings' }, { label: 'Listing' }]}
      actions={<>
        {l.status === 'draft' && <HeroButton onClick={() => move('ready')}>Mark ready</HeroButton>}
        {(l.status === 'ready' || l.status === 'draft') && <HeroButton primary onClick={() => move('live')}>Publish</HeroButton>}
        {l.status === 'live' && <HeroButton primary onClick={() => move('let_agreed')}>Let agreed</HeroButton>}
        {l.status === 'let_agreed' && <HeroButton primary onClick={() => move('let')}>Mark let</HeroButton>}
        {l.status !== 'draft' && l.status !== 'let_agreed' && <HeroButton onClick={() => move('draft')}>Back to draft</HeroButton>}
      </>}
    />
    <div className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-lg gap-y-sm px-lg py-sm text-sm">
        {([
          [whole ? 'Property record' : 'Room record', whole || !data.room ? `/admin/properties/${l.property_id}` : `/admin/properties/${l.property_id}/rooms/${roomId}`],
          [`Applicants${data.counts ? ` · ${data.counts.applicants}` : ''}`, `/admin/applicants?room=${roomId}`],
          [`Viewings${data.counts ? ` · ${data.counts.viewings} coming up` : ''}`, `/admin/properties/${l.property_id}?tab=lettings`],
          ['Book a viewing', `/admin/properties/${l.property_id}?tab=lettings&book=${roomId}`],
          ['Send an offer', `/admin/available-and-lettings?offer_room=${roomId}#send-offer`],
          ['Marketing board', '/lettings/board'],
        ] as const).map(([t, href]) => <Link key={t} href={href} className="font-semibold text-neutral-700 hover:text-neutral-950 hover:underline">{t}</Link>)}
        <ol className="ml-auto flex items-center gap-1 text-xs font-semibold" aria-label="Where the listing is">
          {STEPS.map(([k, t], i) => <li key={k} className={`rounded-full px-sm py-0.5 ${i === stepIx ? 'bg-neutral-900 text-white' : i < stepIx ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-400'}`}>{t}</li>)}
        </ol>
      </div>
    </div>

    {(error || notice) && (
      <div className="mx-auto max-w-7xl space-y-1 px-lg pt-md">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{error}</p>}
        {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-md py-sm text-sm text-emerald-800">{notice}</p>}
      </div>
    )}

    {/* phone: edit or preview */}
    <div className="mx-auto mt-md flex max-w-7xl gap-1 px-lg lg:hidden">
      {(['edit', 'preview'] as const).map(p => <button key={p} type="button" onClick={() => setMobilePane(p)} className={`flex-1 rounded-xl py-2 text-sm font-bold ${mobilePane === p ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600'}`}>{p === 'edit' ? 'Edit' : 'Preview'}</button>)}
    </div>

    <div className="mx-auto grid max-w-7xl gap-xl px-lg py-lg lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,440px)]">
      {/* contents — each part ticked when it's done */}
      <nav className="hidden lg:block" aria-label="Parts of the listing">
        <ul className="sticky top-lg space-y-0.5 text-sm">
          {SECTIONS.map(x => (
            <li key={x.id}><button type="button" onClick={() => go(x.id)} className="flex w-full items-center gap-sm rounded-lg px-sm py-2 text-left font-semibold text-neutral-700 hover:bg-white">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${x.done ? 'bg-emerald-600 text-white' : 'border-2 border-neutral-300'}`}>{x.done ? '✓' : ''}</span>{x.title}
            </button></li>
          ))}
          <li className="pt-md"><button type="button" onClick={() => { setShowImport(true); go('import') }} className="px-sm text-xs font-semibold text-neutral-500 underline hover:text-neutral-900">Import from SpareRoom</button></li>
        </ul>
      </nav>

      <div className={`min-w-0 space-y-lg ${mobilePane === 'preview' ? 'hidden lg:block' : ''}`}>
        {/* what's still needed + the smart fill */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <h2 className="text-base font-bold text-neutral-900">{data.missing.length ? `${data.missing.length} thing${data.missing.length === 1 ? '' : 's'} before it can go live` : 'Everything needed is in'}</h2>
              <p className="mt-0.5 text-sm text-neutral-500">{data.missing.length ? 'Required by law on every advert (material information) or for the portals.' : 'Check the preview, then Publish.'}</p>
            </div>
            <button type="button" onClick={() => fillFromAdvert()} disabled={smart?.busy || !l.description} title={l.description ? '' : 'Needs a description first'}
              className={`${btn} bg-violet-700 text-white hover:bg-violet-800`}>{smart?.busy ? 'Reading the advert…' : '✨ Fill the gaps from the description'}</button>
          </div>
          {data.missing.length > 0 && <ul className="mt-md flex flex-wrap gap-xs">{data.missing.map(m => <li key={m} className="rounded-full bg-amber-50 px-md py-1 text-sm font-medium text-amber-900 ring-1 ring-amber-200">{m}</li>)}</ul>}
          {smart && !smart.busy && (
            <div className="mt-md space-y-sm border-t border-neutral-100 pt-md text-sm">
              <p className="text-neutral-700">{smart.filled.length ? <>Filled in from the advert: <b>{smart.filled.map(k => k.replace(/_/g, ' ')).join(', ')}</b> — marked <span className="rounded-full bg-violet-100 px-1.5 text-[10px] font-bold uppercase text-violet-800">filled in</span> below. Nothing you’d already typed was changed.</> : 'Nothing new to fill — every field the advert covers is already done.'}</p>
              {smart.checks.length > 0 && <div className="rounded-xl bg-amber-50 p-md ring-1 ring-amber-200"><p className="font-bold text-amber-900">Worth fixing before you publish</p><ul className="mt-xs list-disc space-y-1 pl-5 text-amber-900">{smart.checks.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
            </div>
          )}
        </section>

        {(showImport || (!l.description && !media.length)) && (
          <Section id="import" title="Import from SpareRoom" sub="Paste the advert’s link — the text, price, dates and photos come across, then the gaps are filled from its description.">
            <div className="flex gap-sm">
              <input value={srUrl} onChange={e => setSrUrl(e.target.value)} placeholder="https://www.spareroom.co.uk/flatshare/…" className={field} />
              <button type="button" onClick={readAd} disabled={srBusy || !srUrl.trim()} className={`${btn} shrink-0 bg-neutral-900 text-white`}>{srBusy && !ad ? 'Reading…' : 'Read it'}</button>
            </div>
            {ad && (
              <div className="space-y-md rounded-xl bg-neutral-50 p-md text-sm">
                <div>
                  <p className="font-bold">{ad.title}</p>
                  <p className="text-neutral-600">{[ad.rent ? `${gbp(ad.rent)} ${ad.period}` : '', ad.available ? `from ${day(ad.available)}` : '', ad.deposit ? `deposit ${gbp(ad.deposit)}` : '', `${ad.photos.length} photos`].filter(Boolean).join(' · ')}</p>
                </div>
                {checks.length > 0 ? (
                  <div>
                    <p className="font-bold text-amber-900">SpareRoom and CROS don’t agree on these — tick to take SpareRoom’s</p>
                    <ul className="mt-xs divide-y divide-amber-100 rounded-lg border border-amber-200 bg-white">
                      {checks.map(c => {
                        const choosable = !['rooms', 'flatmates'].includes(c.field)
                        return (
                          <li key={c.field} className="flex items-start gap-sm px-md py-sm">
                            {choosable ? <input type="checkbox" checked={!!takeSr[c.field]} onChange={() => setTakeSr(t => ({ ...t, [c.field]: !t[c.field] }))} className="mt-1" /> : <span className="mt-0.5 w-4 text-center text-amber-700">!</span>}
                            <span className="min-w-0 flex-1"><b>{c.label}</b>: SpareRoom {c.spareroom} · CROS {c.cros}{c.note && <span className={`block text-xs ${c.warn ? 'text-amber-800' : 'text-neutral-500'}`}>{c.note}</span>}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : <p className="text-emerald-800">Everything the advert says matches CROS.</p>}
                <div className="flex flex-wrap gap-sm">
                  <button type="button" onClick={() => importAd(true)} disabled={srBusy} className={`${btn} bg-neutral-900 text-white`}>{srBusy ? 'Importing…' : 'Use it, with photos'}</button>
                  <button type="button" onClick={() => importAd(false)} disabled={srBusy} className={`${btn} border border-neutral-300 bg-white`}>Text and details only</button>
                </div>
              </div>
            )}
          </Section>
        )}

        <Section id="advert" title="The advert" sub="What people read first. Keep the headline short and plain — the photos do the shouting.">
          <label className={lbl}>Headline {filled('headline')}<input className={field} value={l.headline ?? ''} maxLength={120} onChange={e => set('headline', e.target.value)} placeholder={whole ? 'e.g. Studio with city views, gym and pool' : 'e.g. Bright double room near Bow Road'} />{hint(`${String(l.headline ?? '').length}/80 is ideal for portals`)}</label>
          <label className={lbl}>Summary {filled('summary')}<textarea rows={2} className={field} value={l.summary ?? ''} maxLength={300} onChange={e => set('summary', e.target.value)} placeholder="One or two sentences shown in search results" />{hint(`${String(l.summary ?? '').length}/220`)}</label>
          <label className={lbl}>Description<textarea rows={14} className={`${field} leading-relaxed`} value={l.description ?? ''} onChange={e => set('description', e.target.value)} /></label>
          <Features value={l.features ?? []} onChange={v => set('features', v)} badge={filled('features')} />
        </Section>

        <Section id="photos" title="Photos & video" sub={`${media.length} in the listing — the first is the main photo. Use the arrows to reorder.`}>
          {media.length === 0 && <p className="rounded-xl border-2 border-dashed border-neutral-200 p-lg text-center text-sm text-neutral-500">No photos yet.</p>}
          <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
            {media.map((p, i) => (
              <div key={p.id} className={`group relative overflow-hidden rounded-xl bg-neutral-200 ${i === 0 ? 'col-span-2 row-span-2' : ''}`}>
                {p.video ? <video src={p.url} className="h-full w-full object-cover" muted /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="" className="aspect-[4/3] h-full w-full object-cover" />}
                {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold shadow">Main photo</span>}
                <div className="absolute inset-x-2 bottom-2 flex justify-between opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                  <button type="button" disabled={i === 0} onClick={() => { const o = [...order]; const j = o.indexOf(p.id); [o[j - 1], o[j]] = [o[j], o[j - 1]]; set('media_order', o) }} aria-label="Move earlier" className="grid h-8 w-8 place-items-center rounded-full bg-white/95 text-sm shadow disabled:opacity-30">←</button>
                  <button type="button" onClick={() => set('media_order', order.filter(x => x !== p.id))} aria-label="Leave out of the listing" className="rounded-full bg-white/95 px-sm text-xs font-semibold shadow">Remove</button>
                  <button type="button" disabled={i === media.length - 1} onClick={() => { const o = [...order]; const j = o.indexOf(p.id); [o[j + 1], o[j]] = [o[j], o[j + 1]]; set('media_order', o) }} aria-label="Move later" className="grid h-8 w-8 place-items-center rounded-full bg-white/95 text-sm shadow disabled:opacity-30">→</button>
                </div>
              </div>
            ))}
          </div>
          {notUsed.length > 0 && (
            <details className="rounded-xl bg-neutral-50 p-md text-sm"><summary className="cursor-pointer font-semibold text-neutral-700">Add from the property’s other photos ({notUsed.length})</summary>
              <div className="mt-sm grid grid-cols-4 gap-xs sm:grid-cols-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {notUsed.map(p => <button key={p.id} type="button" onClick={() => set('media_order', [...order, p.id])} className="overflow-hidden rounded-lg opacity-80 hover:opacity-100" title="Add to the listing"><img src={p.url} alt="" className="aspect-square w-full object-cover" /></button>)}
              </div>
            </details>
          )}
          <div className="grid gap-md sm:grid-cols-3">
            <label className={lbl}>Video tour<input className={field} value={l.video_url ?? ''} onChange={e => set('video_url', e.target.value)} placeholder="https://…" /></label>
            <label className={lbl}>Virtual tour<input className={field} value={l.virtual_tour_url ?? ''} onChange={e => set('virtual_tour_url', e.target.value)} placeholder="https://…" /></label>
            <label className={lbl}>Floor plan<input className={field} value={l.floorplan_url ?? ''} onChange={e => set('floorplan_url', e.target.value)} placeholder="https://…" /></label>
          </div>
          <Link href={`/admin/properties/${l.property_id}/rooms/${roomId}/edit`} className="inline-block text-sm font-semibold text-neutral-700 underline">Upload new photos or video</Link>
        </Section>

        <Section id="price" title="Price & availability" sub="Material information part A — must be on every advert.">
          <div className="grid gap-md sm:grid-cols-2">
            <div className={lbl}>Rent
              <div className="flex gap-sm"><input inputMode="decimal" className={field} value={l.rent ?? ''} onChange={e => set('rent', e.target.value)} placeholder="£" />
                <select className={`${field} w-40`} value={l.rent_frequency} onChange={e => set('rent_frequency', e.target.value)}><option value="pcm">a month</option><option value="pw">a week</option></select></div>
            </div>
            <label className={lbl}>Available from<input type="date" className={field} value={l.available_from ?? ''} onChange={e => set('available_from', e.target.value)} /></label>
            <label className={lbl}>Deposit<input inputMode="decimal" className={field} value={l.deposit ?? ''} onChange={e => set('deposit', e.target.value)} />{hint('Five weeks’ rent at most')}</label>
            <label className={lbl}>Holding deposit<input inputMode="decimal" className={field} value={l.holding_deposit ?? ''} onChange={e => set('holding_deposit', e.target.value)} />{hint('One week’s rent at most')}</label>
            <label className={lbl}>Bills included{yn('bills_included')}</label>
            <div className="grid grid-cols-2 gap-sm">
              <label className={lbl}>Council tax band<select className={field} value={l.council_tax_band ?? ''} onChange={e => set('council_tax_band', e.target.value)}><option value="">—</option>{'ABCDEFGH'.split('').map(b => <option key={b} value={b}>{b}</option>)}</select></label>
              <label className={lbl}>In the rent{yn('council_tax_included')}</label>
            </div>
          </div>
        </Section>

        <Section id="property" title={whole ? 'The property' : 'The room & house'} sub="Material information part B.">
          <div className="grid gap-md sm:grid-cols-2">
            <label className={lbl}>Type {filled('property_type')}<select className={field} value={l.property_type ?? ''} onChange={e => set('property_type', e.target.value)}><option value="">—</option>
              {whole ? <><option value="studio">Studio</option><option value="flat">Flat</option><option value="maisonette">Maisonette</option><option value="house">House</option></> : <><option value="house_share">Room in a house share</option><option value="flat_share">Room in a flat share</option></>}</select></label>
            <label className={lbl}>Furnished {filled('furnished')}<select className={field} value={l.furnished ?? ''} onChange={e => set('furnished', e.target.value)}><option value="">—</option><option value="furnished">Furnished</option><option value="part">Part furnished</option><option value="unfurnished">Unfurnished</option></select></label>
            {!(whole && l.property_type === 'studio') && <label className={lbl}>Bedrooms {filled('bedrooms')}<input inputMode="numeric" className={field} value={l.bedrooms ?? ''} onChange={e => set('bedrooms', e.target.value)} /></label>}
            <label className={lbl}>Bathrooms {filled('bathrooms')}<input inputMode="numeric" className={field} value={l.bathrooms ?? ''} onChange={e => set('bathrooms', e.target.value)} /></label>
            <label className={lbl}>{whole ? 'Floor area (m²)' : 'Room size (m²)'}<input inputMode="decimal" className={field} value={l.room_size_sqm ?? ''} onChange={e => set('room_size_sqm', e.target.value)} /></label>
            {!whole && <><label className={lbl}>En-suite{yn('ensuite')}</label><label className={lbl}>Shared living room{yn('living_room')}</label></>}
            <label className={lbl}>Outside space {filled('outside_space')}<input className={field} value={l.outside_space ?? ''} onChange={e => set('outside_space', e.target.value)} placeholder="Balcony, garden, terrace…" /></label>
            <label className={lbl}>Broadband {filled('broadband')}<input className={field} value={l.broadband ?? ''} onChange={e => set('broadband', e.target.value)} placeholder="e.g. Superfast fibre" /></label>
            <label className={lbl}>Heating {filled('heating')}<input className={field} value={l.heating ?? ''} onChange={e => set('heating', e.target.value)} placeholder="e.g. Gas central heating" /></label>
            <label className={lbl}>Parking {filled('parking')}<input className={field} value={l.parking ?? ''} onChange={e => set('parking', e.target.value)} placeholder="None / permit / off-street" /></label>
            <label className={`${lbl} sm:col-span-2`}>Address shown publicly {filled('display_address')}<input className={field} value={l.display_address ?? ''} onChange={e => set('display_address', e.target.value)} placeholder="Street or building, and area — never the flat number" /></label>
          </div>
        </Section>

        <Section id="suits" title="Who it suits">
          <div className="grid gap-md sm:grid-cols-2">
            <label className={lbl}>Let type<select className={field} value={l.let_type ?? ''} onChange={e => set('let_type', e.target.value)}><option value="">—</option><option value="long">Long term</option><option value="short">Short term</option><option value="student">Student</option></select></label>
            {whole ? <label className={lbl}>Sharers welcome{yn('sharers_allowed')}{hint('Friends renting together')}</label> : null}
            <label className={lbl}>Pets{yn('pets_allowed')}</label>
            <label className={lbl}>Smokers{yn('smokers_allowed')}</label>
            <label className={`${lbl} sm:col-span-2`}>Ideal for<input className={field} value={l.tenant_type ?? ''} onChange={e => set('tenant_type', e.target.value)} placeholder={whole ? 'e.g. a professional or couple who want a calm base near Canary Wharf' : 'e.g. someone who likes a calm, tidy house'} /></label>
          </div>
        </Section>

        <Section id="more" title="Anything that affects it" sub="Material information part C — only fill in what applies; blank means none.">
          <div className="grid gap-md sm:grid-cols-2">
            {([['flood', 'Flood risk'], ['restrictions', 'Restrictions'], ['accessibility', 'Accessibility'], ['building_safety', 'Building safety']] as const).map(([k, t]) => (
              <label key={k} className={lbl}>{t}<input className={field} value={l.part_c?.[k] ?? ''} onChange={e => set('part_c', { ...(l.part_c ?? {}), [k]: e.target.value })} placeholder="None" /></label>
            ))}
          </div>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-md px-xs pb-lg">
          <button type="button" onClick={() => { setShowImport(true); go('import') }} className="text-sm font-semibold text-neutral-600 underline lg:hidden">Import from SpareRoom</button>
          <button type="button" onClick={() => { if (window.confirm('Withdraw this listing? It comes down from everywhere it’s shown.')) act({ action: 'move', to: 'withdrawn' }, 'Withdrawn') }} className="text-sm font-semibold text-red-700 underline">Withdraw this listing</button>
        </div>
      </div>

      {/* right: where it goes, then the preview */}
      <aside className={`space-y-lg lg:sticky lg:top-lg lg:h-fit ${mobilePane === 'edit' ? 'hidden lg:block' : ''}`}>
        <section className="rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm">
          <h2 className="text-sm font-bold text-neutral-900">Where it goes</h2>
          <ul className="mt-sm space-y-1">
            {data.channels.map(c => (
              <li key={c.channel} className="flex items-center justify-between gap-sm text-sm">
                <span className={c.available ? 'text-neutral-800' : 'text-neutral-400'}>{c.label}{!c.available && <span className="ml-xs text-xs">coming soon</span>}</span>
                <button type="button" role="switch" aria-checked={!!c.enabled} aria-label={`${c.label} ${c.enabled ? 'on' : 'off'}`} disabled={!c.available && !c.enabled}
                  onClick={() => act({ action: 'channel', channel: c.channel, enabled: !c.enabled })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${c.enabled ? 'bg-emerald-600' : 'bg-neutral-300'} disabled:opacity-40`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${c.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </li>
            ))}
          </ul>
          {data.shareUrl && <div className="mt-md flex gap-sm border-t border-neutral-100 pt-md">
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(data.shareUrl!); setNotice('Share link copied') } catch { window.prompt('Copy the link', data.shareUrl!) } }} className="flex-1 rounded-xl border border-neutral-300 py-2 text-sm font-semibold hover:bg-neutral-50">Copy share link</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${l.headline || title}${l.rent ? ` — ${gbp(l.rent)} ${l.rent_frequency}` : ''}: ${data.shareUrl}`)}`} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-neutral-300 py-2 text-center text-sm font-semibold hover:bg-neutral-50">WhatsApp</a>
          </div>}
        </section>
        {preview}
      </aside>
    </div>
  </>)
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={`sec-${id}`} className="scroll-mt-lg space-y-lg rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm sm:p-xl">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-neutral-500">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function Features({ value, onChange, badge }: { value: string[]; onChange: (v: string[]) => void; badge?: React.ReactNode }) {
  const [t, setT] = useState('')
  const add = () => { if (t.trim() && value.length < 10) { onChange([...value, t.trim()]); setT('') } }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-neutral-800">Key features {badge}<span className="ml-xs text-xs font-normal text-neutral-500">{value.length}/10 — portals show up to 10</span></p>
      {value.length > 0 && <div className="flex flex-wrap gap-xs">
        {value.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-1 pl-md pr-1 text-sm">{f}<button type="button" aria-label={`Remove ${f}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid h-6 w-6 place-items-center rounded-full text-neutral-500 hover:bg-neutral-200">×</button></span>)}
      </div>}
      {value.length < 10 && <div className="flex gap-sm"><input value={t} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="e.g. 5 minutes to Canary Wharf station" className="w-full rounded-xl border border-neutral-300 bg-white px-md py-2.5 text-[15px]" /><button type="button" onClick={add} className="rounded-xl border border-neutral-300 px-md text-sm font-semibold">Add</button></div>}
    </div>
  )
}

/** the listing as a website page / phone share page — neutral styling until the website design is settled */
function SitePage({ l, media, roomName, narrow }: { l: L; media: Photo[]; roomName?: string; narrow: boolean }) {
  const photos = media.filter(m => !m.video)
  return (
    <div className={`overflow-hidden rounded-xl border border-[#D6DCE3] bg-white ${narrow ? 'mx-auto max-w-[360px]' : ''}`}>
      {photos[0] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photos[0].url} alt="" className="aspect-[16/10] w-full object-cover" /> : <div className="flex aspect-[16/10] items-center justify-center bg-neutral-100 text-xs text-neutral-400">Main photo</div>}
      {photos.length > 1 && <div className="flex gap-1 overflow-x-auto p-1">{photos.slice(1, 8).map(p => /* eslint-disable-next-line @next/next/no-img-element */ <img key={p.id} src={p.url} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />)}</div>}
      <div className="space-y-2 p-md">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{l.display_address || 'Display address'}</p>
        <h3 className="text-lg font-bold leading-tight text-neutral-900">{l.headline || (roomName ? `${roomName} to rent` : 'Headline')}</h3>
        <p className="text-sm"><b className="text-base">{l.rent ? `${gbp(l.rent)} ${l.rent_frequency}` : 'Rent'}</b>{l.bills_included ? ' · bills included' : ''} · <span className="font-semibold text-emerald-700">{!l.available_from ? 'Date to confirm' : l.available_from <= today() ? 'Available now' : `From ${day(l.available_from)}`}</span></p>
        {/* Part A — on the listing itself */}
        <p className="text-[11px] text-neutral-600">Deposit {gbp(l.deposit)}{l.holding_deposit ? ` · holding deposit ${gbp(l.holding_deposit)}` : ''} · Council tax {l.council_tax_included ? 'included' : l.council_tax_band ? `band ${l.council_tax_band}` : '—'}</p>
        {(l.features ?? []).length > 0 && <ul className="flex flex-wrap gap-1">{l.features.map((f: string, i: number) => <li key={i} className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px]">{f}</li>)}</ul>}
        {l.description && <p className="max-h-60 overflow-hidden whitespace-pre-line text-[13px] leading-relaxed text-neutral-800">{l.description}</p>}
        <div className="flex gap-2 pt-1"><span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">Apply</span><span className="rounded-full border border-neutral-900 px-3 py-1 text-xs font-semibold">Book a viewing</span></div>
      </div>
    </div>
  )
}

/** the listing as it shows in a portal's search results */
function PortalCard({ l, media }: { l: L; media: Photo[] }) {
  const p = media.find(m => !m.video)
  return (
    <div className="space-y-sm">
      <div className="flex overflow-hidden rounded-lg border border-[#D6DCE3] bg-white">
        {p ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="" className="w-[42%] shrink-0 object-cover" /> : <div className="w-[42%] shrink-0 bg-neutral-100" />}
        <div className="min-w-0 space-y-1 p-sm">
          <p className="text-lg font-bold text-neutral-900">{l.rent ? `${gbp(l.rent)} ${l.rent_frequency}` : 'Rent'}</p>
          <p className="text-xs text-neutral-500">{l.rent && l.rent_frequency === 'pcm' ? `${gbp(Math.round(Number(l.rent) * 12 / 52))} pw` : ''}</p>
          <p className="text-sm font-semibold text-neutral-900">{l.headline || 'Headline'}</p>
          <p className="text-xs text-neutral-600">{l.display_address || 'Display address'}</p>
          <p className="line-clamp-3 text-xs text-neutral-700">{l.summary || String(l.description ?? '').replace(/\s+/g, ' ').slice(0, 180)}</p>
          <p className="text-[11px] text-neutral-500">{[l.property_type?.replace('_', ' '), l.bedrooms ? `${l.bedrooms} bed` : '', l.bathrooms ? `${l.bathrooms} bath` : '', l.furnished].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <p className="text-[11px] text-neutral-500">Portals also show: deposit {gbp(l.deposit)} · council tax {l.council_tax_included ? 'included' : l.council_tax_band ? `band ${l.council_tax_band}` : 'not set'} · available {l.available_from ? day(l.available_from) : 'not set'}{(l.features ?? []).length ? ` · ${l.features.length} key features` : ''}</p>
    </div>
  )
}

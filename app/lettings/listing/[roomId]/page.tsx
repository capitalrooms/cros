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

type L = Record<string, any>
interface Photo { id: string; url: string; video: boolean; caption: string | null; ofRoom: boolean; otherRoom: boolean }
interface Chan { channel: string; label: string; available: boolean; enabled: boolean; status?: string | null }
const STEPS = [['draft', 'Draft'], ['ready', 'Ready'], ['live', 'Live'], ['let_agreed', 'Let agreed']] as const
const gbp = (n: number | null | undefined) => n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
const day = (d: string | null) => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export default function ListingEditor({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params)
  const [data, setData] = useState<null | { listing: L; house: any; room: any; photos: Photo[]; channels: Chan[]; missing: string[]; shareUrl: string | null }>(null)
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
    if (!d.listing) { setEmpty(true); return }
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
  const [srBusy, setSrBusy] = useState(false)
  async function readAd() {
    setSrBusy(true); setError('')
    const r = await fetch('/api/lettings/spareroom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: srUrl.trim() }) })
    const d = await r.json().catch(() => ({}))
    setSrBusy(false)
    if (!r.ok) { setError(d.error || 'Could not read the advert'); return }
    setAd(d.ad)
  }
  async function importAd(withPhotos: boolean) {
    if (!ad || !data) return
    setSrBusy(true)
    if (withPhotos) await fetch('/api/lettings/spareroom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: srUrl.trim(), roomId, apply: { photos: ad.photos } }) })
    const fields: L = {
      headline: ad.title || data.listing.headline, description: ad.description || data.listing.description,
      rent: ad.rent ? (ad.period === 'pw' ? Math.round(ad.rent * 52 / 12) : ad.rent) : data.listing.rent,
      deposit: ad.deposit ?? data.listing.deposit, available_from: ad.available ?? data.listing.available_from,
      ensuite: ad.ensuite ?? data.listing.ensuite, living_room: ad.livingRoom ?? data.listing.living_room, bills_included: ad.billsIncluded ?? data.listing.bills_included,
      furnished: ad.furnished == null ? data.listing.furnished : ad.furnished ? 'furnished' : 'unfurnished', min_term_months: ad.minTermMonths ?? data.listing.min_term_months,
    }
    await fetch('/api/lettings/listings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.listing.id, fields }) })
    // newly copied photos join the end of the listing's photos
    const r = await fetch(`/api/lettings/listings?roomId=${roomId}`); const d = await r.json()
    const order: string[] = d.listing.media_order ?? []
    const added = (d.photos as Photo[]).filter(p => p.ofRoom && !order.includes(p.id)).map(p => p.id)
    if (added.length) await fetch('/api/lettings/listings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.listing.id, fields: { media_order: [...order, ...added] } }) })
    setSrBusy(false); setAd(null); setSrUrl(''); setNotice('Imported from SpareRoom — check it over.'); load()
  }

  const shell = (body: React.ReactNode) => <div className="min-h-screen bg-[#EDF0F4] pb-3xl"><AppBar left={<BackButton href={back} />} title="Listing" />{body}</div>
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
  const title = data.room ? `${data.room.name} · ${String(data.house?.name ?? '').split('\n')[0]}` : String(data.house?.name ?? '').split('\n')[0]
  const field = 'w-full rounded-lg border border-[#C9D1DA] bg-white px-sm py-1.5 text-sm text-neutral-900'
  const lbl = 'block text-[11px] font-bold uppercase tracking-wide text-[#5B6470]'
  const yn = (k: string) => (
    <select value={l[k] == null ? '' : l[k] ? 'yes' : 'no'} onChange={e => set(k, e.target.value === '' ? null : e.target.value === 'yes')} className={field}>
      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
    </select>)
  const move = (to: string) => act({ action: 'move', to }, to === 'live' ? 'Live ✓' : to === 'let_agreed' ? 'Let agreed — taken down everywhere' : undefined)

  const preview = (
    <div className="space-y-sm">
      <div className="flex gap-1 rounded-lg bg-white p-0.5 text-xs font-semibold" role="tablist">
        {([['website', 'Website'], ['portal', 'Portal card'], ['phone', 'Phone']] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`flex-1 rounded-md px-sm py-1 ${view === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{t}</button>
        ))}
      </div>
      {view === 'portal' ? <PortalCard l={l} media={media} /> : <SitePage l={l} media={media} roomName={data.room?.name} narrow={view === 'phone'} />}
      <p className="text-[11px] text-neutral-500">{view === 'website' ? 'How the listing reads on a website page — the final look comes with the website design.' : view === 'portal' ? 'How it shows in portal search results (Rightmove, Zoopla).' : 'The share link on a phone.'}</p>
    </div>)

  return shell(<>
    {/* status, places it goes, save state */}
    <div className="border-b border-[#D6DCE3] bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-md gap-y-sm px-lg py-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-neutral-900">{title}</p>
          <p className="text-[11px] text-neutral-500">{l.agent_ref} · {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : 'Saves as you go'} · <Link href="/lettings/board" className="underline">Marketing board</Link></p>
        </div>
        <ol className="flex items-center gap-1 text-[11px] font-bold">
          {STEPS.map(([k, t], i) => <li key={k} className={`rounded px-1.5 py-0.5 ${i === stepIx ? 'bg-neutral-900 text-white' : i < stepIx ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>{t}</li>)}
        </ol>
        <div className="ml-auto flex flex-wrap gap-sm">
          {l.status === 'draft' && <button type="button" onClick={() => move('ready')} className="rounded-lg bg-neutral-900 px-md py-1.5 text-xs font-bold text-white">Mark ready</button>}
          {(l.status === 'ready' || l.status === 'draft') && <button type="button" onClick={() => move('live')} className="rounded-lg bg-emerald-700 px-md py-1.5 text-xs font-bold text-white">Publish</button>}
          {l.status === 'live' && <button type="button" onClick={() => move('let_agreed')} className="rounded-lg bg-neutral-900 px-md py-1.5 text-xs font-bold text-white">Let agreed</button>}
          {l.status === 'let_agreed' && <button type="button" onClick={() => move('let')} className="rounded-lg bg-neutral-900 px-md py-1.5 text-xs font-bold text-white">Mark let</button>}
          {l.status !== 'draft' && l.status !== 'let_agreed' && <button type="button" onClick={() => move('draft')} className="rounded-lg border border-neutral-300 px-md py-1.5 text-xs font-semibold">Back to draft</button>}
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-lg pb-sm">
        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Goes to</span>
        {data.channels.map(c => (
          <button key={c.channel} type="button" onClick={() => act({ action: 'channel', channel: c.channel, enabled: !c.enabled })}
            title={c.available ? '' : 'Needs its feed set up first'}
            className={`rounded-full border px-sm py-0.5 text-[11px] font-semibold ${c.enabled ? 'border-emerald-700 bg-emerald-700 text-white' : c.available ? 'border-neutral-300 bg-white text-neutral-700' : 'border-dashed border-neutral-300 bg-white text-neutral-400'}`}>
            {c.enabled ? '✓ ' : ''}{c.label}{!c.available ? ' · soon' : ''}
          </button>
        ))}
        {data.shareUrl && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(data.shareUrl!); setNotice('Share link copied') } catch { window.prompt('Copy the link', data.shareUrl!) } }} className="ml-auto rounded-full border border-neutral-300 bg-white px-sm py-0.5 text-[11px] font-semibold">🔗 Copy share link</button>}
        {data.shareUrl && <a href={`https://wa.me/?text=${encodeURIComponent(`${l.headline || title}${l.rent ? ` — ${gbp(l.rent)} pcm` : ''}: ${data.shareUrl}`)}`} target="_blank" rel="noreferrer" className="rounded-full border border-neutral-300 bg-white px-sm py-0.5 text-[11px] font-semibold">WhatsApp</a>}
      </div>
    </div>

    {(error || notice || data.missing.length > 0) && (
      <div className="mx-auto max-w-6xl space-y-1 px-lg pt-sm">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-md py-1.5 text-sm text-red-800">{error}</p>}
        {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-md py-1.5 text-sm text-emerald-800">{notice}</p>}
        {data.missing.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-md py-1.5 text-xs text-amber-900"><b>Before it can be Ready:</b> {data.missing.join(' · ')}</p>}
      </div>
    )}

    {/* phone: edit or preview */}
    <div className="mx-auto mt-sm flex max-w-6xl gap-1 px-lg lg:hidden">
      {(['edit', 'preview'] as const).map(p => <button key={p} type="button" onClick={() => setMobilePane(p)} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${mobilePane === p ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600'}`}>{p === 'edit' ? 'Edit' : 'Preview'}</button>)}
    </div>

    <div className="mx-auto grid max-w-6xl gap-md px-lg py-md lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className={`space-y-md ${mobilePane === 'preview' ? 'hidden lg:block' : ''}`}>
        <Section title="Price & availability" tag="Material info · Part A">
          <div className="grid gap-sm sm:grid-cols-3">
            <label className={lbl}>Rent<input inputMode="decimal" className={field} value={l.rent ?? ''} onChange={e => set('rent', e.target.value)} /></label>
            <label className={lbl}>Per<select className={field} value={l.rent_frequency} onChange={e => set('rent_frequency', e.target.value)}><option value="pcm">month</option><option value="pw">week</option></select></label>
            <label className={lbl}>Bills included{yn('bills_included')}</label>
            <label className={lbl}>Deposit<input inputMode="decimal" className={field} value={l.deposit ?? ''} onChange={e => set('deposit', e.target.value)} /></label>
            <label className={lbl}>Holding deposit<input inputMode="decimal" className={field} value={l.holding_deposit ?? ''} onChange={e => set('holding_deposit', e.target.value)} /></label>
            <label className={lbl}>Available from<input type="date" className={field} value={l.available_from ?? ''} onChange={e => set('available_from', e.target.value)} /></label>
            <label className={lbl}>Council tax band<select className={field} value={l.council_tax_band ?? ''} onChange={e => set('council_tax_band', e.target.value)}><option value="">—</option>{'ABCDEFGH'.split('').map(b => <option key={b} value={b}>{b}</option>)}</select></label>
            <label className={lbl}>Council tax in rent{yn('council_tax_included')}</label>
            <label className={lbl}>Min. term (months)<input inputMode="numeric" className={field} value={l.min_term_months ?? ''} onChange={e => set('min_term_months', e.target.value)} /></label>
          </div>
        </Section>

        <Section title="The advert">
          <label className={lbl}>Headline<input className={field} value={l.headline ?? ''} maxLength={120} onChange={e => set('headline', e.target.value)} /></label>
          <label className={lbl}>Summary <span className="font-normal normal-case text-neutral-400">(one or two lines for search results)</span><textarea rows={2} className={field} value={l.summary ?? ''} maxLength={300} onChange={e => set('summary', e.target.value)} /></label>
          <label className={lbl}>Description<textarea rows={9} className={field} value={l.description ?? ''} onChange={e => set('description', e.target.value)} /></label>
          <Features value={l.features ?? []} onChange={v => set('features', v)} />
        </Section>

        <Section title="Photos & video" tag={`${media.length} shown`}>
          {media.length === 0 && <p className="text-sm text-neutral-500">No photos in the listing yet.</p>}
          <div className="grid grid-cols-3 gap-xs sm:grid-cols-4">
            {media.map((p, i) => (
              <div key={p.id} className="relative overflow-hidden rounded-md bg-neutral-200">
                {p.video ? <video src={p.url} className="aspect-[4/3] w-full object-cover" muted /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="" className="aspect-[4/3] w-full object-cover" />}
                {i === 0 && <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[10px] font-bold">Main</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 px-1 text-[11px] text-white">
                  <button type="button" disabled={i === 0} onClick={() => { const o = [...order]; const j = o.indexOf(p.id); [o[j - 1], o[j]] = [o[j], o[j - 1]]; set('media_order', o) }} aria-label="Earlier">◀</button>
                  <button type="button" onClick={() => set('media_order', order.filter(x => x !== p.id))} aria-label="Leave out">✕</button>
                  <button type="button" disabled={i === media.length - 1} onClick={() => { const o = [...order]; const j = o.indexOf(p.id); [o[j + 1], o[j]] = [o[j], o[j + 1]]; set('media_order', o) }} aria-label="Later">▶</button>
                </div>
              </div>
            ))}
          </div>
          {notUsed.length > 0 && (
            <details className="text-xs"><summary className="cursor-pointer font-semibold text-neutral-600">Add from the house’s photos ({notUsed.length})</summary>
              <div className="mt-xs grid grid-cols-4 gap-xs sm:grid-cols-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {notUsed.map(p => <button key={p.id} type="button" onClick={() => set('media_order', [...order, p.id])} className="overflow-hidden rounded-md opacity-80 hover:opacity-100"><img src={p.url} alt="" className="aspect-square w-full object-cover" /></button>)}
              </div>
            </details>
          )}
          <div className="grid gap-sm sm:grid-cols-3">
            <label className={lbl}>Video tour link<input className={field} value={l.video_url ?? ''} onChange={e => set('video_url', e.target.value)} placeholder="https://…" /></label>
            <label className={lbl}>Virtual tour link<input className={field} value={l.virtual_tour_url ?? ''} onChange={e => set('virtual_tour_url', e.target.value)} placeholder="https://…" /></label>
            <label className={lbl}>Floor plan link<input className={field} value={l.floorplan_url ?? ''} onChange={e => set('floorplan_url', e.target.value)} placeholder="https://…" /></label>
          </div>
          <Link href={`/admin/properties/${l.property_id}/rooms/${roomId}`} className="text-xs font-semibold underline">Upload photos or video to the room</Link>
        </Section>

        <Section title="The property" tag="Material info · Part B">
          <div className="grid gap-sm sm:grid-cols-3">
            <label className={lbl}>Type<select className={field} value={l.property_type ?? ''} onChange={e => set('property_type', e.target.value)}><option value="">—</option><option value="house_share">House share</option><option value="flat_share">Flat share</option><option value="flat">Flat</option><option value="house">House</option><option value="studio">Studio</option><option value="maisonette">Maisonette</option></select></label>
            <label className={lbl}>Bedrooms<input inputMode="numeric" className={field} value={l.bedrooms ?? ''} onChange={e => set('bedrooms', e.target.value)} /></label>
            <label className={lbl}>Bathrooms<input inputMode="numeric" className={field} value={l.bathrooms ?? ''} onChange={e => set('bathrooms', e.target.value)} /></label>
            <label className={lbl}>Room size (m²)<input inputMode="decimal" className={field} value={l.room_size_sqm ?? ''} onChange={e => set('room_size_sqm', e.target.value)} /></label>
            <label className={lbl}>En-suite{yn('ensuite')}</label>
            <label className={lbl}>Living room{yn('living_room')}</label>
            <label className={lbl}>Furnished<select className={field} value={l.furnished ?? ''} onChange={e => set('furnished', e.target.value)}><option value="">—</option><option value="furnished">Furnished</option><option value="part">Part furnished</option><option value="unfurnished">Unfurnished</option></select></label>
            <label className={lbl}>Heating<input className={field} value={l.heating ?? ''} onChange={e => set('heating', e.target.value)} placeholder="Gas central heating" /></label>
            <label className={lbl}>Broadband<input className={field} value={l.broadband ?? ''} onChange={e => set('broadband', e.target.value)} /></label>
            <label className={lbl}>Parking<input className={field} value={l.parking ?? ''} onChange={e => set('parking', e.target.value)} placeholder="None / permit / off-street" /></label>
            <label className={lbl}>Outside space<input className={field} value={l.outside_space ?? ''} onChange={e => set('outside_space', e.target.value)} placeholder="Garden, balcony…" /></label>
            <label className={lbl}>Display address<input className={field} value={l.display_address ?? ''} onChange={e => set('display_address', e.target.value)} placeholder="Street, district" /></label>
          </div>
        </Section>

        <Section title="Who it suits">
          <div className="grid gap-sm sm:grid-cols-4">
            <label className={lbl}>Let type<select className={field} value={l.let_type ?? ''} onChange={e => set('let_type', e.target.value)}><option value="">—</option><option value="long">Long term</option><option value="short">Short term</option><option value="student">Student</option></select></label>
            <label className={lbl}>Sharers{yn('sharers_allowed')}</label>
            <label className={lbl}>Pets{yn('pets_allowed')}</label>
            <label className={lbl}>Smokers{yn('smokers_allowed')}</label>
            <label className={`${lbl} sm:col-span-2`}>Ideal for<input className={field} value={l.tenant_type ?? ''} onChange={e => set('tenant_type', e.target.value)} placeholder="Professionals" /></label>
          </div>
        </Section>

        <Section title="Anything that affects it" tag="Material info · Part C — only if it applies">
          <div className="grid gap-sm sm:grid-cols-2">
            {([['flood', 'Flood risk'], ['restrictions', 'Restrictions'], ['accessibility', 'Accessibility'], ['building_safety', 'Building safety']] as const).map(([k, t]) => (
              <label key={k} className={lbl}>{t}<input className={field} value={l.part_c?.[k] ?? ''} onChange={e => set('part_c', { ...(l.part_c ?? {}), [k]: e.target.value })} placeholder="Leave blank if none" /></label>
            ))}
          </div>
        </Section>

        <Section title="Import from SpareRoom">
          <div className="flex gap-sm">
            <input value={srUrl} onChange={e => setSrUrl(e.target.value)} placeholder="https://www.spareroom.co.uk/flatshare/…" className={field} />
            <button type="button" onClick={readAd} disabled={srBusy || !srUrl.trim()} className="shrink-0 rounded-lg bg-neutral-900 px-md text-xs font-bold text-white disabled:opacity-40">{srBusy && !ad ? 'Reading…' : 'Read it'}</button>
          </div>
          {ad && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-sm text-xs">
              <p className="font-bold">{ad.title}</p>
              <p className="text-neutral-600">{[ad.rent ? `${gbp(ad.rent)} ${ad.period}` : '', ad.available ? `from ${day(ad.available)}` : '', ad.deposit ? `deposit ${gbp(ad.deposit)}` : '', ad.minTermMonths ? `min ${ad.minTermMonths} months` : '', `${ad.photos.length} photos`].filter(Boolean).join(' · ')}</p>
              <div className="mt-xs flex gap-sm">
                <button type="button" onClick={() => importAd(true)} disabled={srBusy} className="rounded-md bg-neutral-900 px-sm py-1 font-bold text-white disabled:opacity-40">{srBusy ? 'Importing…' : 'Use it, with photos'}</button>
                <button type="button" onClick={() => importAd(false)} disabled={srBusy} className="rounded-md border border-neutral-300 px-sm py-1 font-semibold disabled:opacity-40">Text and details only</button>
              </div>
            </div>
          )}
        </Section>

        <button type="button" onClick={() => act({ action: 'move', to: 'withdrawn' }, 'Withdrawn')} className="text-xs font-semibold text-red-700 underline">Withdraw this listing</button>
      </div>

      <aside className={`lg:sticky lg:top-md lg:h-fit ${mobilePane === 'edit' ? 'hidden lg:block' : ''}`}>{preview}</aside>
    </div>
  </>)
}

function Section({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-sm rounded-[10px] border border-[#D6DCE3] bg-white p-md">
      <h2 className="flex flex-wrap items-baseline gap-x-sm text-sm font-bold text-neutral-900">{title}{tag && <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5B6470]">{tag}</span>}</h2>
      {children}
    </section>
  )
}

function Features({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = useState('')
  const add = () => { if (t.trim() && value.length < 10) { onChange([...value, t.trim()]); setT('') } }
  return (
    <div>
      <p className="block text-[11px] font-bold uppercase tracking-wide text-[#5B6470]">Key features <span className="font-normal normal-case text-neutral-400">({value.length}/10 — portals show up to 10)</span></p>
      <div className="mt-1 flex flex-wrap gap-1">
        {value.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-0.5 pl-sm pr-1 text-xs">{f}<button type="button" aria-label={`Remove ${f}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-full px-1 text-neutral-500 hover:bg-neutral-200">×</button></span>)}
      </div>
      {value.length < 10 && <div className="mt-1 flex gap-sm"><input value={t} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="e.g. 5 min walk to Pimlico station" className="w-full rounded-lg border border-[#C9D1DA] bg-white px-sm py-1.5 text-sm" /><button type="button" onClick={add} className="rounded-lg border border-neutral-300 px-sm text-xs font-semibold">Add</button></div>}
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

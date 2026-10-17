'use client'

// A room's listing for lettings and the office (17 Oct 2026): the photos and videos (the room first, then the
// house), what it costs and when it's free, its features and advert text — and the share link to send instead of
// loose photos and WhatsApp videos. "Import from SpareRoom" fills it from an advert we already have there.
// Opened from Lettings › Availability and from the property's room (lib/listing; /api/lettings/listing).
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import type { Listing } from '@/lib/listing/listing'
import type { SpareRoomAd } from '@/lib/listing/spareroom'

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ListingPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params)
  const [l, setL] = useState<Listing | null>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [big, setBig] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/lettings/listing?roomId=${roomId}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error || 'Could not open the listing'); return }
    setL(d.listing); setShareUrl(d.shareUrl)
  }, [roomId])
  useEffect(() => { load() }, [load])

  // SpareRoom import
  const [srUrl, setSrUrl] = useState('')
  const [ad, setAd] = useState<SpareRoomAd | null>(null)
  const [pick, setPick] = useState({ description: true, rent: true, available: true, ensuite: true, livingRoom: false, bills: true })
  const [photos, setPhotos] = useState<string[]>([])
  const [srBusy, setSrBusy] = useState(false)
  const [srMsg, setSrMsg] = useState('')
  async function readAd() {
    setSrBusy(true); setSrMsg(''); setAd(null)
    const r = await fetch('/api/lettings/spareroom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: srUrl.trim() }) })
    const d = await r.json().catch(() => ({}))
    setSrBusy(false)
    if (!r.ok) { setSrMsg(d.error || 'Could not read the advert'); return }
    setAd(d.ad); setPhotos(d.ad.photos)
  }
  async function importAd() {
    setSrBusy(true); setSrMsg('')
    const r = await fetch('/api/lettings/spareroom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: srUrl.trim(), roomId, apply: { ...pick, photos } }) })
    const d = await r.json().catch(() => ({}))
    setSrBusy(false)
    if (!r.ok) { setSrMsg(d.error || 'Could not import it'); return }
    setSrMsg(d.done?.length ? `✅ Imported: ${d.done.join(', ')}` : 'Nothing new to import')
    setAd(null); setSrUrl(''); load()
  }

  async function copy() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { window.prompt('Copy the link', shareUrl) }
  }
  const shareText = l ? `${l.wholeLet ? l.displayName : `${l.roomName}, ${l.displayName}`}${l.rent ? ` — ${gbp(l.rent)} pcm` : ''}. Photos, video and details: ${shareUrl}` : ''

  if (error) return <div className="min-h-screen bg-neutral-100"><AppBar left={<BackButton href="/lettings" />} title="Listing" /><p className="mx-auto max-w-4xl px-lg py-xl text-sm text-red-700">{error}</p></div>
  if (!l) return <div className="min-h-screen bg-neutral-100"><AppBar left={<BackButton href="/lettings" />} title="Listing" /><p className="mx-auto max-w-4xl px-lg py-xl text-sm text-neutral-500">Loading…</p></div>

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const btn = 'rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm font-semibold text-neutral-900 hover:bg-neutral-50'
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/lettings?tab=available" />} title="Listing" />
      <main className="mx-auto max-w-4xl px-lg py-lg space-y-md">
        <section className="rounded-2xl bg-white p-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{l.letOnly ? 'Let only · ' : ''}{l.area}</p>
          <h1 className="mt-xs text-2xl font-extrabold text-neutral-900" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{l.wholeLet ? l.displayName : `${l.roomName} · ${l.displayName}`}</h1>
          <p className="text-sm text-neutral-500">{l.fullAddress} <span className="text-neutral-400">(the full address isn’t shown on the share link)</span></p>
          <div className="mt-sm flex flex-wrap items-baseline gap-x-lg gap-y-xs">
            <span className="text-xl font-black text-neutral-900">{l.rent != null ? `${gbp(l.rent)} pcm` : 'Rent not set'}{l.billsIncluded ? <span className="text-sm font-semibold text-neutral-500"> · bills included</span> : null}</span>
            <span className={`text-sm font-semibold ${l.available && l.available <= today ? 'text-emerald-700' : 'text-neutral-700'}`}>{!l.available ? 'Date not set' : l.available <= today ? 'Available now' : `From ${day(l.available)}`}</span>
          </div>
          <div className="mt-md flex flex-wrap gap-sm">
            <button type="button" onClick={copy} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white">{copied ? '✓ Link copied' : '🔗 Copy share link'}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className={btn}>WhatsApp</a>
            <a href={`sms:?&body=${encodeURIComponent(shareText)}`} className={btn}>Text</a>
            <a href={shareUrl} target="_blank" rel="noreferrer" className={btn}>See what they see ↗</a>
            <Link href={`/admin/properties/${l.propertyId}/rooms/${l.roomId}`} className={btn}>Photos &amp; details</Link>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-lg">
          <h2 className="mb-sm text-sm font-bold text-neutral-900">Photos &amp; video <span className="font-normal text-neutral-500">· {l.media.filter(m => m.ofRoom).length} of the room, {l.media.filter(m => !m.ofRoom).length} of the house</span></h2>
          {l.media.length === 0 ? <p className="text-sm text-neutral-500">No photos yet — add them on <Link href={`/admin/properties/${l.propertyId}/rooms/${l.roomId}`} className="underline">the room</Link>, or import them from SpareRoom below.</p> : (
            <div className="grid grid-cols-3 gap-xs sm:grid-cols-4">
              {l.media.map(m => m.kind === 'video'
                ? <video key={m.id} src={m.url} controls playsInline preload="metadata" className="col-span-3 w-full rounded-lg bg-black sm:col-span-2" />
                // eslint-disable-next-line @next/next/no-img-element
                : <button key={m.id} type="button" onClick={() => setBig(m.url)} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100"><img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />{m.ofRoom && <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[10px] font-bold">Room</span>}</button>)}
            </div>
          )}
        </section>

        {(l.features.length > 0 || l.description) && (
          <section className="rounded-2xl bg-white p-lg">
            {l.features.length > 0 && <ul className="mb-md flex flex-wrap gap-xs">{l.features.map(f => <li key={f} className="rounded-full bg-neutral-100 px-sm py-0.5 text-xs font-semibold text-neutral-700">{f}</li>)}</ul>}
            {l.description && <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-800">{l.description}</p>}
          </section>
        )}

        <section className="rounded-2xl bg-white p-lg">
          <h2 className="text-sm font-bold text-neutral-900">Import from SpareRoom</h2>
          <p className="text-xs text-neutral-500">Paste the advert’s link — the text, rent, dates and photos are read off it. You choose what to bring in.</p>
          <div className="mt-sm flex gap-sm">
            <input value={srUrl} onChange={e => setSrUrl(e.target.value)} placeholder="https://www.spareroom.co.uk/flatshare/…" className="flex-1 rounded-xl border border-neutral-300 px-md py-sm text-sm" />
            <button type="button" onClick={readAd} disabled={srBusy || !srUrl.trim()} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{srBusy && !ad ? 'Reading…' : 'Read it'}</button>
          </div>
          {srMsg && <p className="mt-sm text-sm text-neutral-700">{srMsg}</p>}
          {ad && (
            <div className="mt-md space-y-sm rounded-xl border border-neutral-200 p-md">
              <p className="text-sm font-bold">{ad.title}</p>
              <div className="grid gap-xs text-sm sm:grid-cols-2">
                {([
                  ['description', 'Advert text', ad.description ? `${ad.description.split('\n')[0].slice(0, 60)}…` : null],
                  ['rent', 'Rent', ad.rent ? `${gbp(ad.rent)} ${ad.period}${l.rent != null && l.rent !== ad.rent ? ` (now ${gbp(l.rent)})` : ''}` : null],
                  ['available', 'Available', ad.available ? day(ad.available) : null],
                  ['ensuite', 'En-suite', ad.ensuite == null ? null : ad.ensuite ? 'Yes' : 'No'],
                  ['livingRoom', 'Living room', ad.livingRoom == null ? null : ad.livingRoom ? 'Yes' : 'No'],
                  ['bills', 'Bills included (the house)', ad.billsIncluded == null ? null : ad.billsIncluded ? 'Yes' : 'No'],
                ] as const).filter(([, , v]) => v != null).map(([k, label, v]) => (
                  <label key={k} className="flex items-start gap-sm"><input type="checkbox" className="mt-1" checked={pick[k]} onChange={e => setPick(p => ({ ...p, [k]: e.target.checked }))} /><span><b>{label}:</b> {v}</span></label>
                ))}
              </div>
              {ad.photos.length > 0 && (
                <div>
                  <p className="mb-xs text-xs font-semibold text-neutral-600">Photos — tap to leave one out ({photos.length} of {ad.photos.length})</p>
                  <div className="grid grid-cols-4 gap-xs sm:grid-cols-6">
                    {ad.photos.map(u => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <button key={u} type="button" onClick={() => setPhotos(p => p.includes(u) ? p.filter(x => x !== u) : [...p, u])} className={`relative aspect-square overflow-hidden rounded-md ring-2 ${photos.includes(u) ? 'ring-neutral-900' : 'opacity-40 ring-transparent'}`}><img src={u.replace('/large/', '/square/')} alt="" className="h-full w-full object-cover" /></button>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-neutral-500">Also on the advert: {[ad.minTermMonths ? `minimum ${ad.minTermMonths} months` : '', ad.deposit ? `deposit ${gbp(ad.deposit)}` : '', ad.furnished != null ? (ad.furnished ? 'furnished' : 'unfurnished') : '', ad.flatmates ? `${ad.flatmates} flatmates` : ''].filter(Boolean).join(' · ')}</p>
              <button type="button" onClick={importAd} disabled={srBusy} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{srBusy ? 'Importing…' : 'Import into this listing'}</button>
            </div>
          )}
        </section>
      </main>

      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-md" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}

'use client'

// The listing's photos (17 Oct 2026, "on par with the best property ads"): a large first photo with the next four
// beside it on a computer, a swipeable strip with a counter on a phone, and a full-screen viewer (← → and Esc) for all
// of them. Also the Share button: the phone's own share sheet where there is one, else WhatsApp / copy link.
import { useEffect, useState } from 'react'

export interface GalleryPhoto { id: string; url: string; alt: string }

export default function ListingGallery({ photos, videoCount }: { photos: GalleryPhoto[]; videoCount: number }) {
  const [open, setOpen] = useState<number | null>(null)
  const [mobileAt, setMobileAt] = useState(0)
  useEffect(() => {
    if (open == null) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen(i => i == null ? i : (i + 1) % photos.length)
      if (e.key === 'ArrowLeft') setOpen(i => i == null ? i : (i - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', on); document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', on); document.body.style.overflow = '' }
  }, [open, photos.length])
  if (!photos.length) return null
  // the computer layout fits the number of photos — never a gap (9 Nov 2026)
  const shown = photos.slice(0, 5), n = shown.length
  const cols = n === 1 ? '1fr' : n === 2 ? '3fr 2fr' : n === 3 ? '2fr 1fr' : n === 4 ? '2fr 1fr 1fr' : '2fr 1fr 1fr'
  const place = (i: number): React.CSSProperties => {
    if (i === 0) return { gridRow: n === 1 ? 'auto' : 'span 2' }
    if (n === 2) return { gridRow: 'span 2' }
    if (n === 4 && i === 1) return { gridRow: 'span 2' }
    return {}
  }

  return (
    <>
      {/* computer */}
      <div className="relative hidden gap-2 overflow-hidden rounded-[inherit] md:grid" style={{ gridTemplateColumns: cols, gridTemplateRows: n === 1 ? '460px' : '230px 230px' }}>
        {shown.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setOpen(i)} className="relative overflow-hidden" style={place(i)} aria-label={i === 0 ? 'Open the photos' : `Open photo ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.alt} loading={i === 0 ? 'eager' : 'lazy'} className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]" />
          </button>
        ))}
        <button type="button" onClick={() => setOpen(0)} className="absolute bottom-3 right-3 rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#111] shadow">
          View all {photos.length} photos{videoCount ? ` · ${videoCount} video${videoCount === 1 ? '' : 's'}` : ''}
        </button>
      </div>

      {/* phone: swipe, with where you are */}
      <div className="relative md:hidden">
        <div className="flex snap-x snap-mandatory overflow-x-auto" style={{ scrollbarWidth: 'none' }}
          onScroll={e => { const el = e.currentTarget; setMobileAt(Math.round(el.scrollLeft / el.clientWidth)) }}>
          {photos.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setOpen(i)} className="w-full shrink-0 snap-center" aria-label={`Open photo ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.alt} loading={i < 2 ? 'eager' : 'lazy'} className="aspect-[4/3] w-full object-cover" />
            </button>
          ))}
        </div>
        <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-[12px] font-semibold text-white">{mobileAt + 1} / {photos.length}</span>
      </div>

      {open != null && (
        <div role="dialog" aria-modal="true" aria-label="Photos" className="fixed inset-0 z-50 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', background: '#111' }}>
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-[13px] text-white/70">{open + 1} of {photos.length}</span>
            <button type="button" onClick={() => setOpen(null)} className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#111]">Close</button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={photos[open].id} src={photos[open].url} alt={photos[open].alt} className="max-h-full max-w-full object-contain" />
            {photos.length > 1 && <>
              <button type="button" onClick={() => setOpen((open - 1 + photos.length) % photos.length)} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-4 py-3 text-[18px] text-[#111]">←</button>
              <button type="button" onClick={() => setOpen((open + 1) % photos.length)} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-4 py-3 text-[18px] text-[#111]">→</button>
            </>}
          </div>
        </div>
      )}
    </>
  )
}

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState('')
  async function share() {
    const url = window.location.href
    try {
      if (navigator.share) { await navigator.share({ title, url }); return }
      await navigator.clipboard.writeText(url); setDone('Link copied'); setTimeout(() => setDone(''), 2000)
    } catch { /* closed the share sheet */ }
  }
  return (
    <div className="flex gap-2">
      <button type="button" onClick={share} className="flex-1 rounded-full border border-[#111] px-4 py-2.5 text-[14px] font-semibold text-[#111]">{done || 'Share'}</button>
      <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${window.location.href}`)}`, '_blank', 'noopener')}
        className="flex-1 rounded-full border border-[#111] px-4 py-2.5 text-center text-[14px] font-semibold text-[#111]">WhatsApp</button>
    </div>
  )
}

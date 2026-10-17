// The share link for a room (17 Oct 2026) — /l/<room>/<token>, sent by lettings by text, email or WhatsApp instead of
// loose photos and videos. Public, but only with the right token (lib/listing). Never shows the full address: the
// display name (house number dropped) and the postcode district. "Apply" goes to the usual application form.
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PublicShell from '@/components/public/PublicShell'
import { createServiceClient } from '@/lib/supabase'
import { loadListing, listingToken } from '@/lib/listing/listing'

export const dynamic = 'force-dynamic'

// what can be said in public: no flat or house number, no full postcode — "Flat 4, 44 Claverton Street, London,
// SW1V 3AU" → "Claverton Street"; a marketing name ("The Pimlico House") is left as it is
const publicTitle = (name: string) => {
  const parts = name.split(/\s*[,\n]\s*/).map(p => p.replace(/^(flat|apartment|unit|room)\s*\w+$/i, '').replace(/^\d+[a-z]?\s+/i, '').trim())
    .filter(p => p && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(p) && !/^london$/i.test(p))
  return parts[0] || 'Room to rent'
}
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
const when = (d: string | null) => !d ? 'Ask us' : d <= new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) ? 'Available now' : `From ${new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`

async function load(roomId: string, token: string) {
  if (token !== listingToken(roomId)) return null
  return loadListing(createServiceClient() as any, roomId)
}

export async function generateMetadata({ params }: { params: Promise<{ roomId: string; token: string }> }): Promise<Metadata> {
  const { roomId, token } = await params
  const l = await load(roomId, token)
  if (!l) return { title: 'Capital Rooms' }
  const title = `${l.wholeLet ? publicTitle(l.displayName) : `${l.roomName} · ${publicTitle(l.displayName)}`}${l.rent ? ` — ${gbp(l.rent)} pcm` : ''}`
  return { title, description: l.description.slice(0, 160), openGraph: { title, description: l.description.slice(0, 160), images: l.media.filter(m => m.kind === 'photo').slice(0, 1).map(m => m.url) }, robots: { index: false } }
}

export default async function SharedListing({ params }: { params: Promise<{ roomId: string; token: string }> }) {
  const { roomId, token } = await params
  const l = await load(roomId, token)
  if (!l) notFound()
  const title = l.wholeLet ? publicTitle(l.displayName) : `${l.roomName} — ${publicTitle(l.displayName)}`
  const photos = l.media.filter(m => m.kind === 'photo'), videos = l.media.filter(m => m.kind === 'video')
  return (
    <PublicShell centred label="Room to rent">
      <article className="mx-auto max-w-3xl px-5 pb-16 pt-8 md:px-8">
        <p className="pub-eyebrow">{l.area}</p>
        <h1 className="mt-2 text-[34px] leading-tight md:text-[44px]" style={{ fontFamily: 'var(--pub-serif), serif' }}>{title}</h1>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[15px]">
          {l.rent != null && <span className="text-[22px] font-semibold">{gbp(l.rent)} <span className="text-[14px] font-normal text-neutral-500">pcm{l.billsIncluded ? ' · bills included' : ''}</span></span>}
          <span className="font-semibold text-emerald-700">{when(l.available)}</span>
        </div>

        {photos.length > 0 && (
          <div className="mt-6 -mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-2 md:-mx-8 md:px-8" style={{ scrollbarWidth: 'thin' }}>
            {photos.map((m, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={m.url} alt={m.caption || (m.ofRoom ? `${l.roomName}, photo ${i + 1}` : `The house, photo ${i + 1}`)} loading={i < 2 ? 'eager' : 'lazy'}
                className="h-[260px] w-auto max-w-none shrink-0 snap-start rounded-lg object-cover md:h-[360px]" />
            ))}
          </div>
        )}
        {photos.length > 1 && <p className="mt-1 text-[12px] text-neutral-500">{photos.length} photos — swipe to see them all</p>}

        {videos.length > 0 && (
          <section className="mt-8 space-y-3">
            <h2 className="pub-eyebrow">Video tour</h2>
            {videos.map(v => <video key={v.id} src={v.url} controls playsInline preload="metadata" className="w-full rounded-lg bg-black" />)}
          </section>
        )}

        {l.features.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-2">
            {l.features.map(f => <li key={f} className="rounded-full border border-neutral-300 px-3 py-1 text-[13px]">{f}</li>)}
          </ul>
        )}

        {l.description && <div className="mt-8 whitespace-pre-line text-[16px] leading-relaxed text-neutral-800">{l.description}</div>}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a href={`/applicant/apply?roomId=${l.roomId}&propertyId=${l.propertyId}`} className="rounded-full bg-[#111] px-6 py-3 text-center text-[15px] font-semibold text-white">Apply for this {l.wholeLet ? 'home' : 'room'}</a>
          <a href="tel:02071129163" className="rounded-full border border-[#111] px-6 py-3 text-center text-[15px] font-semibold text-[#111]">Call to book a viewing</a>
        </div>
        <p className="mt-3 text-[12px] text-neutral-500">The exact address is given when your viewing is booked.</p>
      </article>
    </PublicShell>
  )
}

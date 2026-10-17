// The share link for a room (17 Oct 2026) — /l/<room>/<token>, sent by lettings by text, email or WhatsApp instead of
// loose photos and videos, and the layout the website's room pages will use. Laid out as the best property adverts
// are (Rightmove, Zoopla, SpareRoom): the photos first, the key facts at a glance, a price box that stays in view
// with Apply / Call / Share, then the room, the features, getting around (nearest stations with walking times), the
// area on a map, and every cost and fact a renter is owed (Trading Standards' material information).
// Filled from the house and room records (lib/listing) so it reads full before anyone writes a description.
// Public, but only with the right token. Never shows the full address or the exact spot: the street (no number), the
// postcode district, and a map of the area. "Apply" goes to the usual application form.
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PublicShell from '@/components/public/PublicShell'
import { createServiceClient } from '@/lib/supabase'
import { loadListing, listingToken, type Listing } from '@/lib/listing/listing'
import { nearbyStations, type Station } from '@/lib/listing/area'
import ListingGallery, { ShareButton } from './ListingGallery'
import Doorstep from './Doorstep'

export const dynamic = 'force-dynamic'

// what can be said in public: no flat or house number, no full postcode — "Flat 4, 44 Claverton Street, London,
// SW1V 3AU" → "Claverton Street"; a marketing name ("The Pimlico House") is left as it is
const publicTitle = (name: string) => {
  const parts = name.split(/\s*[,\n]\s*/).map(p => p.replace(/^(flat|apartment|unit|room)\s*\w+$/i, '').replace(/^\d+[a-z]?\s+/i, '').trim())
    .filter(p => p && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(p) && !/^london$/i.test(p))
  return parts[0] || 'Room to rent'
}
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const when = (d: string | null) => !d ? 'Ask us' : d <= today() ? 'Available now' : `From ${new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`

async function load(roomId: string, token: string) {
  if (token !== listingToken(roomId)) return null
  return loadListing(createServiceClient() as any, roomId)
}

/** When nobody has written about the room yet, say what the records know — plainly, nothing invented. */
function autoDescription(l: Listing, where: string, stations: Station[]): string {
  const f = l.facts
  const kind = f.ensuite ? 'room with its own en-suite bathroom' : `${f.roomType ? f.roomType.toLowerCase() + ' ' : ''}room`.replace(/room room/, 'room')
  const first = l.wholeLet
    ? `A ${f.bedrooms ? `${f.bedrooms}-bedroom ` : ''}home on ${where}${f.furnished ? `, ${f.furnished.toLowerCase()}` : ''}${l.billsIncluded ? ', with bills included' : ''}.`
    : `A ${kind} in a ${f.roomsInHouse || f.bedrooms || ''}-bedroom house share on ${where}${f.furnished ? `, ${f.furnished.toLowerCase()}` : ''}${l.billsIncluded ? ', with bills included' : ''}.`.replace(/a -bedroom/, 'a')
  const lines = [first.replace(/\s+/g, ' ')]
  if (!l.wholeLet && f.housemates) lines.push(`You’d be sharing with ${f.housemates} ${f.housemates === 1 ? 'housemate' : 'housemates'}${f.livingRoom ? ', with a shared living room' : ''}${f.bathrooms ? ` and ${f.bathrooms} bathroom${f.bathrooms === 1 ? '' : 's'}` : ''}.`)
  if (stations[0]) lines.push(`${stations[0].name} (${stations[0].lines.slice(0, 2).join(', ') || stations[0].kinds.join(', ')}) is about a ${stations[0].walkMin}-minute walk${stations[1] ? `, and ${stations[1].name} ${stations[1].walkMin} minutes` : ''}.`)
  lines.push('Professionally managed by Capital Rooms — repairs reported in the app, and a team on hand when you need us.')
  return lines.join(' ')
}

export async function generateMetadata({ params }: { params: Promise<{ roomId: string; token: string }> }): Promise<Metadata> {
  const { roomId, token } = await params
  const l = await load(roomId, token)
  if (!l) return { title: 'Capital Rooms' }
  const where = l.displayAddress?.split(',')[0] || publicTitle(l.displayName)
  const title = `${l.headline || (l.wholeLet ? where : `${l.roomName} · ${where}`)}${l.rent ? ` — ${gbp(l.rent)} pcm` : ''}`
  const description = (l.description || `${l.wholeLet ? 'Home' : 'Room'} to rent on ${where}${l.billsIncluded ? ', bills included' : ''}. ${when(l.available)}.`).slice(0, 160)
  return { title, description, openGraph: { title, description, images: l.media.filter(m => m.kind === 'photo').slice(0, 1).map(m => m.url) }, robots: { index: false } }
}

export default async function SharedListing({ params }: { params: Promise<{ roomId: string; token: string }> }) {
  const { roomId, token } = await params
  const l = await load(roomId, token)
  if (!l) notFound()
  const f = l.facts
  const where = l.displayAddress?.split(',')[0] || publicTitle(l.displayName)
  const title = l.headline || (l.wholeLet ? where : `${l.roomName} — ${where}`)
  const photos = l.media.filter(m => m.kind === 'photo'), videos = l.media.filter(m => m.kind === 'video')
  const stations = l.approx ? await nearbyStations(l.approx.lat, l.approx.lng) : []
  const description = l.description || autoDescription(l, where, stations)
  const pw = l.rent ? Math.round(l.rent * 12 / 52) : null
  const unit = l.wholeLet ? 'home' : 'room'
  const applyHref = `/applicant/apply?roomId=${l.roomId}&propertyId=${l.propertyId}`

  // the facts strip — only what we actually know
  const keyFacts: [string, string][] = ([
    [l.wholeLet ? 'Home' : 'Room', l.wholeLet ? f.propertyType : [f.roomType, f.ensuite ? 'en-suite' : null].filter(Boolean).join(', ') || null],
    ['Size', f.roomSize ? `${f.roomSize} m²` : null],
    [l.wholeLet ? 'Bedrooms' : 'House', l.wholeLet ? (f.bedrooms ? String(f.bedrooms) : null) : (f.roomsInHouse || f.bedrooms ? `${f.roomsInHouse || f.bedrooms} bedrooms` : null)],
    ['Housemates', !l.wholeLet && f.housemates ? String(f.housemates) : null],
    ['Bathrooms', f.ensuite && !l.wholeLet ? `En-suite${f.bathrooms ? ` + ${f.bathrooms} shared` : ''}` : f.bathrooms ? String(f.bathrooms) : null],
    ['Furnished', f.furnished],
    ['Bills', l.billsIncluded == null ? null : l.billsIncluded ? 'Included' : 'Not included'],
    ['Minimum term', l.minTermMonths ? `${l.minTermMonths} months` : null],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1])

  const features = [...new Set([
    ...l.features,
    ...(f.livingRoom ? ['Shared living room'] : []),
    ...(f.hmoLicensed ? ['Licensed HMO'] : []),
    ...(l.billsIncluded ? ['Bills included'] : []),
    ...(f.furnished === 'Furnished' ? ['Fully furnished'] : []),
    'Repairs reported in the app',
  ])].slice(0, 12)

  const costs: [string, string][] = ([
    ['Rent', l.rent ? `${gbp(l.rent)} ${l.rentFrequency}${pw && l.rentFrequency === 'pcm' ? ` (${gbp(pw)} a week)` : ''}` : null],
    ['Deposit', l.deposit != null ? `£${l.deposit.toLocaleString('en-GB')}` : null],
    ['Holding deposit', l.holdingDeposit != null ? `£${l.holdingDeposit.toLocaleString('en-GB')} (one week’s rent, taken off your first payment)` : null],
    ['Bills', l.billsIncluded == null ? null : l.billsIncluded ? 'Included in the rent' : 'Paid separately'],
    ['Council tax', l.councilTax ?? (f.councilTaxBand ? `Band ${f.councilTaxBand}${!l.wholeLet && l.billsIncluded ? ' — included' : ''}` : null)],
    ['Broadband', f.broadband],
    ['Energy rating (EPC)', f.epc],
    ['Heating', f.gas ? 'Gas central heating' : null],
    ['Local council', f.council],
    ['Available', when(l.available)],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1])

  const map = l.approx ? (() => {
    const d = 0.0075   // about 800 m across — the area, not the street door
    const bbox = [l.approx.lng - d * 1.6, l.approx.lat - d, l.approx.lng + d * 1.6, l.approx.lat + d].map(n => n.toFixed(5)).join('%2C')
    return { embed: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`, link: `https://www.openstreetmap.org/#map=15/${l.approx.lat}/${l.approx.lng}` }
  })() : null

  const priceBox = (
    <div className="rounded-2xl border border-[#E4E0D8] bg-white p-5 shadow-[0_8px_30px_rgba(17,17,17,0.06)]">
      {l.rent != null ? <p className="text-[30px] font-semibold leading-none tabular-nums">{gbp(l.rent)} <span className="text-[15px] font-normal text-neutral-500">{l.rentFrequency}</span></p>
        : <p className="text-[22px] font-semibold leading-tight">Rent on request</p>}
      {pw && l.rentFrequency === 'pcm' && <p className="mt-1 text-[13px] text-neutral-500">{gbp(pw)} a week{l.billsIncluded ? ' · bills included' : ''}</p>}
      <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-800">{when(l.available)}</p>
      <dl className="mt-4 space-y-1.5 text-[13px]">
        {l.deposit != null && <div className="flex justify-between gap-3"><dt className="text-neutral-500">Deposit</dt><dd className="font-medium tabular-nums">£{l.deposit.toLocaleString('en-GB')}</dd></div>}
        {l.holdingDeposit != null && <div className="flex justify-between gap-3"><dt className="text-neutral-500">Holding deposit</dt><dd className="font-medium tabular-nums">£{l.holdingDeposit.toLocaleString('en-GB')}</dd></div>}
        {(l.councilTax || f.councilTaxBand) && <div className="flex justify-between gap-3"><dt className="text-neutral-500">Council tax</dt><dd className="text-right font-medium">{l.councilTax ?? `Band ${f.councilTaxBand}`}</dd></div>}
      </dl>
      <div className="mt-5 flex flex-col gap-2">
        <a href={applyHref} className="rounded-full bg-[#111] px-5 py-3 text-center text-[15px] font-semibold text-white">Apply for this {unit}</a>
        <a href="tel:02071129163" className="rounded-full border border-[#111] px-5 py-3 text-center text-[15px] font-semibold text-[#111]">Call to book a viewing</a>
        <ShareButton title={title} />
      </div>
      <p className="mt-3 text-[12px] text-neutral-500">The exact address is given when your viewing is booked.</p>
    </div>
  )

  return (
    <PublicShell centred label={l.wholeLet ? 'Home to rent' : 'Room to rent'}>
      <article className="mx-auto max-w-6xl px-5 pb-28 pt-6 md:px-8 md:pb-16">
        {l.status === 'let_agreed' && <p className="mb-4 rounded-lg bg-neutral-900 px-4 py-2 text-[14px] font-semibold text-white">Let agreed — this {unit} has been taken. Call us for others like it.</p>}

        <ListingGallery photos={photos.map((m, i) => ({ id: m.id, url: m.url, alt: m.caption || (m.ofRoom ? `${l.roomName}, photo ${i + 1}` : `The ${l.wholeLet ? 'home' : 'house'}, photo ${i + 1}`) }))} videoCount={videos.length} />
        {!photos.length && <div className="flex aspect-[3/1] items-center justify-center rounded-xl bg-[#F4F1EB] text-[14px] text-neutral-500">Photos coming soon</div>}

        <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <p className="pub-eyebrow">{l.displayAddress || [where, l.area].filter(Boolean).join(' · ')}</p>
            <h1 className="mt-2 text-[34px] leading-[1.08] md:text-[46px]" style={{ fontFamily: 'var(--pub-serif), serif' }}>{title}</h1>
            <p className="mt-2 text-[15px] text-neutral-600">{l.wholeLet ? f.propertyType : f.propertyType}{f.council ? ` · ${f.council}` : ''}</p>
            {/* the price, up top on a phone — on a computer it heads the box alongside */}
            <p className="mt-3 text-[26px] font-semibold leading-none tabular-nums md:hidden">
              {l.rent != null ? <>{gbp(l.rent)} <span className="text-[15px] font-normal text-neutral-500">{l.rentFrequency}{pw && l.rentFrequency === 'pcm' ? ` · ${gbp(pw)} a week` : ''}{l.billsIncluded ? ' · bills included' : ''}</span></> : <span className="text-[20px]">Rent on request</span>}
            </p>

            {/* the facts at a glance */}
            {keyFacts.length > 0 && (
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-[#E4E0D8] py-5 sm:grid-cols-4">
                {keyFacts.map(([k, v]) => (
                  <div key={k}><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{k}</dt><dd className="mt-0.5 text-[16px] font-medium">{v}</dd></div>
                ))}
              </dl>
            )}

            {/* the price box, on a phone straight after the facts */}
            <div className="mt-6 md:hidden">{priceBox}</div>

            <section className="mt-8">
              <h2 className="text-[22px]" style={{ fontFamily: 'var(--pub-serif), serif' }}>About this {unit}</h2>
              <div className="mt-3 max-w-[65ch] whitespace-pre-line text-[16px] leading-relaxed text-neutral-800">{description}</div>
            </section>

            {videos.length > 0 && (
              <section className="mt-10 space-y-3">
                <h2 className="text-[22px]" style={{ fontFamily: 'var(--pub-serif), serif' }}>Video tour</h2>
                {videos.map(v => <video key={v.id} src={v.url} controls playsInline preload="metadata" className="w-full rounded-xl bg-black" />)}
              </section>
            )}

            {features.length > 0 && (
              <section className="mt-10">
                <h2 className="text-[22px]" style={{ fontFamily: 'var(--pub-serif), serif' }}>What’s included</h2>
                <ul className="mt-3 grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
                  {features.map(x => <li key={x} className="flex gap-2"><span aria-hidden="true" className="text-emerald-700">✓</span><span>{x}</span></li>)}
                </ul>
              </section>
            )}

            {(stations.length > 0 || map) && (
              <section className="mt-10">
                <h2 className="text-[22px]" style={{ fontFamily: 'var(--pub-serif), serif' }}>Getting around</h2>
                {stations.length > 0 && (
                  <ul className="mt-3 divide-y divide-[#EFEBE3] border-y border-[#E4E0D8]">
                    {stations.map(st => (
                      <li key={st.name} className="flex items-center justify-between gap-4 py-3">
                        <span className="min-w-0">
                          <span className="block text-[15px] font-medium">{st.name}</span>
                          <span className="block truncate text-[13px] text-neutral-500">{[st.kinds.join(' · '), st.lines.slice(0, 4).join(', ')].filter(Boolean).join(' — ')}</span>
                        </span>
                        <span className="shrink-0 text-right text-[14px] tabular-nums"><span className="font-semibold">{st.walkMin} min</span> <span className="text-neutral-500">walk</span></span>
                      </li>
                    ))}
                  </ul>
                )}
                {map && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-[#E4E0D8]">
                    <iframe title={`Map of the area around ${where}`} src={map.embed} className="block h-[300px] w-full" loading="lazy" />
                    <div className="flex items-center justify-between gap-3 bg-[#F4F1EB] px-4 py-2 text-[12px] text-neutral-600">
                      <span>The area — the exact address is given when your viewing is booked.</span>
                      <a href={map.link} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-[#111] underline">Bigger map</a>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* everyday places within a short walk — looked up from the visitor's browser (see Doorstep) */}
            {l.approx && <Doorstep lat={l.approx.lat} lng={l.approx.lng} />}

            {costs.length > 0 && (
              <section className="mt-10">
                <h2 className="text-[22px]" style={{ fontFamily: 'var(--pub-serif), serif' }}>Costs and details</h2>
                <dl className="mt-3 divide-y divide-[#EFEBE3] border-y border-[#E4E0D8] text-[15px]">
                  {costs.map(([k, v]) => <div key={k} className="flex justify-between gap-6 py-2.5"><dt className="text-neutral-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
                </dl>
              </section>
            )}
          </div>

          {/* the price box, kept in view on a computer */}
          <aside className="hidden md:block"><div className="sticky top-24">{priceBox}</div></aside>
        </div>
      </article>

      {/* phone: Apply and Call always within reach */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-[#E4E0D8] bg-white/95 px-4 py-3 backdrop-blur md:hidden" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <a href={applyHref} className="flex-1 rounded-full bg-[#111] py-3 text-center text-[15px] font-semibold text-white">Apply{l.rent ? ` · ${gbp(l.rent)}` : ''}</a>
        <a href="tel:02071129163" className="rounded-full border border-[#111] px-5 py-3 text-center text-[15px] font-semibold text-[#111]">Call</a>
      </div>
    </PublicShell>
  )
}

// A room or home to rent, in the website's own look (9 Nov 2026, Harry: the listings CROS produces should match the
// website). capitalrooms.co.uk/l/<room>/<token> — every share link lands here. Same facts as before: photos, key facts,
// a price box with Apply / Call / Share, the description, what's included, nearest stations, the area map and every
// cost a renter is owed. Never the full address or the exact spot.
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { nearbyStations } from '@/lib/listing/area'
import { publicTitle, gbp, when, adTitle, extraHeadline, load, autoDescription } from '@/lib/listing/publicListing'
import { siteBase } from '@/lib/website/base'
import { Tick } from '../../../parts'
import ListingGallery, { ShareButton } from '@/app/l/[roomId]/[token]/ListingGallery'
import BackLink from '@/app/l/[roomId]/[token]/BackLink'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ roomId: string; token: string }> }): Promise<Metadata> {
  const { roomId, token } = await params
  const l = await load(roomId, token)
  if (!l) return { title: 'Not found' }
  const where = l.displayAddress?.split(',')[0] || publicTitle(l.displayName)
  const title = `${adTitle(l)}${l.rent ? `, ${gbp(l.rent)} pcm` : ''}`
  const description = (l.description || `${l.wholeLet ? 'Home' : 'Room'} to rent on ${where}${l.billsIncluded ? ', bills included' : ''}. ${when(l.available)}.`).slice(0, 160)
  return { title, description, openGraph: { title, description, images: l.media.filter(m => m.kind === 'photo').slice(0, 1).map(m => m.url) } }
}

export default async function Listing({ params }: { params: Promise<{ roomId: string; token: string }> }) {
  const { roomId, token } = await params
  const [l, b] = await Promise.all([load(roomId, token), siteBase()])
  if (!l) notFound()
  const f = l.facts
  const where = l.displayAddress?.split(',')[0] || publicTitle(l.displayName)
  const title = l.headline || adTitle(l), sub = l.headline ? adTitle(l) : extraHeadline(l, where)
  const photos = l.media.filter(m => m.kind === 'photo'), videos = l.media.filter(m => m.kind === 'video')
  const stations = l.approx ? await nearbyStations(l.approx.lat, l.approx.lng) : []
  const description = l.description || autoDescription(l, where, stations)
  const pw = l.rent ? Math.round(l.rent * 12 / 52) : null
  const unit = l.wholeLet ? 'home' : 'room'
  const applyHref = `/applicant/apply?roomId=${l.roomId}&propertyId=${l.propertyId}`
  const keyFacts = ([
    [l.wholeLet ? 'Home' : 'Room', l.wholeLet ? f.propertyType : [f.roomType, f.ensuite ? 'en-suite' : null].filter(Boolean).join(', ') || null],
    ['Size', f.roomSize ? `${f.roomSize} m²` : null],
    [l.wholeLet ? 'Bedrooms' : 'House', l.wholeLet ? (f.bedrooms ? String(f.bedrooms) : null) : (f.roomsInHouse || f.bedrooms ? `${f.roomsInHouse || f.bedrooms} bedrooms` : null)],
    ['Housemates', !l.wholeLet && f.housemates ? String(f.housemates) : null],
    ['Bathrooms', f.ensuite && !l.wholeLet ? `En-suite${f.bathrooms ? ` + ${f.bathrooms} shared` : ''}` : f.bathrooms ? String(f.bathrooms) : null],
    ['Furnished', f.furnished],
    ['Bills', l.billsIncluded == null ? null : l.billsIncluded ? 'Included' : 'Not included'],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1])
  const features = [...new Set([...l.features, ...(f.livingRoom ? ['Shared living room'] : []), ...(f.hmoLicensed ? ['Licensed HMO'] : []), ...(l.billsIncluded ? ['Bills included'] : []), ...(f.furnished === 'Furnished' ? ['Fully furnished'] : []), 'Repairs reported in the app'])].slice(0, 12)
  const costs = ([
    ['Rent', l.rent ? `${gbp(l.rent)} ${l.rentFrequency}${pw && l.rentFrequency === 'pcm' ? ` (${gbp(pw)} a week)` : ''}` : null],
    ['Deposit', l.deposit != null ? `£${l.deposit.toLocaleString('en-GB')}` : null],
    ['Holding deposit', l.holdingDeposit != null ? `£${l.holdingDeposit.toLocaleString('en-GB')} (one week’s rent, taken off your first payment)` : null],
    ['Bills', l.billsIncluded == null ? null : l.billsIncluded ? 'Included in the rent' : 'Paid separately'],
    ['Council tax', l.councilTax ?? (f.councilTaxBand ? `Band ${f.councilTaxBand}${!l.wholeLet && l.billsIncluded ? ', included' : ''}` : null)],
    ['Broadband', f.broadband], ['Energy rating (EPC)', f.epc], ['Heating', f.gas ? 'Gas central heating' : null], ['Local council', f.council], ['Available', when(l.available)],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1])
  const map = l.approx ? (() => {
    const d = 0.0075
    const bbox = [l.approx.lng - d * 1.6, l.approx.lat - d, l.approx.lng + d * 1.6, l.approx.lat + d].map(n => n.toFixed(5)).join('%2C')
    return { embed: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`, link: `https://www.openstreetmap.org/#map=15/${l.approx.lat}/${l.approx.lng}` }
  })() : null

  const priceBox = (
    <div className="card" style={{ gap: 14, boxShadow: '0 10px 30px rgba(19,34,25,.08)' }}>
      {l.rent != null ? <p className="disp" style={{ fontSize: 40, lineHeight: 1 }}>{gbp(l.rent)} <span style={{ fontFamily: 'var(--font-figtree)', fontSize: 16, fontWeight: 500, letterSpacing: 0, color: 'var(--muted)' }}>{l.rentFrequency}</span></p>
        : <p className="disp" style={{ fontSize: 28 }}>Rent on request</p>}
      {pw && l.rentFrequency === 'pcm' && <p style={{ fontSize: 15, color: 'var(--muted)' }}>{gbp(pw)} a week{l.billsIncluded ? ' · bills included' : ''}</p>}
      <p style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, background: 'var(--sage)', fontWeight: 600, fontSize: 14 }}>{when(l.available)}</p>
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px', margin: 0, fontSize: 15 }}>
        {l.deposit != null && <><dt style={{ color: 'var(--muted)' }}>Deposit</dt><dd style={{ margin: 0, fontWeight: 600 }}>£{l.deposit.toLocaleString('en-GB')}</dd></>}
        {l.holdingDeposit != null && <><dt style={{ color: 'var(--muted)' }}>Holding deposit</dt><dd style={{ margin: 0, fontWeight: 600 }}>£{l.holdingDeposit.toLocaleString('en-GB')}</dd></>}
        {(l.councilTax || f.councilTaxBand) && <><dt style={{ color: 'var(--muted)' }}>Council tax</dt><dd style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>{l.councilTax ?? `Band ${f.councilTaxBand}`}</dd></>}
      </dl>
      <a className="btn" href={applyHref}>Apply for this {unit}</a>
      <a className="line" href="tel:+442071129163">Call to book a viewing</a>
      <ShareButton title={title} />
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>The exact address is given when your viewing is booked.</p>
    </div>
  )

  return (
    <>
      <article className="wrap" style={{ paddingTop: 32 }}>
        <BackLink whole={!!l.wholeLet} />
        {l.status === 'let_agreed' && <p className="note" style={{ background: 'var(--ink)', color: 'var(--cream)', marginBottom: 16 }}>Let agreed. This {unit} has been taken. <a href={`${b}/contact`} style={{ color: 'var(--gold)' }}>Ask us</a> about others like it.</p>}
        <div style={{ borderRadius: 28, overflow: 'hidden' }}>
          <ListingGallery photos={photos.map((m, i) => ({ id: m.id, url: m.url, alt: m.caption || (m.ofRoom ? `${l.roomName}, photo ${i + 1}` : `The ${l.wholeLet ? 'home' : 'house'}, photo ${i + 1}`) }))} videoCount={videos.length} />
        </div>
        {!photos.length && <div className="ph sage" style={{ aspectRatio: '3 / 1', borderRadius: 28 }} />}

        <div className="lst-grid">
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow">{where}{f.council ? ` · ${f.council}` : ''}</p>
            <h1 className="h1" style={{ fontSize: 'clamp(34px,4.6vw,56px)', marginTop: 8 }}>{title}</h1>
            {sub && <p className="lead" style={{ marginTop: 10 }}>{sub}</p>}
            <div className="lst-phone-price">{priceBox}</div>

            {keyFacts.length > 0 && (
              <dl className="lst-facts">
                {keyFacts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            )}

            <section className="lst-sec">
              <h2 className="h3">About this {unit}</h2>
              <div style={{ whiteSpace: 'pre-line', fontSize: 17, lineHeight: 1.7, maxWidth: '65ch' }}>{description}</div>
            </section>

            {videos.length > 0 && <section className="lst-sec"><h2 className="h3">Video tour</h2>{videos.map(v => <video key={v.id} src={v.url} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: 24, background: '#000' }} />)}</section>}

            {features.length > 0 && (
              <section className="lst-sec">
                <h2 className="h3">What’s included</h2>
                <ul className="checks">{features.map(x => <li key={x}><Tick />{x}</li>)}</ul>
              </section>
            )}

            {(stations.length > 0 || map) && (
              <section className="lst-sec">
                <h2 className="h3">Getting around</h2>
                {stations.length > 0 && (
                  <ul className="card" style={{ listStyle: 'none', margin: 0, padding: '8px 24px', gap: 0 }}>
                    {stations.map(st => (
                      <li key={st.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderTop: '1px solid var(--line)' }}>
                        <span style={{ minWidth: 0 }}><strong style={{ display: 'block' }}>{st.name}</strong><span style={{ fontSize: 14, color: 'var(--muted)' }}>{[st.kinds.join(' · '), st.lines.slice(0, 4).join(', ')].filter(Boolean).join(', ')}</span></span>
                        <span style={{ whiteSpace: 'nowrap' }}><strong>{st.walkMin} min</strong> <span style={{ color: 'var(--muted)' }}>walk</span></span>
                      </li>
                    ))}
                  </ul>
                )}
                {map && (
                  <div style={{ marginTop: 16, borderRadius: 24, overflow: 'hidden', background: '#fff' }}>
                    <iframe title={`Map of the area around ${where}`} src={map.embed} style={{ display: 'block', width: '100%', height: 320, border: 0 }} loading="lazy" />
                    <p style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 18px', fontSize: 14, color: 'var(--muted)' }}><span>The area only. The exact address is given when your viewing is booked.</span><a href={map.link} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Bigger map</a></p>
                  </div>
                )}
              </section>
            )}

            {costs.length > 0 && (
              <section className="lst-sec">
                <h2 className="h3">Costs and details</h2>
                <dl className="card" style={{ margin: 0, padding: '8px 24px', gap: 0 }}>
                  {costs.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '12px 0', borderTop: '1px solid var(--line)' }}><dt style={{ color: 'var(--muted)' }}>{k}</dt><dd style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>{v}</dd></div>)}
                </dl>
              </section>
            )}
          </div>
          <aside className="lst-aside"><div style={{ position: 'sticky', top: 110 }}>{priceBox}</div></aside>
        </div>
      </article>

      {/* phone: Apply and Call always within reach */}
      <div className="lst-bar">
        <a className="btn" href={applyHref} style={{ flex: 1 }}>Apply{l.rent ? ` · ${gbp(l.rent)}` : ''}</a>
        <a className="line" href="tel:+442071129163">Call</a>
      </div>
    </>
  )
}

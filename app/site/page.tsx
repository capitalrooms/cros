// The homepage (9 Nov 2026 rebuild): sells what Capital Rooms actually does now — a personal agent backed by its own
// software (CROS): the landlord portal, the tenant app, online move-ins, compliance tracked, repairs with no mark-up.
import Link from 'next/link'
import { siteBase } from '@/lib/website/base'
import { TIERS, STEPS } from '@/lib/website/site'
import { Photo, Tick, Reviews, Badges } from './parts'
import { LandlordPhone, TenantPhone } from './Showcase'
import HomesStrip from './HomesStrip'

const LANDLORD_FEATURES: [string, string][] = [
  ['Your own landlord portal', 'Monthly statements, certificates, documents and every repair, live, on your phone.'],
  ['Compliance on autopilot', 'Gas, electrics, EPC, fire safety and HMO licences tracked, with renewals booked before they lapse.'],
  ['Repairs, sorted fast', 'Tenants report with photos, we compare quotes from trusted trades and never mark up an invoice.'],
  ['Tax-ready paperwork', 'Clear statements every month and an annual summary set out the way your accountant wants it.'],
  ['Ideas that raise the rent', 'Planning a refresh? We show you redesign ideas for a room before you spend a penny.'],
]
const TENANT_FEATURES: [string, string][] = [
  ['Move in from your phone', 'Apply, reference, sign and pay online. No printing, no office visits.'],
  ['Report a repair in seconds', 'Snap a photo in the app and see when it’s booked.'],
  ['Everything about your home', 'Wi-Fi, bins, cleaning days and house rules, in one place.'],
  ['Meet your housemates', 'Say hello before you move in.'],
]
const AREAS = ['Canada Water', 'Rotherhithe', 'Surrey Quays', 'Stratford', 'Deptford', 'Canary Wharf', 'Poplar', 'Custom House', 'East Ham', 'Crystal Palace', 'Wandsworth', 'Pimlico', 'Bermondsey']

export default async function Home() {
  const b = await siteBase()
  return (
    <>
      {/* banner */}
      <section className="hero" aria-label="Capital Rooms">
        <Photo k="hero" className="hero-ph tint" eager alt="Tower Bridge and the Thames at sunset" />
        <div className="shade" />
        <div className="copy">
          <p className="pill load">Independent London lettings &amp; management</p>
          <h1 className="h1 load2">The personal service<br />big agencies can’t give.</h1>
          <p className="lead load3">A real team who answer, backed by our own app: live repairs, monthly statements and every certificate tracked for you.</p>
          <div className="load3" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link className="gold" href={`${b}/instant_valuation`}>Get a free valuation</Link>
            <Link className="ghost" href={`${b}/residential-lettings`}>Find a home</Link>
          </div>
        </div>
      </section>

      {/* trust */}
      <section className="trust"><div className="wrap trust-row">
        <Link href={`${b}/testimonial`} className="trust-rating"><b>★★★★★</b><span><strong>4.9 on Google</strong> from our landlords and tenants</span></Link>
        <Badges />
      </div></section>

      {/* landlords: the portal */}
      <section className="block"><div className="wrap show">
        <div>
          <p className="eyebrow rise">For landlords</p>
          <h2 className="h2 rise" style={{ margin: '8px 0 14px' }}>See everything.<br />Worry about nothing.</h2>
          <p className="lead rise" style={{ marginBottom: 24 }}>Our own software runs every property we manage, so you get the answers a big agency can’t give you, without the wait.</p>
          <ol className="feats">
            {LANDLORD_FEATURES.map(([t, d], i) => <li key={t} className="rise"><span className="n">{String(i + 1).padStart(2, '0')}</span><span><strong>{t}</strong><span>{d}</span></span></li>)}
          </ol>
          <p className="rise" style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="btn" href={`${b}/landlords`}>Landlord services</Link><Link className="line" href={`${b}/instant_valuation`}>Free valuation</Link></p>
        </div>
        <div className="show-phone"><LandlordPhone /></div>
      </div></section>

      {/* tenants: the app */}
      <section className="block dark-block"><div className="wrap show rev">
        <div className="show-phone"><TenantPhone /></div>
        <div>
          <p className="eyebrow rise" style={{ color: 'var(--lime)' }}>For tenants</p>
          <h2 className="h2 rise" style={{ margin: '8px 0 14px' }}>A home that<br />just works.</h2>
          <p className="lead rise" style={{ marginBottom: 24, color: '#C9D6CC' }}>Well-kept homes and rooms across London, with an app that keeps everything simple, from the day you apply to the day you move on.</p>
          <ol className="feats light">
            {TENANT_FEATURES.map(([t, d], i) => <li key={t} className="rise"><span className="n">{String(i + 1).padStart(2, '0')}</span><span><strong>{t}</strong><span>{d}</span></span></li>)}
          </ol>
          <p className="rise" style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="gold" href={`${b}/residential-lettings`}>Homes to rent</Link><Link className="ghost" href={`${b}/tenants`}>Renting with us</Link></p>
        </div>
      </div></section>

      {/* fees */}
      <section className="block" id="fees"><div className="wrap">
        <p className="eyebrow rise">Simple fees</p>
        <h2 className="h2 rise" style={{ margin: '8px 0 36px', maxWidth: 820 }}>Pick the level of help you want.</h2>
        <div className="grid3" style={{ alignItems: 'stretch' }}>
          {TIERS.map(t => (
            <div key={t.name} className={`tier rise ${t.tone}`}>
              <span style={{ fontWeight: 600, opacity: .85 }}>{t.name}</span>
              <span className="fee">{t.fee.replace(' + VAT', '')}<small>+ VAT</small></span>
              <span style={{ opacity: .85 }}>{t.lead}</span>
              <ul>{t.items.slice(0, 5).map(i => <li key={i}><Tick />{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </div></section>

      {/* how a let works */}
      <section className="block"><div className="wrap">
        <p className="eyebrow rise">How it works</p>
        <h2 className="h2 rise" style={{ margin: '8px 0 32px', maxWidth: 820 }}>From valuation to keys, and every year after.</h2>
        <ol className="steps5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STEPS.map((s, i) => <li key={s.title} className="s rise"><span className="n">{i + 1}</span><h3 className="h3" style={{ fontSize: 22 }}>{s.title}</h3><p style={{ color: 'var(--muted)', fontSize: 16 }}>{s.body}</p></li>)}
        </ol>
      </div></section>

      {/* where we work */}
      <section className="block"><div className="wrap">
        <p className="eyebrow rise">Where we work</p>
        <h2 className="h2 rise" style={{ margin: '8px 0 24px' }}>East, south-east and across London.</h2>
      </div>
        <div className="marquee" aria-label={`Areas we cover: ${AREAS.join(', ')}`}>
          <div className="marquee-track" aria-hidden="true">{[...AREAS, ...AREAS].map((a, i) => <span key={i}>{a}</span>)}</div>
        </div>
      </section>

      {/* homes */}
      <section className="block"><div className="wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginBottom: 28 }}>
          <div><p className="eyebrow rise">To rent now</p><h2 className="h2 rise" style={{ marginTop: 8 }}>Free right now.</h2></div>
          <Link className="line" href={`${b}/residential-lettings`}>All homes to rent</Link>
        </div>
        <HomesStrip />
      </div></section>

      {/* reviews */}
      <section className="block"><div className="wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginBottom: 32 }}>
          <h2 className="h2 rise">What people say</h2>
          <Link className="line" href={`${b}/testimonial`}>All reviews</Link>
        </div>
        <Reviews limit={3} />
      </div></section>

      {/* close */}
      <section className="block" style={{ padding: '110px 16px 0' }}>
        <div className="band closer">
          <Photo k="landlords" className="drift tint" alt="A white Georgian terrace in London" />
          <div className="shade" />
          <div className="copy rise">
            <h2 className="h2">Thinking of letting?</h2>
            <p style={{ fontSize: 19, color: '#E4EBE3', maxWidth: 520 }}>Find out what your property should let for, and how much less work it could be.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}><Link className="gold" href={`${b}/instant_valuation`}>Get a free valuation</Link><a className="ghost" href="tel:+442071129163">Call 0207 112 9163</a></div>
          </div>
        </div>
      </section>
    </>
  )
}

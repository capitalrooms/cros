import Link from 'next/link'
import { siteBase } from '@/lib/website/base'
import { TIERS, STEPS } from '@/lib/website/site'
import { Photo, Tick, Reviews, Badges } from './parts'
import { TenantCalc } from './Calculators'

export default async function Home() {
  const b = await siteBase()
  return (
    <>
      <section className="hero" aria-label="Capital Rooms">
        <Photo k="hero" className="hero-ph" alt="The Thames and the City of London" />
        <div className="shade" />
        <div className="copy">
          <p className="pill load">Independent London lettings &amp; management</p>
          <h1 className="h1 load2">London lettings,<br />done properly.</h1>
          <p className="lead load3">We let and look after homes across London for landlords who want a personal service — and we look after the people who live in them.</p>
          <div className="load3" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link className="gold" href={`${b}/landlords`}>I’m a landlord</Link>
            <Link className="ghost" href={`${b}/residential-lettings`}>I’m looking for a home</Link>
          </div>
        </div>
      </section>

      <section className="block"><div className="wrap">
        <div className="rise" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'end', gap: 24, marginBottom: 36 }}>
          <h2 className="h2">How can we help?</h2>
          <p className="lead" style={{ maxWidth: 380 }}>One small team, from the first viewing to the day the tenancy ends.</p>
        </div>
        <div className="grid3">
          <Link className="who rise" href={`${b}/landlords`}><Photo k="landlords" alt="A London terrace" /><div className="txt"><span className="disp" style={{ fontSize: 34, lineHeight: 1 }}>Landlords</span><span style={{ color: '#E4EBE3' }}>Let only, fully managed, or HMO management.</span></div></Link>
          <Link className="who rise" href={`${b}/residential-lettings`}><Photo k="tenants" alt="A London street" /><div className="txt"><span className="disp" style={{ fontSize: 34, lineHeight: 1 }}>Tenants</span><span style={{ color: '#E4EBE3' }}>Flats, houses and rooms across London.</span></div></Link>
          <Link className="who rise" href={`${b}/instant_valuation`}><Photo k="valuation" alt="London canal and warehouses" /><div className="txt"><span className="disp" style={{ fontSize: 34, lineHeight: 1 }}>Valuations</span><span style={{ color: '#E4EBE3' }}>What your property should let for, today.</span></div></Link>
        </div>
      </div></section>

      <section className="block" id="fees"><div className="wrap">
        <p className="eyebrow rise">For landlords</p>
        <h2 className="h2 rise" style={{ margin: '8px 0 36px', maxWidth: 820 }}>Pick the level of help you want.</h2>
        <div className="grid3" style={{ alignItems: 'stretch' }}>
          {TIERS.map(t => (
            <div key={t.name} className={`tier rise ${t.tone}`}>
              <span style={{ fontWeight: 600, opacity: .85 }}>{t.name}</span>
              <span className="fee">{t.fee}</span>
              <span style={{ opacity: .85 }}>{t.lead}</span>
              <ul>{t.items.slice(0, 5).map(i => <li key={i}><Tick />{i}</li>)}</ul>
            </div>
          ))}
        </div>
        <p className="rise" style={{ marginTop: 24 }}><Link href={`${b}/landlords`} style={{ fontWeight: 600 }}>Everything included, and our Rent Guarantee →</Link></p>
      </div></section>

      <section className="block"><div className="wrap story">
        <div className="pin"><Photo k="keys" className="grow" alt="Keys handed over at a London front door" /></div>
        <div>
          <p className="eyebrow">How it works</p>
          <h2 className="h2" style={{ margin: '8px 0 20px' }}>From valuation to keys — and every year after.</h2>
          {STEPS.map((s, i) => (
            <div key={s.title} className="step">
              <span style={{ fontSize: 14, fontWeight: 600, color: '#6B7A70' }}>{['One', 'Two', 'Three', 'Four', 'Five'][i]}</span>
              <h3 className="h3">{s.title}</h3>
              <p style={{ color: 'var(--muted)' }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div></section>

      <section className="block" style={{ padding: '110px 16px 0' }}>
        <div className="band">
          <Photo k="rooftops" className="drift" alt="London rooftops" />
          <div className="shade" />
          <div className="copy rise">
            <h2 className="h2">A personal service,<br />right across London.</h2>
            <p style={{ fontSize: 18, color: '#E4EBE3' }}>One team that knows your property by name.</p>
          </div>
        </div>
      </section>

      <section className="block rise"><div className="wrap"><TenantCalc compact /></div></section>

      <section className="block"><div className="wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginBottom: 32 }}>
          <h2 className="h2 rise">What people say</h2>
          <Link className="line" href={`${b}/testimonial`}>All reviews</Link>
        </div>
        <Reviews limit={3} />
      </div></section>

      <section className="block"><div className="wrap"><Badges /></div></section>
    </>
  )
}

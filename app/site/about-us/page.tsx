import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { PageTop, Badges } from '../parts'
import { TEAM, GOOGLE_RATING, FOUNDER_QUOTE } from '@/lib/website/site'

export const metadata: Metadata = { title: 'About Us: Independent London Letting Agent', description: 'Capital Rooms is an independent letting and property management agency in Shoreditch, looking after landlords, tenants and shared homes across London.', alternates: { canonical: '/about-us' } }

export default async function About() {
  const b = await siteBase()
  return (
    <>
      <PageTop eyebrow="About us" title="The agent people leave the big agencies for." photo="about" />
      <section className="block" style={{ paddingTop: 64 }}><div className="wrap"><div className="prose rise">
        <p>Capital Rooms is an independent letting and property management agency, looking after landlords’ properties across London since 2018. We manage shared houses and single lets, mostly in east and south east London, and we’re rated {GOOGLE_RATING.stars} out of 5 from {GOOGLE_RATING.count} reviews on Google.</p>
        <p>We stay deliberately small. Every landlord has one person to call, who knows their property and answers the phone. We keep you compliant as the rules change, chase rent quickly, fix things properly and show you exactly where your money has gone, with every statement, invoice and certificate in your own landlord app.</p>
        <p>For tenants, that means well-kept, fully furnished homes, often with bills included, shared with likeminded housemates you can meet before you move in. Happy tenants stay longer, which is good for everyone.</p>
        <p>We’re members of The Property Ombudsman, client money is protected with ClientMoney Protect, and every deposit is registered with the DPS.</p>
        <p style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="btn" href={`${b}/landlords`}>For landlords</Link><Link className="line" href={`${b}/contact`}>Contact us</Link></p>
      </div></div></section>
      <section className="block" id="team"><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div><p className="eyebrow rise" style={{ margin: 0 }}>Meet the team</p><h2 className="h2 rise" style={{ margin: '8px 0 0' }}>A small team you’ll actually know.</h2></div>
        <figure className="founder-quote rise">
          <blockquote>“{FOUNDER_QUOTE}”</blockquote>
          <figcaption><strong>Harry</strong>, founder</figcaption>
        </figure>
        <div className="team">
          {TEAM.map(t => (
            <article key={t.name} className="team-card rise">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <div className="team-face" aria-hidden={!t.photo}>{t.photo ? <img src={t.photo} alt={t.name} /> : <span className="disp">{t.name[0]}</span>}</div>
              <div><h3 className="h3" style={{ margin: 0 }}>{t.name}</h3><p className="team-role">{t.role}</p></div>
              <p className="team-bio">{t.bio}</p>
            </article>
          ))}
        </div>
      </div></section>
      <section className="block"><div className="wrap"><Badges /></div></section>
    </>
  )
}

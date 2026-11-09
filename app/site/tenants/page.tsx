// Tenants (9 Nov 2026 rebuild): what renting with Capital Rooms is like now — repairs sorted fast in the app, knowing
// your housemates, moving in from your phone — each shown as the app.
import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { PageTop, Tick, Reviews } from '../parts'
import { TenantPhone, HousePhone, MoveInPhone, Benefits } from '../Showcase'
import { TenantCalc } from '../Calculators'

export const metadata: Metadata = { title: 'Tenants', description: 'Renting with Capital Rooms: repairs reported and sorted in our app, meet your housemates before you move, and move in from your phone.' }

const ROWS: { eyebrow: string; title: string; body: string; points: string[]; phone: React.ReactNode }[] = [
  { eyebrow: 'Repairs', title: 'Something broken? Sorted.', body: 'Report it in the app with a photo and you’ll see exactly when it’s booked. Our contractors turn up when they say, and you’re kept in the loop the whole way.', points: ['Report in seconds, with photos', 'See the visit day and time', 'Emergencies answered day or night'], phone: <TenantPhone /> },
  { eyebrow: 'Your housemates', title: 'Know who you’re living with.', body: 'Shared homes work best when people know each other. Meet your housemates in the app before you move in, and everyone knows the house rules from day one.', points: ['Say hello before you arrive', 'Cleaning days, bins and Wi-Fi in one place', 'House guides for the heating, appliances and more'], phone: <HousePhone /> },
  { eyebrow: 'Moving in', title: 'Move in from your phone.', body: 'Apply, reserve, reference and sign online. No printing, no office visits, and you can see where you are at every step.', points: ['References online with Homeppl', 'Agreement signed on your phone', 'Deposit protected with the DPS'], phone: <MoveInPhone /> },
]
const INCLUDED = ['Bills included in our shared homes', 'Fully furnished rooms', 'Regular cleaner in shared homes', 'Fast Wi-Fi', 'Repairs tracked in the app', '24/7 emergency line', 'No hidden fees', 'Deposit protected with the DPS', 'A team who answer']

export default async function Tenants() {
  const b = await siteBase()
  return (
    <>
      <PageTop eyebrow="For tenants" title="A home that just works." photo="tenants" lead="Well-kept homes and rooms across London, repairs sorted quickly, and housemates you actually know.">
        <div className="load3" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="btn" href={`${b}/residential-lettings`}>Homes to rent</Link><Link className="line" href={`${b}/shared-accommodation`}>Rooms in shared homes</Link></div>
      </PageTop>

      <div className="wrap">
        {ROWS.map(r => (
          <section key={r.title} className="frow">
            <div className="frow-text">
              <p className="eyebrow rise">{r.eyebrow}</p>
              <h2 className="h2 rise">{r.title}</h2>
              <p className="lead rise">{r.body}</p>
              <ul className="rise">{r.points.map(p => <li key={p}><Tick />{p}</li>)}</ul>
            </div>
            <div className="show-phone">{r.phone}</div>
          </section>
        ))}
      </div>

      <section className="block"><div className="wrap">
        <p className="eyebrow rise">The Capital Rooms app</p>
        <h2 className="h2 rise" style={{ margin: '8px 0 12px' }}>Your home, in your pocket.</h2>
        <p className="lead rise" style={{ marginBottom: 32 }}>Free with every tenancy. Add it to your phone’s home screen in ten seconds.</p>
        <Benefits items={[
          ['wrench', 'Report a repair', 'Describe it, add a photo, done. No phone tag.'],
          ['bell', 'Know when we’re coming', 'Visit days and times sent to you, never a surprise knock.'],
          ['people', 'Meet your housemates', 'Profiles and a hello before you move in.'],
          ['home', 'House guide', 'Wi-Fi, bins, heating and appliances explained.'],
          ['broom', 'Cleaning days', 'See when the cleaner is in and what’s covered.'],
          ['phone', 'Emergency line', 'Something serious? Reach us day or night.'],
          ['key', 'Move-in pack', 'Everything you need for day one, in one place.'],
          ['pen', 'Sign online', 'Your agreement signed on your phone in minutes.'],
          ['mail', 'Messages in one place', 'Updates from us, not lost in your inbox.'],
        ]} />
      </div></section>

      <section className="block"><div className="wrap">
        <p className="eyebrow rise">Renting with us</p>
        <h2 className="h2 rise" style={{ margin: '8px 0 28px' }}>What you get.</h2>
        <ul className="incl">{INCLUDED.map(x => <li key={x} className="rise"><Tick />{x}</li>)}</ul>
      </div></section>

      <section className="block rise"><div className="wrap"><TenantCalc /><p style={{ marginTop: 14 }}><Link href={`${b}/page/9-guarantor-affordability-calculator`} style={{ fontWeight: 600 }}>Need a guarantor? Use the guarantor calculator →</Link></p></div></section>

      <section className="block"><div className="wrap"><h2 className="h2 rise" style={{ marginBottom: 32 }}>What our tenants say</h2><Reviews only="Tenant" limit={6} /></div></section>

      <section className="block" style={{ padding: '110px 16px 0' }}>
        <div className="band closer" style={{ minHeight: 360 }}>
          <div className="copy rise">
            <h2 className="h2">Find your next home.</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}><Link className="gold" href={`${b}/residential-lettings`}>Homes to rent</Link><Link className="ghost" href={`${b}/contact`}>Ask us anything</Link></div>
          </div>
        </div>
      </section>
    </>
  )
}

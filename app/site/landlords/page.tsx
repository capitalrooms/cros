// Landlords (9 Nov 2026 rebuild): what a landlord gets with Capital Rooms now — the portal, compliance tracked,
// repairs with no mark-up, statements and tax summaries, letting done properly, refresh ideas — each shown as the app.
import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { TIERS } from '@/lib/website/site'
import { PageTop, Tick, Reviews } from '../parts'
import { LandlordPhone, CompliancePhone, RepairPhone, StatementPhone, LettingPhone, ExpensesPhone, Benefits } from '../Showcase'
import Enquiry from '../Enquiry'

export const metadata: Metadata = { title: 'Landlords', description: 'Let only 5%, single let 8%, HMO management 12% (+ VAT). Your own landlord portal, compliance tracked, repairs with no mark-up, clear statements.' }

const ROWS: { eyebrow: string; title: string; body: string; points: string[]; phone: React.ReactNode }[] = [
  { eyebrow: 'Your landlord portal', title: 'Your property, on your phone.', body: 'Sign in any time to see how your property is doing. No chasing, no waiting for a call back.', points: ['Monthly statements and every payment', 'Certificates, agreements and inventories', 'Repairs as they happen, with photos'], phone: <LandlordPhone /> },
  { eyebrow: 'Your certificate window', title: 'Every certificate, in one place.', body: 'Gas, electrics, EPC, fire safety and HMO licences, tracked for every property. We book renewals before they’re due, and every new certificate is emailed to you and filed in your portal.', points: ['Each new certificate emailed to you', 'Renewals booked before anything lapses', 'HMO licences applied for and tracked'], phone: <CompliancePhone /> },
  { eyebrow: 'Repairs', title: 'Fixed fast. Fairly priced.', body: 'Tenants report repairs with photos in their app. We compare quotes, you approve anything over your limit, and the visit time goes to the house automatically.', points: ['Quotes compared from trusted trades', 'No mark-up on any invoice', 'Before and after photos'], phone: <RepairPhone /> },
  { eyebrow: 'Every expense itemised', title: 'Know exactly where every pound went.', body: 'Every repair, certificate and bill is its own line, sorted by category, with the contractor’s invoice and photos attached. See the year at a glance, or drill into a single job.', points: ['Each job its own line, invoice attached', 'Totals by category through the year', 'Nothing bundled, nothing marked up'], phone: <ExpensesPhone /> },
  { eyebrow: 'Statements', title: 'Money you can follow.', body: 'A clear statement every month, with every invoice behind it, and a yearly summary set out the way your accountant wants it.', points: ['Client money protected', 'PDF or spreadsheet, any month', 'Tax-ready annual summary'], phone: <StatementPhone /> },
  { eyebrow: 'Finding tenants', title: 'Let quickly, to the right people.', body: 'Professional photos and an advert on every major portal, viewings booked online, and full referencing before anyone signs.', points: ['Referenced by Homeppl, right to rent checked', 'Agreements signed online', 'Deposits protected with the DPS'], phone: <LettingPhone /> },
]
const INCLUDED = ['Your own landlord portal', 'Monthly statements', 'Compliance tracking and renewals', 'Repairs with no mark-up', 'Quarterly inspections', '24/7 emergency line for tenants', 'Professional photography', 'Advertising on the major portals', 'Referencing and right to rent checks', 'Agreements signed online', 'Deposits protected with the DPS', 'HMO licensing handled', 'Rent reviews done properly', 'Redesign ideas before a refresh', 'Annual summary for your tax return']

export default async function Landlords() {
  const b = await siteBase()
  return (
    <>
      <PageTop eyebrow="For landlords" title="Fewer empty weeks. Fewer headaches." photo="landlords"
        lead="Lettings and management across London from a team that answers, backed by our own software. Most of our landlords came to us from big agencies.">
        <div className="load3" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="btn" href={`${b}/instant_valuation`}>Get a free valuation</Link><a className="line" href="#fees">Our fees</a></div>
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
        <h2 className="h2 rise" style={{ margin: '8px 0 12px' }}>Everything the app does for you.</h2>
        <p className="lead rise" style={{ marginBottom: 32 }}>Built by us, for the way we run your property. It’s the reason we answer quickly and nothing slips.</p>
        <Benefits items={[
          ['wrench', 'Live repair tracking', 'Follow every job from the tenant’s photo to the finished work.'],
          ['receipt', 'Itemised expenses', 'Each repair and bill on its own line, with the invoice attached.'],
          ['shield', 'Certificate window', 'All your certificates in one place, new ones emailed to you.'],
          ['doc', 'Monthly statements', 'PDF or spreadsheet, for any month, whenever you want them.'],
          ['chart', 'Tax-ready summaries', 'Your year’s income and costs, by category, for your tax return.'],
          ['check', 'Approve on the go', 'Anything over your limit waits for your OK, with the quotes side by side.'],
          ['camera', 'Inspection reports', 'Photo reports after every inspection, so you can see the condition yourself.'],
          ['mail', 'New tenant summaries', 'Who’s moving in, their references and the paperwork, sent to you.'],
          ['phone', 'Emergency cover', 'Tenants reach us day or night, so small problems don’t become big ones.'],
          ['broom', 'Shared houses run well', 'Cleaners scheduled and checked, shared areas looked after.'],
          ['people', 'Tenants who stay', 'Housemates introduced and repairs sorted fast, so good tenants renew.'],
          ['sparkle', 'Refresh ideas', 'See redesign ideas for a room before you spend anything on it.'],
        ]} />
      </div></section>

      <section className="block dark-block" id="fees"><div className="wrap">
        <p className="eyebrow rise" style={{ color: 'var(--lime)' }}>Simple fees</p>
        <h2 className="h2 rise" style={{ margin: '8px 0 36px' }}>Pick the level of help you want.</h2>
        <div className="grid3" style={{ alignItems: 'stretch' }}>
          {TIERS.map(t => (
            <div key={t.name} className={`tier rise ${t.tone === 'dark' ? 'soft' : ''}`} style={{ color: 'var(--ink)' }}>
              <span style={{ fontWeight: 600, opacity: .85 }}>{t.name}</span>
              <span className="fee">{t.fee.replace(' + VAT', '')}<small>+ VAT</small></span>
              <span style={{ opacity: .85 }}>{t.lead}</span>
              <ul>{t.items.map(i => <li key={i}><Tick />{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </div></section>

      <section className="block"><div className="wrap">
        <p className="eyebrow rise">With full management</p>
        <h2 className="h2 rise" style={{ margin: '8px 0 28px' }}>Everything that’s included.</h2>
        <ul className="incl">{INCLUDED.map(x => <li key={x} className="rise"><Tick />{x}</li>)}</ul>
      </div></section>

      <section className="block"><div className="wrap">
        <h2 className="h2 rise" style={{ marginBottom: 32 }}>What our landlords say</h2>
        <Reviews only="Landlord" limit={6} />
      </div></section>

      <section className="block" id="enquire"><div className="wrap grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2">Tell us about your property</h2>
          <p className="lead">Whether it’s one flat or a portfolio of shared houses, we’ll come back to you the same day.</p>
          <p><a href="tel:+442071129163" className="disp" style={{ fontSize: 30, textDecoration: 'none' }}>0207 112 9163</a></p>
        </div>
        <div className="card">
          <Enquiry kind="landlord" submit="Send enquiry" fields={[
            { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'phone', label: 'Phone number', type: 'tel' }, { name: 'rooms', label: 'Rooms in property', type: 'number' },
            { name: 'area', label: 'Area' }, { name: 'service', label: 'Service required', type: 'select', options: ['Let only', 'Full management', 'HMO management', 'Not sure yet'] },
            { name: 'message', label: 'Message', type: 'textarea' },
          ]} />
        </div>
      </div></section>
    </>
  )
}

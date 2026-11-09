import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { TIERS, RENT_GUARANTEE } from '@/lib/website/site'
import { PageTop, Tick, Reviews } from '../parts'
import Enquiry from '../Enquiry'

export const metadata: Metadata = { title: 'Landlords', description: 'Let only 5%, single let management 8%, HMO management 12%, and a Rent Guarantee. Independent London letting and management.' }

export default async function Landlords() {
  const b = await siteBase()
  return (
    <>
      <PageTop eyebrow="For landlords" title="Fewer empty weeks. Fewer headaches." photo="landlords"
        lead="If you are looking for assistance with a single let or HMO property, we can advise you on the best strategy to maximise your return. If you have a property and are not quite sure how to move forward with it, or are looking to purchase an investment property, contact us today to see how we can assist you.">
        <div className="load3" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="btn" href={`${b}/instant_valuation`}>Free valuation</Link><a className="line" href="#enquire">Ask us anything</a></div>
      </PageTop>

      <section className="block"><div className="wrap">
        <h2 className="h2 rise" style={{ marginBottom: 32 }}>Our fees</h2>
        <div className="grid3" style={{ alignItems: 'stretch' }}>
          {TIERS.map(t => (
            <div key={t.name} className={`tier rise ${t.tone}`}>
              <span style={{ fontWeight: 600, opacity: .85 }}>{t.name}</span>
              <span className="fee">{t.fee.replace(' + VAT', '')}<small>+ VAT</small></span>
              <span style={{ opacity: .85 }}>{t.lead}</span>
              <ul>{t.items.map(i => <li key={i}><Tick />{i}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="tier rise" style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontWeight: 600 }}>Rent Guarantee</span>
            <span className="disp" style={{ fontSize: 40, lineHeight: 1 }}>A full, stress-free solution.</span>
          </div>
          <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>{RENT_GUARANTEE.map(i => <li key={i}><Tick />{i}</li>)}</ul>
        </div>
      </div></section>

      <section className="block"><div className="wrap">
        <h2 className="h2 rise" style={{ marginBottom: 32 }}>What our landlords say</h2>
        <Reviews only="Landlord" limit={6} />
      </div></section>

      <section className="block" id="enquire"><div className="wrap grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2">Tell us about your property</h2>
          <p className="lead">High rental yields and entirely stress-free management have earned us fantastic testimonials from our landlords. We’ll come back to you the same day.</p>
        </div>
        <div className="card">
          <Enquiry kind="landlord" submit="Send enquiry" fields={[
            { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'phone', label: 'Phone number', type: 'tel' }, { name: 'rooms', label: 'Rooms in property', type: 'number' },
            { name: 'area', label: 'Area' }, { name: 'service', label: 'Service required', type: 'select', options: ['Let only', 'Full management', 'HMO management', 'Rent Guarantee', 'Not sure yet'] },
            { name: 'message', label: 'Message', type: 'textarea' },
          ]} />
        </div>
      </div></section>
    </>
  )
}

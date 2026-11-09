import type { Metadata } from 'next'
import { PageTop, Tick } from '../parts'
import Enquiry from '../Enquiry'

export const metadata: Metadata = { title: 'Maintenance services', description: 'Trusted contractors, transparent pricing with no mark-up on invoices, and proactive maintenance.' }
const APPROACH: [string, string][] = [
  ['Collaborative contractor partnerships', 'We work with a trusted network of contractors to deliver high-quality services at competitive prices.'],
  ['Transparent pricing', 'Unlike some agencies, we don’t mark up invoices. Landlords only pay the fairest price for works carried out.'],
  ['Proactive maintenance', 'Regular property inspections help us identify and address potential issues before they become larger problems.'],
  ['Efficient issue resolution', 'With a streamlined reporting system, maintenance concerns are resolved quickly to minimise disruption for tenants and landlords.'],
]
const BENEFITS: [string, string][] = [['Cost-effective solutions', 'Competitive pricing with no hidden fees.'], ['Quality assurance', 'Vetted contractors ensuring top-tier service.'], ['Peace of mind', 'Transparent, proactive, and reliable maintenance to protect your property investment.']]

export default function Maintenance() {
  return (
    <>
      <PageTop eyebrow="Maintenance services" title="Looked after, properly." photo="maintenance" lead="At Capital Rooms, we prioritise the upkeep and maintenance of your property to ensure it remains in excellent condition for both landlords and tenants. Our dedicated team works diligently to address any issues promptly and efficiently." />
      <section className="block"><div className="wrap">
        <h2 className="h2 rise" style={{ marginBottom: 28 }}>Our approach</h2>
        <div className="grid2">{APPROACH.map(([t, d]) => <div key={t} className="card rise"><h3 className="h3">{t}</h3><p style={{ color: 'var(--muted)' }}>{d}</p></div>)}</div>
      </div></section>
      <section className="block"><div className="wrap">
        <div className="tier dark rise" style={{ gap: 20 }}>
          <h2 className="h2">Why it pays</h2>
          <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 20, fontSize: 17 }}>{BENEFITS.map(([t, d]) => <li key={t} style={{ flexDirection: 'column' }}><strong style={{ display: 'flex', gap: 8 }}><Tick />{t}</strong><span style={{ opacity: .85 }}>{d}</span></li>)}</ul>
          <p style={{ opacity: .9 }}>At Capital Rooms, we provide honest, efficient, and cost-effective maintenance services designed to benefit both landlords and tenants.</p>
        </div>
      </div></section>
      <section className="block"><div className="wrap grid2" style={{ alignItems: 'start' }}>
        <h2 className="h2">Just need a quote for a job?</h2>
        <div className="card"><Enquiry kind="maintenance" submit="Ask for a quote" fields={[
          { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'phone', label: 'Phone number', type: 'tel' }, { name: 'postcode', label: 'Postcode' },
          { name: 'job', label: 'What’s the job?', full: true }, { name: 'message', label: 'Details', type: 'textarea', required: true },
        ]} /></div>
      </div></section>
    </>
  )
}

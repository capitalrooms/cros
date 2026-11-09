import type { Metadata } from 'next'
import { PageTop } from '../parts'
import Enquiry from '../Enquiry'

export const metadata: Metadata = { title: 'Free Rental Valuation in London', description: 'Find out what your London flat, house or HMO should let for. A free written rental valuation from an independent local letting agent.', alternates: { canonical: '/instant_valuation' } }

export default function Valuation() {
  return (
    <>
      <PageTop eyebrow="Free valuation" title="What could your property earn?" photo="valuation" lead="Tell us a little about it and we’ll send a written lettings valuation on our letterhead: what it should let for today, and what would help it let faster." />
      <section className="block" style={{ paddingTop: 56 }}><div className="wrap"><div className="card" style={{ maxWidth: 860 }}>
        <Enquiry kind="valuation" submit="Send my valuation request" fields={[
          { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'phone', label: 'Phone number', type: 'tel', required: true }, { name: 'postcode', label: 'Postcode', required: true },
          { name: 'address', label: 'Property address', full: true },
          { name: 'type', label: 'Property type', type: 'select', options: ['Flat', 'Studio', 'Terraced house', 'Semi-detached house', 'Detached house', 'House share (HMO)'] },
          { name: 'bedrooms', label: 'Bedrooms', type: 'select', options: ['Studio', '1', '2', '3', '4', '5', '6', '7+'] },
          { name: 'service', label: 'Interested in', type: 'select', options: ['Let only', 'Full management', 'HMO management', 'Not sure yet'] },
          { name: 'message', label: 'Anything else?', type: 'textarea' },
        ]} />
      </div></div></section>
    </>
  )
}

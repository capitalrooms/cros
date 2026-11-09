import type { Metadata } from 'next'
import { OFFICE } from '@/lib/website/site'
import { PageTop } from '../parts'
import Enquiry from '../Enquiry'

export const metadata: Metadata = { title: 'Contact us', description: 'Call 0207 112 9163, email info@capitalrooms.co.uk, or send us a message.' }

export default function Contact() {
  return (
    <>
      <PageTop eyebrow="Contact us" title="Talk to a real person." lead="Call, email, or send a message — we’ll come back to you quickly." />
      <section className="block" style={{ paddingTop: 56 }}><div className="wrap grid2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ gap: 18 }}>
          <div><p className="eyebrow">Phone</p><a className="disp" style={{ fontSize: 34, textDecoration: 'none' }} href={OFFICE.phoneHref}>{OFFICE.phone}</a></div>
          <div><p className="eyebrow">Email</p><a style={{ fontSize: 20, fontWeight: 600 }} href={`mailto:${OFFICE.email}`}>{OFFICE.email}</a></div>
          <div><p className="eyebrow">Office</p><p>{OFFICE.address}</p></div>
        </div>
        <div className="card">
          <h2 className="h3">Send us a message</h2>
          <Enquiry kind="contact" submit="Send message" fields={[
            { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'found', label: 'How did you find us?' },
            { name: 'budget', label: 'Budget (£ a month)' }, { name: 'move_in', label: 'Move-in date', type: 'date' },
            { name: 'message', label: 'Message', type: 'textarea', required: true },
          ]} />
        </div>
      </div></section>
    </>
  )
}

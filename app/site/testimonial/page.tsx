import type { Metadata } from 'next'
import { PageTop, Reviews } from '../parts'
export const metadata: Metadata = { title: 'Testimonials', description: 'What our landlords and tenants say about Capital Rooms on Google.' }
export default function Testimonials() {
  return (
    <>
      <PageTop eyebrow="Our Google reviews" title="What people say." />
      <section className="block" style={{ paddingTop: 56 }}><div className="wrap"><Reviews /></div></section>
    </>
  )
}

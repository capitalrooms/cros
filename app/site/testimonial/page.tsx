import type { Metadata } from 'next'
import { PageTop, Reviews } from '../parts'
export const metadata: Metadata = { title: 'Reviews from Our Landlords and Tenants', description: 'Read what London landlords and tenants say about Capital Rooms on Google: a personal, responsive letting agent and well-kept homes.', alternates: { canonical: '/testimonial' } }
export default function Testimonials() {
  return (
    <>
      <PageTop eyebrow="Our Google reviews" title="What people say." />
      <section className="block" style={{ paddingTop: 56 }}><div className="wrap"><Reviews /></div></section>
    </>
  )
}

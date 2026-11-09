import type { Metadata } from 'next'
import { PageTop, Reviews, Stars } from '../parts'
import { GOOGLE_RATING } from '@/lib/website/site'
export const metadata: Metadata = { title: 'Reviews from Our Landlords and Tenants', description: `Rated ${GOOGLE_RATING.stars} from ${GOOGLE_RATING.count} Google reviews. Read what London landlords and tenants say about Capital Rooms: a personal, responsive letting agent.`, alternates: { canonical: '/testimonial' } }
export default function Testimonials() {
  return (
    <>
      <PageTop eyebrow="Our Google reviews" title="What people say.">
        <p className="lead load3" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><Stars /><span><strong>{GOOGLE_RATING.stars} out of 5</strong> from {GOOGLE_RATING.count} reviews on Google</span></p>
      </PageTop>
      <section className="block" style={{ paddingTop: 56 }}><div className="wrap"><Reviews /></div></section>
    </>
  )
}

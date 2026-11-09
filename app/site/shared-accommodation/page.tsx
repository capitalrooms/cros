import type { Metadata } from 'next'
import { PageTop } from '../parts'
import HomesList from '../HomesList'
import HomesMapSection from '../HomesMapSection'
export const metadata: Metadata = { title: 'Rooms to Rent in London: Furnished, Bills Included', description: 'Furnished rooms to rent in well-kept shared homes across London, bills included. Meet your housemates before you move in and report repairs in our app.', alternates: { canonical: '/shared-accommodation' } }
export default function Shared() {
  return (
    <>
      <PageTop eyebrow="To rent" title="Rooms in shared homes." lead="Fully furnished, bills included, in well-kept houses across London." />
      <section className="block" style={{ paddingTop: 48 }}><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <HomesList whole={false} />
      </div></section>
      <section className="block" style={{ paddingTop: 64 }}><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 className="h3">Flats and houses</h2><HomesList whole />
      </div></section>
      <HomesMapSection />
    </>
  )
}

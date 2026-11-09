import type { Metadata } from 'next'
import { PageTop } from '../parts'
import HomesList from '../HomesList'
export const metadata: Metadata = { title: 'Homes to rent', description: 'Flats, houses and rooms to rent across London from Capital Rooms.' }
// the menu's "Rent": everything to let — whole homes first, then rooms (9 Nov 2026, Harry couldn't find a room here)
export default function Residential() {
  return (
    <>
      <PageTop eyebrow="To rent" title="Homes to rent." lead="Flats, houses and rooms across London — ready to view." />
      <section className="block" style={{ paddingTop: 48 }}><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 className="h3">Flats and houses</h2><HomesList whole />
      </div></section>
      <section className="block" style={{ paddingTop: 64 }} id="rooms"><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 className="h3">Rooms in shared homes</h2><HomesList whole={false} />
      </div></section>
    </>
  )
}

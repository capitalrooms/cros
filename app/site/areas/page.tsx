// Areas we cover (9 Nov 2026): the parts of London where we let and manage homes, each with its own page.
import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { websiteHomes } from '@/lib/website/homes'
import { AREAS, areaFor } from '@/lib/website/areas'
import { PageTop } from '../parts'
import HomesMapSection from '../HomesMapSection'

export const revalidate = 3600
export const metadata: Metadata = {
  title: 'Areas We Cover: Letting Agent in East and South East London',
  description: 'We let and manage rooms, flats and shared houses in Stratford, Canada Water, Rotherhithe, Deptford, Canary Wharf, Canning Town, East Ham and Pimlico.',
  alternates: { canonical: '/areas' },
}

export default async function Areas() {
  const [b, homes] = await Promise.all([siteBase(), websiteHomes()])
  const free = (slug: string) => homes.filter(h => areaFor(h.lat, h.lng)?.slug === slug).length
  return (
    <>
      <PageTop eyebrow="Areas we cover" title="Where we let and manage homes." lead="Most of our homes are in east and south east London, close to Canary Wharf, the City and the Jubilee and Elizabeth lines. Pick an area to see what’s free and what rooms there let for." />
      <section className="block" style={{ paddingTop: 48 }}><div className="wrap">
        <div className="grid3">
          {AREAS.map(a => { const n = free(a.slug); return (
            <Link key={a.slug} href={`${b}/areas/${a.slug}`} className="card area-card rise">
              <span className="eyebrow" style={{ margin: 0 }}>{a.districts.join(', ')} · {a.zone}</span>
              <span className="disp" style={{ fontSize: 30, lineHeight: 1.05 }}>{a.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 15 }}>{a.stations[0]}</span>
              <span className="area-free">{n ? `${n} free now` : 'See the area'} <span aria-hidden="true">→</span></span>
            </Link>
          ) })}
        </div>
      </div></section>
      <HomesMapSection />
    </>
  )
}

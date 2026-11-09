// The London map under the listings: every home on the website that we can place (9 Nov 2026).
import { websiteHomes } from '@/lib/website/homes'
import HomesMap, { type MapHome } from './HomesMap'

export default async function HomesMapSection() {
  const homes = (await websiteHomes()).filter(h => h.lat != null && h.lng != null) as MapHome[]
  if (!homes.length) return null
  return <section className="block" style={{ paddingTop: 80 }}><div className="wrap"><HomesMap homes={homes} /></div></section>
}

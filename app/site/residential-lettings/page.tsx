import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { PageTop } from '../parts'
import HomesList from '../HomesList'
export const metadata: Metadata = { title: 'Flats and houses to rent', description: 'Flats and houses to rent across London from Capital Rooms.' }
export const revalidate = 300
export default async function Residential() {
  const b = await siteBase()
  return (
    <>
      <PageTop eyebrow="To let" title="Flats and houses." lead="Whole homes across London, ready to view.">
        <p className="load3"><Link href={`${b}/shared-accommodation`} style={{ fontWeight: 600 }}>Looking for a room in a shared home? →</Link></p>
      </PageTop>
      <section className="block" style={{ paddingTop: 48 }}><div className="wrap"><HomesList whole /></div></section>
    </>
  )
}

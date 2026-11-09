import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { PageTop } from '../parts'
import HomesList from '../HomesList'
export const metadata: Metadata = { title: 'Rooms in shared homes', description: 'Fully furnished rooms with bills included in well-kept shared homes across London.' }
export const revalidate = 300
export default async function Shared() {
  const b = await siteBase()
  return (
    <>
      <PageTop eyebrow="To let" title="Rooms in shared homes." lead="Fully furnished, bills included, in well-kept houses across London.">
        <p className="load3"><Link href={`${b}/residential-lettings`} style={{ fontWeight: 600 }}>Looking for a whole flat or house? →</Link></p>
      </PageTop>
      <section className="block" style={{ paddingTop: 48 }}><div className="wrap"><HomesList whole={false} /></div></section>
    </>
  )
}

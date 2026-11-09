import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { PageTop, Badges } from '../parts'

export const metadata: Metadata = { title: 'About us', description: 'Capital Rooms: an independent London letting and management agency.' }

export default async function About() {
  const b = await siteBase()
  return (
    <>
      <PageTop eyebrow="About us" title="Homes people want to come back to." photo="about" />
      <section className="block" style={{ paddingTop: 64 }}><div className="wrap"><div className="prose rise">
        <p>CapitalRooms offer modern, well maintained and stylish properties. Our all inclusive rents help to simplify your monthly budget and save you the hassle of bills each month. We provide our residents with a relaxing place they want to call home, not just a place to stay. Each room is fully furnished with contemporary furniture so you don’t have to go out and find all the essential furniture you wish was just included! The same goes for the rest of the house, so you can arrive with just a suitcase.</p>
        <p>It’s also important you have a space to spend time with your flatmates so all of our properties have both a kitchen and a lounge. Our tenants are young and likeminded working professionals who are always excited to meet their new housemates!</p>
        <p>Our stock ranges from quality, affordable and fully furnished double bedrooms to high-end luxury dockside rooms with en-suites and river views.</p>
        <p style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="btn" href={`${b}/landlords`}>For landlords</Link><Link className="line" href={`${b}/contact`}>Contact us</Link></p>
      </div></div></section>
      <section className="block"><div className="wrap"><Badges /></div></section>
    </>
  )
}

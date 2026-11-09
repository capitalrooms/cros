// An area page (9 Nov 2026): rooms and flats to rent in one part of London, what our rooms there let for, getting
// about, and our letting service for landlords there. Built from our own homes and rents, so each page is real.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { websiteHomes } from '@/lib/website/homes'
import { AREAS, areaBySlug, areaFor, areaRoomRents } from '@/lib/website/areas'
import { TIERS, OFFICE } from '@/lib/website/site'
import { PageTop, Reviews, Tick } from '../../parts'
import { HomeCards } from '../../HomesList'

export const revalidate = 3600
export function generateStaticParams() { return AREAS.map(a => ({ slug: a.slug })) }
const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = areaBySlug((await params).slug)
  if (!a) return { title: 'Not found', robots: { index: false } }
  return {
    title: `Rooms and Flats to Rent in ${a.name} | Letting Agent ${a.districts.join(', ')}`,
    description: `Rooms and flats to rent in ${a.name}, London ${a.districts.join(', ')}, from an independent local letting agent. See what's free now and what rooms let for. Landlords: let only 5%, management from 8% + VAT.`,
    alternates: { canonical: `/areas/${a.slug}` },
  }
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = areaBySlug((await params).slug)
  if (!a) notFound()
  const [b, all, rents] = await Promise.all([siteBase(), websiteHomes(), areaRoomRents()])
  const homes = all.filter(h => areaFor(h.lat, h.lng)?.slug === a.slug)
  const rent = rents[a.slug]
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://capitalrooms.co.uk' },
    { '@type': 'ListItem', position: 2, name: 'Areas we cover', item: 'https://capitalrooms.co.uk/areas' },
    { '@type': 'ListItem', position: 3, name: a.name, item: `https://capitalrooms.co.uk/areas/${a.slug}` },
  ] }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />
      <PageTop eyebrow={`Area guide · ${a.districts.join(', ')}`} title={`Rooms and flats to rent in ${a.name}.`} lead={a.intro}>
        <p style={{ margin: '18px 0 0', fontSize: 14 }}><Link href={`${b}/areas`}>Areas we cover</Link> <span aria-hidden="true">›</span> {a.name}</p>
      </PageTop>

      <section className="block" style={{ paddingTop: 40 }}><div className="wrap">
        <div className="grid3 area-facts">
          <div className="card"><p className="eyebrow" style={{ margin: 0 }}>Travel zone</p><strong className="disp" style={{ fontSize: 30 }}>{a.zone}</strong></div>
          <div className="card"><p className="eyebrow" style={{ margin: 0 }}>Getting about</p><ul className="area-list">{a.stations.map(s => <li key={s}>{s}</li>)}</ul></div>
          <div className="card"><p className="eyebrow" style={{ margin: 0 }}>What our rooms here let for</p>
            {rent ? <><strong className="disp" style={{ fontSize: 30 }}>{rent.from === rent.to ? gbp(rent.from) : `${gbp(rent.from)} to ${gbp(rent.to)}`}</strong><span style={{ color: 'var(--muted)', fontSize: 15 }}>a month, across the {rent.count} rooms we manage in {a.name}.</span></>
              : <span style={{ color: 'var(--muted)' }}>Ask us: we’ll tell you what rooms and flats here let for today.</span>}
          </div>
        </div>
      </div></section>

      <section className="block" style={{ paddingTop: 64 }} id="homes"><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 className="h2">Free in {a.name} now</h2>
        {homes.length ? <HomeCards homes={homes} /> : (
          <div className="card"><h3 className="h3" style={{ margin: 0 }}>Nothing free in {a.name} this week</h3>
            <p style={{ color: 'var(--muted)', margin: 0 }}>Rooms here come up often. <Link href={`${b}/residential-lettings`}>See everything we have free</Link>, or call {OFFICE.phone} and we’ll tell you when one comes up.</p></div>
        )}
      </div></section>

      <section className="block" style={{ paddingTop: 64 }}><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 className="h2">Living in {a.name}</h2>
        <ul className="area-ticks">{a.living.map(l => <li key={l}><Tick />{l}</li>)}</ul>
      </div></section>

      <section className="block dark-block"><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p className="eyebrow" style={{ color: 'var(--lime)', margin: 0 }}>For landlords</p>
        <h2 className="h2" style={{ color: '#fff', margin: 0 }}>Letting agent in {a.name}</h2>
        <p className="lead" style={{ color: '#D7E2D9', margin: 0, maxWidth: 760 }}>{a.landlords}</p>
        <div className="area-fees">{TIERS.map(t => <div key={t.name}><span>{t.name}</span><strong className="disp">{t.fee}</strong></div>)}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="btn gold-btn" href={`${b}/instant_valuation`}>Free rental valuation</Link><Link className="line on-dark" href={`${b}/landlords`}>How we look after landlords</Link></div>
      </div></section>

      <section className="block"><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 className="h2">What people say about us</h2>
        <Reviews limit={3} />
      </div></section>

      {a.nearby.length > 0 && <section className="block" style={{ paddingTop: 24 }}><div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="h3" style={{ margin: 0 }}>Nearby areas</h2>
        <div className="area-chips">{a.nearby.map(s => areaBySlug(s)).filter(Boolean).map(n => <Link key={n!.slug} href={`${b}/areas/${n!.slug}`}>{n!.name}</Link>)}<Link href={`${b}/areas`}>All areas</Link></div>
      </div></section>}
    </>
  )
}

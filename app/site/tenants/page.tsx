import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { TENANT_BENEFITS, TENANT_STEPS } from '@/lib/website/site'
import { PageTop, Tick, Reviews, hasPhoto } from '../parts'
import { TenantCalc } from '../Calculators'

export const metadata: Metadata = { title: 'Tenants', description: 'Renting with Capital Rooms: all-inclusive rent, furnished rooms, a cleaner, and a simple online move-in.' }

export default async function Tenants() {
  const b = await siteBase()
  return (
    <>
      <PageTop eyebrow="For tenants" title="Renting with Capital Rooms." photo="tenants" lead="Well-kept homes across London, and a team who answer.">
        <div className="load3" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Link className="btn" href={`${b}/residential-lettings`}>Flats and houses</Link><Link className="line" href={`${b}/shared-accommodation`}>Rooms in shared homes</Link></div>
      </PageTop>
      <section className="block"><div className="wrap">
        <h2 className="h2 rise" style={{ marginBottom: 28 }}>Our tenants benefit from</h2>
        <ul className="checks rise">{TENANT_BENEFITS.map(x => <li key={x}><Tick />{x}</li>)}</ul>
      </div></section>
      <section className="block"><div className="wrap">
        <div className="narrow">
          <p className="eyebrow">Moving in</p>
          <h2 className="h2" style={{ margin: '8px 0 20px' }}>Three simple steps.</h2>
          {TENANT_STEPS.map((s, i) => <div key={s.title} className="step"><span style={{ fontSize: 14, fontWeight: 600, color: '#6B7A70' }}>Step {i + 1}</span><h3 className="h3">{s.title}</h3><p style={{ color: 'var(--muted)' }}>{s.body}</p></div>)}
        </div>
      </div></section>
      <section className="block rise"><div className="wrap"><TenantCalc /><p style={{ marginTop: 14 }}><Link href={`${b}/page/9-guarantor-affordability-calculator`} style={{ fontWeight: 600 }}>Need a guarantor? Use the guarantor calculator →</Link></p></div></section>
      <section className="block"><div className="wrap"><h2 className="h2 rise" style={{ marginBottom: 32 }}>What our tenants say</h2><Reviews only="Tenant" limit={6} /></div></section>
    </>
  )
}

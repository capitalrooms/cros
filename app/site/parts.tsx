// Server-side pieces of the website (9 Nov 2026). Nothing here reads data; pages do.
import Link from 'next/link'
import { NAV, OFFICE, APP_LOGIN, PHOTOS } from '@/lib/website/site'
import reviews from '@/lib/website/content/reviews.json'
import MobileMenu from './MobileMenu'

export function Tick() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg> }

/** a photo slot — the photo when one is set (lib/website/site PHOTOS), else a quiet forest panel */
export function Photo({ k, className = '', alt = '', tone }: { k: string; className?: string; alt?: string; tone?: 'sage' }) {
  const src = PHOTOS[k]
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={`ph ${tone ?? ''} ${className}`}>{src ? <img src={src} alt={alt} loading="lazy" /> : null}</div>
}

export function Header({ here, b = '' }: { here?: string; b?: string }) {
  return (
    <header className="top">
      <div className="wrap">
        <Link href={b || '/'} aria-label="Capital Rooms home"><img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 30, width: 'auto', display: 'block' }} /></Link>
        <MobileMenu>
          {NAV.map(([t, h]) => <Link key={h} href={b + h}>{t}</Link>)}
        </MobileMenu>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="line sm hide-sm" href={APP_LOGIN}>Log in</a>
          <Link className="btn sm hide-xs" href={`${b}/instant_valuation`}>Free valuation</Link>
        </div>
      </div>
    </header>
  )
}

export function Badges({ dark = false }: { dark?: boolean }) {
  const v = dark ? 'white' : 'ink'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: dark ? 'flex-start' : 'center', gap: dark ? 26 : 44 }}>
      <img src={`/brand/tpo-${v}.png`} alt="Member of The Property Ombudsman" style={{ height: dark ? 26 : 34, width: 'auto' }} />
      <img src={`/brand/cmp-${v}.png`} alt="ClientMoney Protect" style={{ height: dark ? 19 : 24, width: 'auto' }} />
      <img src={`/brand/dps-${v}.png`} alt="Deposits protected with the DPS" style={{ height: dark ? 28 : 36, width: 'auto' }} />
      <img src={`/brand/google-${v}.png`} alt="Google reviews" style={{ height: dark ? 34 : 42, width: 'auto' }} />
    </div>
  )
}

export function Footer({ b = '' }: { b?: string }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="cols">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <img src="/brand/lockup-white.png" alt="Capital Rooms" style={{ height: 34, width: 'auto', alignSelf: 'flex-start' }} />
            <p style={{ fontSize: 14, lineHeight: 1.7, color: '#B9C7BC' }}>{OFFICE.address}<br /><a href={OFFICE.phoneHref}>{OFFICE.phone}</a> · <a href={`mailto:${OFFICE.email}`}>{OFFICE.email}</a></p>
          </div>
          <nav aria-label="Landlords"><strong>Landlords</strong><Link href={`${b}/instant_valuation`}>Instant valuation</Link><Link href={`${b}/landlords`}>Landlords</Link><Link href={`${b}/maintenance-services`}>Maintenance</Link></nav>
          <nav aria-label="Tenants"><strong>Tenants</strong><Link href={`${b}/residential-lettings`}>Flats and houses</Link><Link href={`${b}/shared-accommodation`}>Shared accommodation</Link><Link href={`${b}/tenants`}>Tenants</Link><Link href={`${b}/page/9-guarantor-affordability-calculator`}>Guarantor calculator</Link></nav>
          <nav aria-label="Company"><strong>Company</strong><Link href={`${b}/about-us`}>About us</Link><Link href={`${b}/blogs`}>Advice</Link><Link href={`${b}/contact`}>Contact us</Link><Link href={`${b}/testimonial`}>Testimonials</Link><a href={APP_LOGIN}>Log in</a></nav>
        </div>
        <div className="base">
          <Badges dark />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
            <a href="/website/documents/aml-certificate.pdf" style={{ fontSize: 13 }}>AML certificate</a>
            <a href="/website/documents/client-money-protection-certificate.pdf" style={{ fontSize: 13 }}>CMP certificate</a>
            <Link href={`${b}/page/6-update-your-communication-preference`} style={{ fontSize: 13 }}>Communication preferences</Link>
            <a href="/website/documents/complaints-procedure.pdf" style={{ fontSize: 13 }}>Complaints</a>
            <Link href={`${b}/privacy_policy`} style={{ fontSize: 13 }}>Privacy policy</Link>
          </div>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: '#8FA197' }}>© {new Date().getFullYear()} Capital Rooms</p>
      </div>
    </footer>
  )
}

export function Reviews({ only, limit }: { only?: 'Tenant' | 'Landlord'; limit?: number }) {
  const list = (reviews as { quote: string; name: string; role: string | null }[]).filter(r => !only || r.role === only).slice(0, limit ?? 99)
  return (
    <div className="grid3" style={{ alignItems: 'start' }}>
      {list.map((r, i) => (
        <figure key={i} className="bubble rise" style={{ margin: 0, ...(i % 3 === 1 ? { background: '#E4EBE3' } : {}) }}>
          <blockquote style={{ margin: 0 }}>“{r.quote}”</blockquote>
          <figcaption><strong>{r.name}{r.role ? ` · ${r.role}` : ''}</strong></figcaption>
        </figure>
      ))}
    </div>
  )
}

/** the top of an inner page: a short title band, optionally beside a photo */
export function PageTop({ eyebrow, title, lead, photo, children }: { eyebrow?: string; title: string; lead?: string; photo?: string; children?: React.ReactNode }) {
  return (
    <div className="wrap" style={{ display: 'grid', gridTemplateColumns: photo ? 'minmax(0,1.1fr) minmax(0,1fr)' : '1fr', gap: 40, alignItems: 'end', paddingTop: 64 }}>
      <div className="page-hero" style={{ padding: 0 }}>
        {eyebrow && <p className="eyebrow load">{eyebrow}</p>}
        <h1 className="h1 load2">{title}</h1>
        {lead && <p className="lead load3">{lead}</p>}
        {children}
      </div>
      {photo && <Photo k={photo} className="grow" alt="" />}
    </div>
  )
}

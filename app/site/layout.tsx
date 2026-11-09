// capitalrooms.co.uk (9 Nov 2026) — the public website, served from CROS. proxy.ts sends the domain here and lets it
// reach nothing else; on the app's own address it's the private preview at /site.
import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Figtree } from 'next/font/google'
import { siteBase } from '@/lib/website/base'
import { Header, Footer } from './parts'
import StandaloneToApp from './StandaloneToApp'
import './site.css'

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-bricolage', display: 'swap' })
const figtree = Figtree({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-figtree', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL('https://capitalrooms.co.uk'),
  title: { default: 'Capital Rooms — London lettings and property management', template: '%s · Capital Rooms' },
  description: 'Independent London letting agent: let only, single let and HMO management for landlords, and well-kept homes and rooms to rent across London.',
  openGraph: { siteName: 'Capital Rooms', locale: 'en_GB', type: 'website' },
  icons: { icon: '/favicon-32.png', apple: '/apple-touch-icon.png' },
  robots: { index: true, follow: true },
}
// unlike the app, people can zoom the website
export const viewport: Viewport = { themeColor: '#FBF8F1', width: 'device-width', initialScale: 1 }

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const b = await siteBase()
  return (
    <div className={`site ${bricolage.variable} ${figtree.variable}`}>
      <StandaloneToApp />
      <a href="#main" style={{ position: 'absolute', left: -9999 }}>Skip to content</a>
      <Header b={b} />
      <main id="main">{children}</main>
      <Footer b={b} />
    </div>
  )
}

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
  title: { default: 'London Letting Agent & HMO Property Management | Capital Rooms', template: '%s | Capital Rooms' },
  description: 'Independent London letting agent in Shoreditch. Let only 5%, single let 8%, HMO management 12% (+VAT), with your own landlord app. Rooms and flats to rent across London.',
  openGraph: { siteName: 'Capital Rooms', locale: 'en_GB', type: 'website', images: [{ url: '/og-capital-rooms.jpg', width: 1200, height: 630, alt: 'Capital Rooms: London lettings and property management' }] },
  twitter: { card: 'summary_large_image', images: ['/og-capital-rooms.jpg'] },
  // the round picture beside us in Google: the logo's circle on forest green, at sizes Google accepts (multiples of 48)
  icons: {
    icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/site-icon-48.png', sizes: '48x48', type: 'image/png' }, { url: '/site-icon-96.png', sizes: '96x96', type: 'image/png' }, { url: '/site-icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/site-apple-touch-icon.png',
  },
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

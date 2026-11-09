import { Suspense } from 'react'
import { headers } from 'next/headers'
import NavTrail from '@/app/components/NavTrail'
import type { Metadata, Viewport } from 'next'
import { Baloo_2 } from 'next/font/google'
import './globals.css'
import './globals-fonts.css'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'
import AuthFetchBridge from './components/AuthFetchBridge'
import Footer from './components/Footer'

export const dynamic = 'force-dynamic'

const baloo2 = Baloo_2({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-baloo-2',
})

export const metadata: Metadata = {
  title: 'Capital Rooms',
  description: 'Property management platform for tenants, contractors, cleaners and admins.',
  applicationName: 'Capital Rooms',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Capital Rooms',
  },
  icons: {
    icon: '/favicon-32.png',
    apple: '/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
  // the app's pages are private: keep them out of search (app/site/layout.tsx turns it back on for the website)
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#171717',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // the public website (proxy.ts marks it): its own clean page — none of the app's sign-in bridge, trail, footer or
  // offline worker (9 Nov 2026)
  if ((await headers()).get('x-cr-site') === '1') {
    return (
      <html lang="en-GB">
        <body>{children}</body>
      </html>
    )
  }
  return (
    <html lang="en" className={baloo2.variable}>
      <body className="flex flex-col min-h-screen">
        <AuthFetchBridge />
        <Suspense fallback={null}><NavTrail /></Suspense>
        <div className="flex-1">
          {children}
        </div>
        <Footer />
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}

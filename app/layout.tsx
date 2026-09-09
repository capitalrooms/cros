import type { Metadata, Viewport } from 'next'
import { Baloo_2 } from 'next/font/google'
import './globals.css'
import './globals-fonts.css'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'
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
}

export const viewport: Viewport = {
  themeColor: '#171717',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={baloo2.variable}>
      <body className="flex flex-col min-h-screen">
        <div className="flex-1">
          {children}
        </div>
        <Footer />
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}

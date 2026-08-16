import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'

export const dynamic = 'force-dynamic'

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
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
    <html lang="en" className={dmSans.variable}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}

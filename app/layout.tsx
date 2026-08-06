import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

export const dynamic = 'force-dynamic'

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
})

export const metadata: Metadata = {
  title: 'CROS',
  description: 'Capital Rooms Operating System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  )
}

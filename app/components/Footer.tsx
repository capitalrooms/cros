'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'

export default function Footer({ embedded = false }: { embedded?: boolean }) {
  const pathname = usePathname()
  // Admin draws its own copy at the end of its scrolling content (desktop), so the site-wide one stays out of it
  if (pathname.startsWith('/admin') && !embedded) return null
  // public pages draw their own footer (components/public/PublicShell)
  if (pathname === '/login' || pathname.startsWith('/landlord/onboard') || pathname.startsWith('/quote/') || pathname.startsWith('/pack/') || /^\/applicant\/(reserve|apply|review)/.test(pathname)) return null

  // Admin on a phone is a full-screen app (header, scrolling content, bottom tabs). A footer below it makes
  // the whole page scroll, dragging the header under the status bar and the tabs off the bottom — so on
  // phones the admin area has no footer. Desktop keeps it.
  const phoneHidden = pathname.startsWith('/admin') ? 'hidden md:block' : undefined

  return (
    <div className={phoneHidden}>
    <footer style={{ background: '#0d0d0d', padding: '44px 32px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      <Image
        src="/footer-logo.png"
        alt="Capital Rooms"
        width={120}
        height={120}
        priority
        style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          objectFit: 'cover',
          opacity: 0.55,
          filter: 'grayscale(30%)',
        }}
      />
      <p style={{
        fontFamily: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        fontSize: '9px',
        color: '#363636',
        margin: 0,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
      }}>
        © 2026 Capital Rooms Ltd &nbsp;·&nbsp; London
      </p>
    </footer>
    </div>
  )
}

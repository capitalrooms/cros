'use client'

import { PublicFooter } from '@/components/public/PublicFooter'
import { usePathname } from 'next/navigation'

export default function Footer({ embedded = false }: { embedded?: boolean }) {
  const pathname = usePathname()
  // Admin draws its own copy at the end of its scrolling content (desktop), so the site-wide one stays out of it
  if (pathname.startsWith('/admin') && !embedded) return null
  // public pages draw their own footer (components/public/PublicShell)
  if (pathname === '/login' || pathname === '/landlord' || pathname.startsWith('/l/') || pathname.startsWith('/landlord/onboard') || pathname.startsWith('/quote/') || pathname.startsWith('/book/') || pathname.startsWith('/e/') || pathname.startsWith('/pack/') || pathname.startsWith('/lu/') || /^\/applicant\/(reserve|apply|review)/.test(pathname)) return null

  // Admin on a phone is a full-screen app (header, scrolling content, bottom tabs). A footer below it makes
  // the whole page scroll, dragging the header under the status bar and the tabs off the bottom — so on
  // phones the admin area has no footer. Desktop keeps it.
  const phoneHidden = pathname.startsWith('/admin') ? 'hidden md:block' : undefined

  // the same footer as the public pages — credentials and address (Harry, 17 Oct 2026: one standard for everyone;
  // the old round-logo footer is gone)
  return <div className={phoneHidden}><PublicFooter /></div>
}

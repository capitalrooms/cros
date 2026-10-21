'use client'

// The one top bar for every user (21 Oct 2026, Harry: "we should have one top bar for all users … to save having
// loads of different top bars"). The admin bar, which was the most up to date: dark, back on the left, the logo in
// the middle, and on the right whatever the screen adds (e.g. Quick Notify), the notification bell and your account.
// Used by the admin layout, components/AppBar (every other screen) and the role home screens (DarkHeroHeader).
import Link from 'next/link'
import type { ReactNode } from 'react'
import Logo from '@/components/Logo'
import AccountMenu from '@/app/components/AccountMenu'
import StaffNotificationBell from '@/app/components/StaffNotificationBell'

export const TOP_BAR_HEIGHT = 56

export default function TopBar({ left, right, homeHref = '/home', position = 'static', account = true }: {
  left?: ReactNode
  right?: ReactNode
  homeHref?: string
  /** static: in the flow (admin shell) · sticky: stays at the top while the page scrolls · fixed: pinned (role homes) */
  position?: 'static' | 'sticky' | 'fixed'
  /** the bell and the account menu (off for public pages that pass their own) */
  account?: boolean
}) {
  const pos = position === 'fixed' ? 'fixed inset-x-0 top-0 z-50' : position === 'sticky' ? 'sticky top-0 z-50' : 'flex-shrink-0 z-40'
  return (
    <header className={`${pos} border-b border-white/5 bg-[#181614] text-white`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      <div className="mx-auto grid h-14 px-3 md:px-6" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div className="flex min-w-0 items-center">{left}</div>
        <div className="flex items-center justify-center">
          <Link href={homeHref} aria-label="Home" className="block transition-opacity hover:opacity-80">
            <Logo variant="emblem" height={32} invert priority />
          </Link>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {right}
          {account && <><StaffNotificationBell /><AccountMenu /></>}
        </div>
      </div>
    </header>
  )
}

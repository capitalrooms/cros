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

export default function TopBar({ left, right, homeHref = '/home', position = 'static', account = true, title, eyebrow }: {
  left?: ReactNode
  right?: ReactNode
  /** where you are (15 Nov 2026, Harry: "imagine you are an award winning app designer"): the page's name on the left,
   *  its section above it in small type — instead of a lone emblem in the middle that says nothing on a page you're
   *  already in. Without a title the bar keeps the emblem in the middle. */
  title?: string | null
  eyebrow?: string | null
  homeHref?: string
  /** static: in the flow (admin shell) · sticky: stays at the top while the page scrolls · fixed: pinned (role homes) */
  position?: 'static' | 'sticky' | 'fixed'
  /** the bell and the account menu (off for public pages that pass their own) */
  account?: boolean
}) {
  const pos = position === 'fixed' ? 'fixed inset-x-0 top-0 z-50' : position === 'sticky' ? 'sticky top-0 z-50' : 'flex-shrink-0 z-40'
  return (
    <header className={`cr-topbar ${pos} border-b border-white/5 bg-[var(--cr-bar)] text-white`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      {title ? (
        <div className="mx-auto flex h-14 items-center gap-2 px-3 md:gap-3 md:px-6">
          {/* back where there's somewhere to go back to; otherwise the emblem, which goes home */}
          {left || (
            <Link href={homeHref} aria-label="Home" className="cr-topbar-logo shrink-0 transition-opacity hover:opacity-80">
              <Logo variant="emblem" height={28} invert priority />
            </Link>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            {eyebrow && eyebrow !== title && <p className="cr-topbar-eyebrow truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/55">{eyebrow}</p>}
            <p className="cr-topbar-title truncate text-[16px] font-bold tracking-[-0.01em] md:text-[17px]">{title}</p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            {right}
            {account && <><StaffNotificationBell /><AccountMenu /></>}
          </div>
        </div>
      ) : (
      <div className="mx-auto grid h-14 px-3 md:px-6" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div className="flex min-w-0 items-center">{left}</div>
        <div className="flex items-center justify-center">
          <Link href={homeHref} aria-label="Home" className="cr-topbar-logo block transition-opacity hover:opacity-80">
            <Logo variant="emblem" height={32} invert priority />
          </Link>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {right}
          {account && <><StaffNotificationBell /><AccountMenu /></>}
        </div>
      </div>
      )}
    </header>
  )
}

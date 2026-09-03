'use client'

import Link from 'next/link'
import Logo from './Logo'

/**
 * The single top bar for every page, whatever the user's role.
 *
 * Grid: [left] [logo] [right]
 *  left  — back button (BackButton component) — always on the left per convention
 *  right — role-specific actions: sign out, Quick Notify, etc.
 *
 * The logo is centred and tapping it routes to the user's home dashboard.
 */
export default function AppBar({
  left,
  right,
  title,
}: {
  left?: React.ReactNode
  right?: React.ReactNode
  /** @deprecated — pass left={<BackButton />} instead */
  title?: string
}) {
  return (
    <nav
      className="bg-neutral-900 text-white border-b border-neutral-800 sticky top-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div
        className="mx-auto max-w-6xl py-md grid items-center gap-md"
        style={{
          gridTemplateColumns: '1fr auto 1fr',
          minHeight: 52,
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
        }}
      >
        {/* Left — back button */}
        <div className="justify-self-start min-w-0 flex items-center">
          {left ?? (title && (
            <p className="truncate text-sm font-medium text-white/70">{title}</p>
          ))}
        </div>

        {/* Centre — logo, links to home */}
        <div className="justify-self-center">
          <Link href="/home" aria-label="Home" className="block hover:opacity-80 transition-opacity">
            <Logo variant="emblem" height={30} invert priority />
          </Link>
        </div>

        {/* Right — sign out, quick notify, etc. */}
        <div
          className="min-w-0 flex items-center gap-md text-sm font-semibold text-white overflow-x-auto"
          style={{ justifyContent: 'flex-end' }}
        >
          {right}
        </div>
      </div>
    </nav>
  )
}

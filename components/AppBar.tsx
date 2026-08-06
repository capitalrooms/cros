'use client'

import Logo from './Logo'

/**
 * The single top bar for every page, whatever the user's role.
 *
 * Identical everywhere by design — the brand shouldn't change size or treatment
 * depending on who logged in, and it stops the bar being re-litigated per page.
 */
export default function AppBar({
  title,
  right,
}: {
  title?: string
  right?: React.ReactNode
}) {
  return (
    <nav className="bg-neutral-950 text-white border-b border-neutral-800 sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-lg py-md flex items-center justify-between gap-lg">
        {/* Logo - consistent sizing and positioning */}
        <div className="shrink-0 h-12 flex items-center">
          <Logo variant="mark" className="h-12 w-auto" invert priority />
        </div>

        {/* Page title - optional */}
        {title && (
          <div className="flex-1">
            <p className="text-sm font-semibold text-white/80">{title}</p>
          </div>
        )}

        {/* Right content - sign out, buttons, etc. */}
        {right && (
          <div className="flex items-center gap-md text-sm font-semibold text-white/90 ml-auto">
            {right}
          </div>
        )}
      </div>
    </nav>
  )
}

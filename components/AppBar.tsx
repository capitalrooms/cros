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
    <nav
      className="bg-neutral-950 text-white border-b border-neutral-800 sticky top-0 z-50"
      style={{
        // On an installed iPhone PWA the bar renders up under the status bar
        // (clock/battery/signal). Pad the top by the safe-area inset so the
        // black bar fills that strip and the content sits below it.
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div
        className="mx-auto max-w-6xl px-lg py-md grid items-center gap-md"
        style={{
          gridTemplateColumns: '1fr auto 1fr',
          minHeight: 52,
          // Keep the far-right control clear of the rounded corner / notch area
          // in landscape too.
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
        }}
      >
        {/* Left cell — optional page title */}
        <div className="justify-self-start min-w-0">
          {title && <p className="truncate text-sm font-medium text-white/70">{title}</p>}
        </div>

        {/* Centre cell — just the emblem, centred. One brand element, uncluttered. */}
        <div className="justify-self-center">
          <Logo variant="emblem" height={30} invert priority />
        </div>

        {/* Right cell — sign out, buttons, etc. Fills its track and pins content
            to the far right; min-w-0 lets long links truncate rather than push the
            page wide or shove the brand off-centre. */}
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

/**
 * App bar for pages. Accounts for iPhone safe-area (notch/status bar).
 * Positions content below the status bar so buttons aren't hidden.
 */

interface AppBarProps {
  right?: React.ReactNode;
  left?: React.ReactNode;
  title?: React.ReactNode;
}

export default function AppBar({ right, left, title }: AppBarProps) {
  return (
    <div className="sticky top-0 z-50 bg-neutral-900 text-white">
      {/* Safe-area spacer for iPhone notch/status bar */}
      <div className="h-safe-top" style={{ height: 'max(0px, env(safe-area-inset-top))' }} />

      {/* Actual app bar content */}
      <div className="px-lg py-md">
        <div className="flex items-center justify-between gap-md min-h-[44px]">
          {/* Left content */}
          {left && <div className="flex-shrink-0">{left}</div>}

          {/* Title (center, if provided) */}
          {title && <div className="flex-1 text-center font-bold">{title}</div>}

          {/* Right content (back button, etc.) */}
          {right && <div className="flex-shrink-0">{right}</div>}
        </div>
      </div>
    </div>
  )
}

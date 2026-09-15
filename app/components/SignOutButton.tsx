'use client'

/**
 * Standardised sign-out button used across all role dashboards.
 * Renders cleanly in any AppBar right slot.
 */

interface Props {
  onSignOut: () => void
}

export default function SignOutButton({ onSignOut }: Props) {
  return (
    <button
      onClick={onSignOut}
      className="flex items-center gap-xs text-sm font-medium text-white/60 hover:text-white transition-colors px-sm py-xs rounded-lg hover:bg-white/10"
      aria-label="Log out"
    >
      {/* Door/exit icon */}
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <path
          d="M3 1.5h5.5a.5.5 0 0 1 .5.5v2h1V2a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 2v11A1.5 1.5 0 0 0 3 14.5h5.5A1.5 1.5 0 0 0 10 13v-2H9v2a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 3 1.5z"
          fill="currentColor"
        />
        <path
          d="M11.354 10.146a.5.5 0 0 1-.708.708l-2.5-2.5a.5.5 0 0 1 0-.708l2.5-2.5a.5.5 0 1 1 .708.708L9.207 7.5l2.147 2.146z"
          fill="currentColor"
          transform="scale(-1,1) translate(-15,0)"
        />
        <path
          d="M6 7.5a.5.5 0 0 0 .5.5H13a.5.5 0 0 0 0-1H6.5a.5.5 0 0 0-.5.5z"
          fill="currentColor"
          transform="scale(-1,1) translate(-15,0)"
        />
      </svg>
      Log out
    </button>
  )
}

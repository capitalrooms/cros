'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * The one standard back control, top-right of the AppBar on every screen that
 * isn't a role's home dashboard (those keep Sign out in the same slot).
 *
 * Styled to match the sign-out control exactly — white, same weight, same
 * position — so navigation reads the same wherever you are, whatever your role.
 *
 * Pass `href` for a stable destination (preferred — survives deep links and
 * refreshes); omit it to fall back to browser history (`router.back()`).
 */
export default function BackButton({ href, label = 'Back' }: { href?: string; label?: string }) {
  const router = useRouter()
  const className =
    'shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm text-sm font-semibold text-white'
  const inner = (
    <>
      <span aria-hidden>←</span> {label}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }
  return (
    <button onClick={() => router.back()} className={className}>
      {inner}
    </button>
  )
}

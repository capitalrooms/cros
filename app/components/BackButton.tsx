'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Standard back control — top-right of the AppBar on every screen that
 * isn't a role's home dashboard.
 *
 * Renders as a chevron-in-circle icon only (no text label) so it reads
 * the same as a native iOS/Android back button and doesn't need to know
 * the destination name.
 *
 * Pass `href` for a stable destination (survives deep links and refreshes);
 * omit it to fall back to browser history (router.back()).
 */
export default function BackButton({ href }: { href?: string }) {
  const router = useRouter()
  const className =
    'shrink-0 transition-opacity hover:opacity-70 flex items-center justify-center'
  const icon = (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="17" cy="17" r="15" stroke="white" strokeWidth="1.2" opacity=".4" />
      <path
        d="M19.5 11.5l-5.5 5.5 5.5 5.5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )

  if (href) {
    return (
      <Link href={href} className={className} aria-label="Back">
        {icon}
      </Link>
    )
  }
  return (
    <button onClick={() => router.back()} className={className} aria-label="Back">
      {icon}
    </button>
  )
}

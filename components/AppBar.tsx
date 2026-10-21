'use client'

import TopBar from '@/app/components/TopBar'
import { useIsAdmin } from '@/lib/admin-context'

/**
 * The single top bar for every page, whatever the user's role.
 *
 * Now drawn by app/components/TopBar — the same bar as admin (back · logo · bell and account).
 *  left  — back button (BackButton component) — always on the left per convention
 *  right — anything extra the screen needs (the account menu with sign out is always there)
 *
 * When rendered inside the admin layout (AdminContext = true), returns null —
 * the admin layout provides its own header and this would create a triple bar.
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
  const isAdmin = useIsAdmin()
  if (isAdmin) return null
  // the one top bar for every user (app/components/TopBar, 21 Oct 2026) — the admin bar's look, bell and account menu
  return <TopBar position="sticky" right={right} left={left ?? (title && <p className="truncate text-sm font-medium text-white/70">{title}</p>)} />
}

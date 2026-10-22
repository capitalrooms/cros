'use client'

// The "page not found" screen. 22 Oct 2026: it used to list "your session expired (please log in again)" among the
// reasons, so a broken link looked like a sign-in problem (Harry, opening Alice from People). It now says only that
// the page doesn't exist, shows the address that failed, and offers Back and Home.
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NotFound() {
  const path = usePathname()
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100 px-lg">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-lg md:p-2xl">
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Page not found</p>
        <h1 className="mt-xs text-2xl font-bold text-neutral-900">This page doesn’t exist</h1>
        <p className="mt-sm text-sm text-neutral-600">The link may be out of date, or the page has moved. You’re still signed in.</p>
        {path && <p className="mt-md break-all rounded-lg bg-neutral-50 px-md py-sm font-mono text-xs text-neutral-500">{path}</p>}
        <div className="mt-lg flex gap-sm">
          <button type="button" onClick={() => history.length > 1 ? history.back() : (location.href = '/')} className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-bold text-neutral-900 hover:bg-neutral-50">Go back</button>
          <Link href="/" className="flex-1 rounded-xl bg-neutral-900 py-md text-center text-sm font-bold text-white hover:bg-neutral-800">Home</Link>
        </div>
        <p className="mt-lg text-xs text-neutral-500">If a link in CROS brought you here, tell us which one and we’ll fix it.</p>
      </div>
    </div>
  )
}

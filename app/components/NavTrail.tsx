'use client'

// Records each screen this tab visits (lib/navTrail) and its name — the page's main heading — so Back buttons can go
// to, and name, the screen you came from. Mounted once in the root layout; draws nothing.
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { recordVisit, nameVisit } from '@/lib/navTrail'

const NAMES: [RegExp, string][] = [
  [/^\/admin\/?$/, 'Dashboard'], [/^\/admin\/active-rooms/, 'All Units'], [/^\/admin\/properties\/[^/]+\/rooms\//, 'Room'],
  [/^\/admin\/properties\/[^/]+/, 'Property'], [/^\/admin\/lettings\/[^/]+/, 'Letting file'], [/^\/lettings\/?$/, 'Lettings'],
  [/^\/cleaner\/?$/, 'My cleans'], [/^\/contractor\/?$/, 'My jobs'], [/^\/tenant\/?$/, 'Home'], [/^\/landlord\/?$/, 'Home'],
]
const fallbackName = (path: string) => NAMES.find(([re]) => re.test(path))?.[1]
  ?? (path.split('/').filter(Boolean).pop() ?? 'Home').replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase())

function headingText(): string {
  const h = document.querySelector('main h1') ?? document.querySelector('h1')
  // innerText keeps the break between a heading's lines ("Your new / tenant."), textContent runs them together
  const t = ((h as HTMLElement | null)?.innerText ?? h?.textContent ?? '').replace(/\s+/g, ' ').trim()
  return t.length > 1 && t.length < 80 && !/^(loading|opening)/i.test(t) ? t : ''
}

export default function NavTrail() {
  const pathname = usePathname()
  const search = useSearchParams()
  useEffect(() => {
    const qs = search?.toString() ?? ''
    const url = qs ? `${pathname}?${qs}` : pathname
    recordVisit(url, pathname)
    nameVisit(url, fallbackName(pathname))
    // the heading usually arrives with the page's data — look again as it settles
    const timers = [300, 1200, 3000].map(ms => setTimeout(() => { const h = headingText(); if (h) nameVisit(url, h) }, ms))
    return () => timers.forEach(clearTimeout)
  }, [pathname, search])
  return null
}

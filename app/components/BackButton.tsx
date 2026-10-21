'use client'

// The back control for every screen and every role (17 Oct 2026 — Harry: "anywhere on the site if you go into a
// screen you can always go back to the previous screen … the text is tiny and doesn't look very professional").
// A clear pill on the dark top bar: ← Previous. (It named the screen it went back to, from that screen's heading —
// Harry, 17 Oct 2026: "says random names, safer to just call it previous".)
//   - came from another screen in this tab → goes back to it, exactly as you left it (its tab and filters are in its
//     address), and shows its name (lib/navTrail). Tab clicks on the same screen don't count as screens, so one press
//     always leaves the screen — browser back would step through every tab first.
//   - opened directly (a link, a refresh) → goes to `href`, the screen's natural parent
//   - neither → browser back
// On a phone it shrinks to the arrow with a short name.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { previousVisit, type TrailEntry } from '@/lib/navTrail'

const pill = 'group inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] pl-2 pr-3.5 text-[13px] font-medium text-white/90 transition-colors hover:border-white/30 hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70'

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true" className="shrink-0 transition-transform group-hover:-translate-x-0.5">
      <path d="M12 4.5L6.5 10l5.5 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function BackButton({ href, optional = false, onClick }: { href?: string; /** kept so existing screens compile; the button always says Previous */ label?: string; /** draw nothing when there's nowhere to go back to (a section's own home) */ optional?: boolean; /** a step back inside a multi-step form (21 Oct 2026: tenant report-a-repair, housemate concern, contributions passed this and it was ignored — back left the form) */ onClick?: () => void }) {
  const router = useRouter()
  const [prev, setPrev] = useState<TrailEntry | null>(null)
  useEffect(() => {
    const read = () => setPrev(previousVisit())
    read()
    window.addEventListener('cros-trail', read)
    return () => window.removeEventListener('cros-trail', read)
  }, [])

  const name = 'Previous'
  const inner = (
    <>
      <Arrow />
      <span>{name}</span>
    </>
  )
  if (onClick) return <button type="button" onClick={onClick} className={pill} aria-label="Previous step">{inner}</button>
  if (prev) return <button type="button" onClick={() => router.push(prev.url)} className={pill} title="Previous screen" aria-label="Previous screen">{inner}</button>
  if (href) return <Link href={href} className={pill} title="Previous screen" aria-label="Previous screen">{inner}</Link>
  if (optional) return null
  return <button type="button" onClick={() => router.back()} className={pill} aria-label="Previous screen">{inner}</button>
}

/**
 * DarkHeroHeader
 *
 * Reusable dark-background hero section for role dashboards.
 *
 * Scroll behaviour — two layers:
 *  1. Fixed logo bar   — position:fixed (not sticky) so it never moves during
 *     iOS rubber-band / overscroll. A spacer div compensates for the bar being
 *     taken out of document flow. Safe-area inset fills dark bg behind status bar.
 *  2. Scrollable hero  — eyebrow label, large heading, stat tiles (children).
 *     Scrolls away as the user moves down the page.
 *
 * Tab strips below this header should use:
 *   className="sticky z-40"
 *   style={{ top: 'calc(env(safe-area-inset-top) + 52px)' }}
 * …so they snap to sit immediately under the fixed logo bar.
 *
 * Usage:
 *   <DarkHeroHeader
 *     eyebrow="Lettings"
 *     heading="Diary & Leads"
 *     topRight={<button onClick={signOut}>Sign out</button>}
 *   >
 *     (stat tiles or any other content)
 *   </DarkHeroHeader>
 */
import Link from 'next/link'
import Logo from '@/components/Logo'

export default function DarkHeroHeader({
  eyebrow,
  heading,
  topLeft,
  topRight,
  children,
}: {
  eyebrow: string
  heading: string
  /** Optional left slot — e.g. a back button. Empty keeps the logo centred. */
  topLeft?: React.ReactNode
  topRight?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="bg-neutral-950 text-white">

      {/* ── FIXED logo bar ──────────────────────────────────────────────── */}
      {/* Uses position:fixed (not sticky) so it never moves during iOS     */}
      {/* rubber-band / overscroll — sticky travels with the page on bounce */}
      {/* and clashes with the tab strip when it snaps back.                */}
      {/* left-0 right-0 makes it span full width without a width:100%      */}
      <div
        className="fixed top-0 left-0 right-0 z-50 bg-neutral-950 border-b border-neutral-800"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div
          className="py-md grid items-center gap-md px-lg"
          style={{ gridTemplateColumns: '1fr auto 1fr', minHeight: 52 }}
        >
          {/* Left */}
          <div className="justify-self-start min-w-0 flex items-center">
            {topLeft ?? <span />}
          </div>

          {/* Centre — logo */}
          <div className="justify-self-center">
            <Link href="/home" aria-label="Home" className="block hover:opacity-80 transition-opacity">
              <Logo variant="emblem" height={30} invert priority />
            </Link>
          </div>

          {/* Right — sign out / actions */}
          <div
            className="min-w-0 flex items-center gap-md text-sm font-semibold text-white overflow-x-auto"
            style={{ justifyContent: 'flex-end' }}
          >
            {topRight}
          </div>
        </div>
      </div>

      {/* ── Spacer — offsets the fixed bar from document flow ────────────── */}
      {/* Height must match the fixed bar: safe-area-inset-top + 52px.      */}
      <div style={{ height: 'calc(env(safe-area-inset-top) + 52px)' }} />

      {/* ── Scrollable hero ──────────────────────────────────────────────── */}
      {/* Eyebrow label, large heading, and slot for stat tiles / search.   */}
      <div
        className="px-lg pt-lg pb-xl"
        style={{
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
        }}
      >
        <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-xs">
          {eyebrow}
        </p>
        <h1
          className="text-3xl font-black tracking-tight mb-xl"
          style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)', textWrap: 'balance' }}
        >
          {heading}
        </h1>

        {children}
      </div>
    </div>
  )
}

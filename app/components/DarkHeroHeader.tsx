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
 *   style={{ top: 'calc(env(safe-area-inset-top) + 56px)' }}
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
import TopBar from '@/app/components/TopBar'

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
    <div className="cr-hero bg-[var(--cr-bar)] text-white">

      {/* the one top bar every user has (app/components/TopBar), pinned so it never moves on iOS overscroll */}
      <TopBar position="fixed" left={topLeft} right={topRight} />

      {/* ── Spacer — offsets the fixed bar from document flow ────────────── */}
      {/* Height must match the fixed bar: safe-area-inset-top + 56px.      */}
      <div style={{ height: 'calc(env(safe-area-inset-top) + 56px)' }} />

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

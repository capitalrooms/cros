/**
 * DarkHeroHeader
 *
 * Reusable dark-background hero section for role dashboards.
 * Matches AppBar exactly for the top bar (logo centred, actions right),
 * then extends downward with an eyebrow label, large heading, and a
 * children slot for stat tiles or anything else.
 *
 * Safe-area handling mirrors AppBar:
 *  • outer wrapper absorbs env(safe-area-inset-top/left/right) so the dark
 *    background fills correctly behind the phone status bar
 *  • inner wrapper adds visual content padding
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
    <div
      className="bg-neutral-950 text-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* ── Top bar — identical layout to AppBar ── */}
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

        {/* Right — actions */}
        <div
          className="min-w-0 flex items-center gap-md text-sm font-semibold text-white overflow-x-auto"
          style={{ justifyContent: 'flex-end' }}
        >
          {topRight}
        </div>
      </div>

      {/* ── Hero content — eyebrow, heading, slot ── */}
      <div className="px-lg pt-sm pb-xl">
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

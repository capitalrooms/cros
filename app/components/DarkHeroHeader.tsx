/**
 * DarkHeroHeader
 *
 * Reusable dark-background hero section for role dashboards that don't use
 * the standard AppBar (lettings, and any future role that adopts this style).
 *
 * Safe-area handling mirrors AppBar exactly:
 *  • outer wrapper absorbs env(safe-area-inset-top) so the dark bg fills
 *    behind the phone status bar
 *  • inner wrapper adds the visual content padding (pt-md / px-lg / pb-xl)
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
export default function DarkHeroHeader({
  eyebrow,
  heading,
  topRight,
  children,
}: {
  eyebrow: string
  heading: string
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
      <div className="px-lg pt-md pb-xl">
        {/* Top bar — brand name + action */}
        <div className="flex items-center justify-between mb-xl">
          <span className="text-sm font-black tracking-[0.15em] uppercase text-white/40 select-none">
            Capital Rooms
          </span>
          {topRight && (
            <div className="text-sm font-medium text-white/50">
              {topRight}
            </div>
          )}
        </div>

        {/* Eyebrow + heading */}
        <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-xs">
          {eyebrow}
        </p>
        <h1
          className="text-3xl font-black tracking-tight mb-xl"
          style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)', textWrap: 'balance' }}
        >
          {heading}
        </h1>

        {/* Slot for stat tiles, search bar, etc. */}
        {children}
      </div>
    </div>
  )
}

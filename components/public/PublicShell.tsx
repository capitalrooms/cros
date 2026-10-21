// The frame for every page CROS sends to people outside the office — tenants, applicants, landlords.
// Header, page, and the Capital Rooms footer (credentials + address) all come from here, so a change made once
// reaches every public page. Look agreed 5 Oct 2026: "C" (couture). Design canvas:
// https://claude.ai/artifact/SkenhjQXxEC1qEzbJiNCz9
import './public.css'
import { PublicFooter } from './PublicFooter'
import TopBar from '@/app/components/TopBar'

const FONTS = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap'

// the footer every page uses (components/public/PublicFooter) — re-exported for the pages that import it from here
export { PublicFooter }

export default function PublicShell({ label, children, centred = false, signedIn = false }: { label?: string; children: React.ReactNode; centred?: boolean; /** a signed-in user's screen (the landlord app): the one top bar every user has, not the public header (21 Oct 2026) */ signedIn?: boolean }) {
  return (
    <div className="pub flex min-h-screen flex-col">
      {/* React hoists this into <head> */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS} precedence="default" />
      {signedIn ? (
        <TopBar position="sticky" />
      ) : centred ? (
        // logo in the centre (Harry, 17 Oct 2026 — the landlord app); the page label on the right where there's room
        <header className="sticky top-0 z-40 grid items-center gap-4 px-6 py-4 md:px-14"
          style={{ gridTemplateColumns: '1fr auto 1fr', background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #E4E0D8', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <span aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 30, width: 'auto' }} />
          <span className="pub-eyebrow hidden min-w-0 truncate text-right md:block" style={{ color: '#111' }}>{label ?? ''}</span>
        </header>
      ) : (
        <header className="sticky top-0 z-40 flex items-center justify-between gap-4 px-6 py-4 md:px-14"
          style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #E4E0D8', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 30, width: 'auto' }} />
          {label && <span className="pub-eyebrow" style={{ color: '#111' }}>{label}</span>}
        </header>
      )}
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  )
}

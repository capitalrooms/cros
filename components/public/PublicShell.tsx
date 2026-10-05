// The frame for every page CROS sends to people outside the office — tenants, applicants, landlords.
// Header, page, and the Capital Rooms footer (credentials + address) all come from here, so a change made once
// reaches every public page. Look agreed 5 Oct 2026: "C" (couture). Design canvas:
// https://claude.ai/artifact/SkenhjQXxEC1qEzbJiNCz9
import './public.css'

const FONTS = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap'

export function PublicFooter() {
  return (
    <footer className="flex flex-col items-center gap-6 px-6 pb-9 pt-11 text-center" style={{ background: '#161616', color: '#F2F1ED' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark-white.png" alt="Capital Rooms" style={{ height: 46, width: 'auto' }} />
      <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4" style={{ maxWidth: 560 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/tpo-white.png" alt="Member of The Property Ombudsman" style={{ height: 28, width: 'auto' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/cmp-white.png" alt="ClientMoney Protect" style={{ height: 20, width: 'auto' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/dps-white.png" alt="Deposits protected with the DPS" style={{ height: 30, width: 'auto' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/google-white.png" alt="Google reviews, rated 4.9 out of 5" style={{ height: 36, width: 'auto' }} />
      </div>
      <p className="m-0 uppercase" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, lineHeight: 1.9, letterSpacing: '.14em', color: '#A19E97' }}>
        Hoxton Mix, 66 Paul Street, London EC2A 4NA<br />0207 112 9163 · management@capitalrooms.co.uk
      </p>
    </footer>
  )
}

export default function PublicShell({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="pub flex min-h-screen flex-col">
      {/* React hoists this into <head> */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <header className="sticky top-0 z-40 flex items-center justify-between gap-4 px-6 py-4 md:px-14"
        style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #E4E0D8', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 30, width: 'auto' }} />
        {label && <span className="pub-eyebrow" style={{ color: '#111' }}>{label}</span>}
      </header>
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  )
}

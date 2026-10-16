// The Capital Rooms footer — logo, credentials (TPO, ClientMoney Protect, DPS, Google reviews), address and phone.
// The standard for EVERY page (Harry, 17 Oct 2026): public pages draw it inside PublicShell, every other page gets it
// from app/components/Footer.
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

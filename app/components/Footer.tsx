import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-black border-t border-neutral-800 py-lg px-lg">
      <div className="mx-auto max-w-6xl flex flex-col items-center justify-center gap-lg">
        {/* Logo Wordmark - White Horizontal */}
        <div className="shrink-0">
          <Image
            src="/footer-logo.png"
            alt="Capital Rooms"
            width={483}
            height={138}
            priority
            className="opacity-100 hover:opacity-90 transition-opacity"
            style={{ width: 'auto', height: '92px' }}
          />
        </div>

        {/* Tagline */}
        <div
          className="text-sm text-neutral-300 text-center"
          style={{
            fontFamily: 'HelveticaNeue, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
            letterSpacing: '0.08em',
            fontWeight: 400,
            fontStyle: 'italic',
          }}
        >
          Innovating London living, since 2018
        </div>

        {/* Copyright */}
        <div
          className="text-sm text-neutral-300 text-center"
          style={{
            fontFamily: 'HelveticaNeue, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
            letterSpacing: '0.08em',
            fontWeight: 700,
            fontStyle: 'italic',
          }}
        >
          © 2026
        </div>
      </div>
    </footer>
  )
}

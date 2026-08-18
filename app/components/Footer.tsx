import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-neutral-900 border-t border-neutral-800 py-3xl px-lg">
      <div className="mx-auto max-w-6xl flex flex-col items-center justify-center gap-3xl">
        {/* Logo Wordmark - White Horizontal */}
        <div className="shrink-0">
          <Image
            src="/footer-logo.png"
            alt="Capital Rooms"
            width={420}
            height={120}
            priority
            className="opacity-100 hover:opacity-90 transition-opacity"
            style={{ width: 'auto', height: '80px' }}
          />
        </div>

        {/* Tagline */}
        <div
          className="text-sm text-neutral-300"
          style={{
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.08em',
            fontWeight: 300,
            fontStyle: 'italic',
          }}
        >
          Innovating London living since 2018.
        </div>
      </div>
    </footer>
  )
}

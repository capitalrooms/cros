import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-neutral-900 border-t border-neutral-800 py-3xl px-lg">
      <div className="mx-auto max-w-6xl flex flex-col items-center justify-center gap-lg">
        {/* Logo Wordmark */}
        <div className="shrink-0">
          <Image
            src="/logo.png"
            alt="Capital Rooms"
            width={140}
            height={90}
            className="opacity-100 hover:opacity-90 transition-opacity"
          />
        </div>

        {/* Tagline */}
        <div
          className="text-sm text-neutral-300 tracking-wide"
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

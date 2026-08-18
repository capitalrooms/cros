import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-neutral-900 border-t border-neutral-800 py-3xl px-lg">
      <div className="mx-auto max-w-6xl flex flex-col items-center justify-center gap-md">
        {/* Logo Wordmark */}
        <div className="shrink-0">
          <Image
            src="/logo.png"
            alt="Capital Rooms"
            width={120}
            height={80}
            className="opacity-90 hover:opacity-100 transition-opacity"
          />
        </div>

        {/* Tagline */}
        <div className="text-xs text-neutral-500 tracking-wide">
          Innovating London living since 2018.
        </div>
      </div>
    </footer>
  )
}

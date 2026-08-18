import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-neutral-900 border-t border-neutral-800 py-2xl px-lg">
      <div className="mx-auto max-w-6xl flex items-center justify-between gap-md">
        {/* Logo */}
        <div className="shrink-0">
          <Image
            src="/logo.png"
            alt="Capital Rooms"
            width={32}
            height={32}
            className="opacity-90 hover:opacity-100 transition-opacity"
          />
        </div>

        {/* Tagline */}
        <div className="text-sm text-neutral-400">
          Innovating London living since 2018.
        </div>
      </div>
    </footer>
  )
}

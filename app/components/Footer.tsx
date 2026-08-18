export default function Footer() {
  return (
    <footer className="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 border-t border-neutral-800 py-3xl px-lg">
      <div className="mx-auto max-w-6xl">
        {/* Main Content */}
        <div className="text-center space-y-md">
          {/* Year & Brand */}
          <div className="space-y-xs">
            <div
              className="text-5xl font-bold tracking-tight leading-tight"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #d1d5db 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontFamily: 'Georgia, "Playfair Display", serif',
                letterSpacing: '-0.02em',
              }}
            >
              Capital Rooms 2026
            </div>
          </div>

          {/* Tagline */}
          <div className="space-y-sm">
            <p
              className="text-sm tracking-wide text-neutral-400 uppercase"
              style={{
                letterSpacing: '0.15em',
                fontWeight: 300,
              }}
            >
              Innovating London living since 2018
            </p>
          </div>

          {/* Decorative Line */}
          <div className="flex items-center justify-center gap-md mt-lg pt-lg border-t border-neutral-800">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-700 to-transparent max-w-xs"></div>
            <span className="text-neutral-600">✦</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-700 to-transparent max-w-xs"></div>
          </div>
        </div>

        {/* Bottom Credit Line */}
        <div className="text-center mt-lg text-xs text-neutral-600">
          <p>Luxury property management for modern London</p>
        </div>
      </div>
    </footer>
  )
}

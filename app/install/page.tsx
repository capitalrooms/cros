'use client'

import Link from 'next/link'

/**
 * Install the app — PWA install guide.
 *
 * Explains why installing Capital Rooms as a PWA (Add to Home Screen)
 * is worth doing, what features are unlocked, and step-by-step
 * instructions for iOS and Android.
 *
 * No auth required — anyone can view this page, and it can be shared
 * with staff who haven't yet installed the app.
 */
export default function InstallPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-3xl">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-neutral-950/95 backdrop-blur border-b border-white/10 px-lg py-md flex items-center justify-between">
        <Link href="/home" className="text-white/50 hover:text-white text-sm font-semibold transition-colors">
          ← Back
        </Link>
        <p className="text-xs font-black tracking-[0.15em] uppercase text-white/60">Capital Rooms</p>
        <div className="w-12" />
      </div>

      <main className="mx-auto max-w-lg px-lg py-2xl">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <div className="mb-3xl">
          <div className="flex items-center gap-md mb-lg">
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-lg">
              📲
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Install the app</h1>
              <p className="text-white/50 text-sm mt-xs">Add to Home Screen — takes 10 seconds</p>
            </div>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            Capital Rooms is a web app — there's nothing to download from the App Store. But installing
            it to your home screen unlocks features that don't work in a browser tab.
          </p>
        </div>

        {/* ── Why install — features unlocked ─────────────────────────────── */}
        <div className="mb-3xl">
          <p className="text-xs font-black tracking-[0.12em] uppercase text-white/40 mb-lg">
            What you unlock by installing
          </p>

          <div className="space-y-sm">
            <FeatureCard
              icon="🔔"
              title="Push notifications"
              detail="Get alerted the moment a job is assigned, a tenant messages, a viewing is booked, or compliance is due — even when the app isn't open."
              unlocked
            />
            <FeatureCard
              icon="📤"
              title="Share directly into CROS"
              detail="From any app — Camera, Files, WhatsApp, Safari — tap Share and choose Capital Rooms. Photos, invoices, PDFs and links land straight into the upload flow."
              unlocked
            />
            <FeatureCard
              icon="🏠"
              title="One tap from your home screen"
              detail="Capital Rooms gets its own icon on your home screen. No browser chrome, no address bar — it opens full-screen like a native app."
              unlocked
            />
            <FeatureCard
              icon="📶"
              title="Offline access"
              detail="Recently loaded data stays available even without signal. Useful on site in properties with poor reception."
              unlocked
            />
            <FeatureCard
              icon="🔑"
              title="Instant key code access"
              detail="Your property key codes are one tap away from the home screen, not buried behind a login screen each time."
              unlocked
            />
          </div>
        </div>

        {/* ── What you miss without it ─────────────────────────────────────── */}
        <div className="mb-3xl rounded-2xl border border-white/10 bg-white/5 p-lg">
          <p className="text-xs font-black tracking-[0.12em] uppercase text-white/40 mb-md">
            Without installing
          </p>
          <ul className="space-y-sm text-sm text-white/60">
            <li className="flex items-start gap-sm">
              <span className="text-red-400 mt-px shrink-0">✕</span>
              No push notifications — you'd have to check the app manually to see new jobs or messages
            </li>
            <li className="flex items-start gap-sm">
              <span className="text-red-400 mt-px shrink-0">✕</span>
              Can't share photos or documents directly from other apps
            </li>
            <li className="flex items-start gap-sm">
              <span className="text-red-400 mt-px shrink-0">✕</span>
              Have to type the URL or find a bookmark every time
            </li>
            <li className="flex items-start gap-sm">
              <span className="text-red-400 mt-px shrink-0">✕</span>
              Browser shows address bar and tabs — feels like a website, not an app
            </li>
          </ul>
        </div>

        {/* ── iOS instructions ─────────────────────────────────────────────── */}
        <div className="mb-2xl">
          <p className="text-xs font-black tracking-[0.12em] uppercase text-white/40 mb-lg">
            How to install — iPhone / iPad
          </p>
          <div className="space-y-sm">
            <Step n={1} text="Open Capital Rooms in Safari (not Chrome or another browser)" />
            <Step n={2} text='Tap the Share button at the bottom of the screen — the box with an arrow pointing up ↑' />
            <Step n={3} text='Scroll down the share sheet and tap "Add to Home Screen"' />
            <Step n={4} text='Tap "Add" in the top-right corner' />
            <Step n={5} text="Capital Rooms now appears on your home screen — tap it to open the full app experience" />
          </div>
          <div className="mt-md rounded-xl bg-amber-950/60 border border-amber-800/40 px-md py-sm">
            <p className="text-xs text-amber-300 font-semibold">
              ⚠️ Must use Safari on iPhone — Chrome and other browsers don't support Add to Home Screen on iOS
            </p>
          </div>
        </div>

        {/* ── Android instructions ─────────────────────────────────────────── */}
        <div className="mb-3xl">
          <p className="text-xs font-black tracking-[0.12em] uppercase text-white/40 mb-lg">
            How to install — Android
          </p>
          <div className="space-y-sm">
            <Step n={1} text="Open Capital Rooms in Chrome" />
            <Step n={2} text='Tap the three-dot menu (⋮) in the top-right corner' />
            <Step n={3} text='Tap "Add to Home screen" or "Install app"' />
            <Step n={4} text='Tap "Add" or "Install" to confirm' />
            <Step n={5} text="Done — the Capital Rooms icon appears on your home screen" />
          </div>
          <div className="mt-md rounded-xl bg-blue-950/60 border border-blue-800/40 px-md py-sm">
            <p className="text-xs text-blue-300 font-semibold">
              💡 Chrome may also show an "Install" banner automatically at the bottom of the screen
            </p>
          </div>
        </div>

        {/* ── After installing ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-lg mb-3xl">
          <p className="text-sm font-bold text-white mb-sm">After installing</p>
          <p className="text-sm text-white/60 leading-relaxed">
            Open the app from your home screen and sign in. Then go to your profile settings
            to enable push notifications — you'll be prompted once. After that, Capital Rooms
            works exactly like a native app.
          </p>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <Link
          href="/home"
          className="block text-center w-full rounded-2xl bg-white text-neutral-950 font-black py-md px-lg text-sm hover:bg-neutral-100 transition"
        >
          Open Capital Rooms →
        </Link>

      </main>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureCard({
  icon, title, detail, unlocked,
}: {
  icon: string
  title: string
  detail: string
  unlocked?: boolean
}) {
  return (
    <div className="flex items-start gap-md rounded-2xl border border-white/10 bg-white/5 p-md">
      <span className="text-2xl leading-none mt-xs shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-sm flex-wrap">
          <p className="font-bold text-white text-sm">{title}</p>
          {unlocked && (
            <span className="text-xs font-semibold text-green-400 bg-green-400/10 px-sm py-xs rounded-full">
              ✓ Unlocked by installing
            </span>
          )}
        </div>
        <p className="text-sm text-white/50 mt-xs leading-relaxed">{detail}</p>
      </div>
    </div>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-md">
      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white/70 shrink-0 mt-px">
        {n}
      </div>
      <p className="text-sm text-white/70 leading-relaxed">{text}</p>
    </div>
  )
}

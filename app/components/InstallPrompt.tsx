'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'cr-install-dismissed-v1'

// Detect iOS vs Android
function useDevice() {
  const [device, setDevice] = useState<'ios' | 'android' | 'other'>('other')
  const [isInstalled, setIsInstalled] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    if (/iphone|ipad|ipod/.test(ua)) setDevice('ios')
    else if (/android/.test(ua))      setDevice('android')
    // Installed = running as standalone PWA
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches)
  }, [])
  return { device, isInstalled }
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [tab, setTab]         = useState<'ios' | 'android'>('ios')
  const { device, isInstalled } = useDevice()

  useEffect(() => {
    // Only show once per device, and never if already installed
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY)
      if (!dismissed && !isInstalled) {
        // Small delay so the dashboard loads first
        const t = setTimeout(() => setVisible(true), 1800)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [isInstalled])

  // Set tab to the user's device by default
  useEffect(() => {
    if (device === 'ios' || device === 'android') setTab(device)
  }, [device])

  function dismiss(permanently = true) {
    setVisible(false)
    if (permanently) {
      try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    }
  }

  if (!visible) return null

  const steps = {
    ios: [
      { icon: '⬆', title: 'Tap the Share button', desc: 'The box-with-arrow icon in the bottom toolbar of Safari.' },
      { icon: '➕', title: 'Tap "Add to Home Screen"', desc: 'Scroll down in the share sheet to find this option.' },
      { icon: '✓',  title: 'Tap "Add"', desc: 'Capital Rooms will appear on your home screen. You stay signed in automatically.' },
    ],
    android: [
      { icon: '⋮', title: 'Tap the menu in Chrome', desc: 'The three-dot icon in the top-right corner of your browser.' },
      { icon: '➕', title: 'Tap "Add to Home Screen"', desc: 'Chrome may also show an "Install app" banner at the bottom of the screen.' },
      { icon: '✓',  title: 'Tap "Install"', desc: 'Capital Rooms installs like a native app and keeps you signed in.' },
    ],
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={() => dismiss(false)}
      />

      {/* Sheet — slides up from the bottom, matching the app's dark design */}
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-neutral-950 border-t border-white/10 px-lg pb-safe pt-lg shadow-2xl"
        style={{ animation: 'slideUp .32s cubic-bezier(.32,0,.15,1)' }}>

        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-xl" />

        {/* Header */}
        <div className="flex items-center gap-md mb-lg">
          <div className="w-12 h-12 rounded-2xl bg-black border border-white/10 flex items-center justify-center flex-shrink-0"
            style={{ boxShadow: '0 0 0 1px rgba(196,146,42,.3)' }}>
            <span className="text-[10px] font-black text-white tracking-tight leading-tight text-center">
              CAP<br /><span style={{ color: '#C4922A' }}>ITAL</span>
            </span>
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Add to your home screen</p>
            <p className="text-white/40 text-xs mt-0.5">Access Capital Rooms in two taps — no browser needed</p>
          </div>
        </div>

        {/* Device tabs */}
        <div className="flex gap-sm mb-xl">
          {(['ios', 'android'] as const).map(d => (
            <button key={d} onClick={() => setTab(d)}
              className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${tab === d ? 'bg-white text-neutral-950' : 'border border-white/15 text-white/50'}`}>
              {d === 'ios' ? ' iPhone' : ' Android'}
            </button>
          ))}
        </div>

        {/* Steps */}
        <div className="space-y-md mb-xl">
          {steps[tab].map((s, i) => (
            <div key={i} className="flex items-start gap-md">
              <div className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center flex-shrink-0 text-sm text-white/60">
                {i + 1}
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-white text-sm font-semibold leading-tight">{s.title}</p>
                <p className="text-white/40 text-xs mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <button onClick={() => dismiss(true)}
          className="w-full rounded-full border border-white/25 py-3.5 text-sm font-medium tracking-wide text-white hover:bg-white hover:text-neutral-950 transition-colors mb-md">
          Got it
        </button>
        <button onClick={() => dismiss(false)}
          className="w-full text-center text-xs text-white/30 hover:text-white/60 transition-colors pb-sm">
          Maybe later
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

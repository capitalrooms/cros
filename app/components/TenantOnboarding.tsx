'use client'

// The welcome the first time a tenant opens the app (remade 21 Nov 2026 in the app's own colours and current features).
// Four short screens. Skip at any time. Seen once, remembered on this phone (localStorage flag cros-onboarded-tenant).
import { useState } from 'react'

const SCREENS = [
  { title: 'Welcome home', body: 'Everything about your home in one place: rent, repairs, the notice board and your housemates.', tip: 'Tap the tabs along the bottom to move around.' },
  { title: 'Report a repair', body: 'Tap Repairs, then Report a repair. Describe the problem and add photos if you can. We’ll arrange a contractor and let you know when they’re coming.', tip: 'For fire, gas or flooding, call 999 or the gas emergency line first. Don’t use the app for emergencies.' },
  { title: 'The house', body: 'See who lives here, post on the notice board, and find the house information. Tick off the jobs around the house, such as the bins, so housemates know it’s done.', tip: 'You can also keep a private record of anything you buy for the house. Only you can see it.' },
  { title: 'Ask anything', body: 'Ask about bin days, the WiFi, rent dates or who bought what for the house, and get an answer straight away.', tip: 'If the answer isn’t there, the office is one tap away.' },
]

export default function TenantOnboarding({ onComplete }: { onComplete: () => void }) {
  const [i, setI] = useState(0)
  const last = i === SCREENS.length - 1
  const finish = () => { try { localStorage.setItem('cros-onboarded-tenant', '1') } catch {} onComplete() }
  const s = SCREENS[i]

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#17332B', color: '#FFFFFF' }} role="dialog" aria-modal="true" aria-label="Welcome to Capital Rooms">
      <div className="flex items-center justify-between px-lg" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#E8B931' }}>{i + 1} of {SCREENS.length}</span>
        <button type="button" onClick={finish} className="text-sm font-semibold underline" style={{ color: '#D7E2DA' }}>Skip</button>
      </div>

      <div className="flex flex-1 flex-col justify-center px-lg">
        <h1 className="text-3xl font-extrabold leading-tight">{s.title}</h1>
        <p className="mt-md text-base leading-relaxed" style={{ color: '#E8EFEA' }}>{s.body}</p>
        <div className="mt-lg rounded-2xl p-md text-sm leading-relaxed" style={{ background: '#22443A', color: '#E8EFEA' }}>{s.tip}</div>
      </div>

      <div className="px-lg" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        <div className="mb-md flex justify-center gap-2" aria-hidden="true">
          {SCREENS.map((_, n) => (
            <span key={n} className="h-1.5 rounded-full" style={{ width: n === i ? 24 : 8, background: n === i ? '#E8B931' : '#3E6357' }} />
          ))}
        </div>
        <div className="flex gap-sm">
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)} className="flex-1 rounded-full border py-3 text-base font-semibold" style={{ borderColor: '#3E6357', color: '#FFFFFF' }}>Back</button>
          )}
          <button type="button" onClick={() => (last ? finish() : setI(i + 1))} className="flex-1 rounded-full py-3 text-base font-bold" style={{ background: '#E8B931', color: '#17332B' }}>
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

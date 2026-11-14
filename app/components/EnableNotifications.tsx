'use client'

import { useEffect, useState } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { enablePush, pushPermission, pushSupported } from '@/lib/push'

/**
 * A small "Turn on notifications" prompt. Hides itself once granted or if the
 * device can't do push. Drop it near the top of any dashboard.
 */
export default function EnableNotifications() {
  const [state, setState] = useState<'hidden' | 'prompt' | 'busy' | 'denied' | 'ios_install'>('hidden')

  useEffect(() => {
    if (!pushSupported()) {
      // iPhone/iPad only allow notifications once the app is on the home screen — say how, rather than hiding
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const standalone = (window.navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
      if (ios && !standalone) setState('ios_install')
      return
    }
    const p = pushPermission()
    if (p === 'granted') setState('hidden')
    else if (p === 'denied') setState('denied')
    else setState('prompt')
  }, [])

  async function turnOn() {
    setState('busy')
    try {
      const data = await getCurrentUser()
      const a = data?.assignment as any
      const res = await enablePush({
        id: a?.id,
        email: a?.email ?? data?.user?.email,
        role: a?.role,
      })
      setState(res.ok ? 'hidden' : res.reason === 'denied' ? 'denied' : 'prompt')
    } catch {
      setState('prompt')
    }
  }

  if (state === 'hidden') return null
  if (state === 'ios_install') {
    return (
      <div className="rounded-[20px] bg-[#FDF1D8] px-lg py-md text-sm text-[#14261F]">
        <p className="font-bold">Get notifications on your iPhone</p>
        <p className="mt-xs text-xs text-neutral-600">
          Tap the Share button <span aria-hidden="true">(□↑)</span> in Safari, choose <strong>Add to Home Screen</strong>, then open
          Capital Rooms from your home screen and tap “Turn on notifications”.
        </p>
      </div>
    )
  }
  if (state === 'denied') {
    return (
      <p className="rounded-[20px] bg-white px-lg py-md text-[13px] leading-snug text-[#4E6158] ring-1 ring-[#DCE5DD]">
        <b className="text-[#14261F]">Notifications are off for this app.</b> Turn them on in your phone’s Settings › Notifications › Capital Rooms, so new jobs and messages reach you.
      </p>
    )
  }
  return (
    <button
      onClick={turnOn}
      disabled={state === 'busy'}
      className="flex w-full items-center gap-md rounded-[20px] px-lg py-md text-left text-sm font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)] disabled:opacity-50"
      style={{ background: 'var(--cr-gold, #F2B84B)' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      <span>{state === 'busy' ? 'Turning on…' : 'Turn on notifications — so nothing new gets missed'}</span>
    </button>
  )
}

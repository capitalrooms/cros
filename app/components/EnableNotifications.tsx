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
      <div className="rounded-xl border-2 border-neutral-900 bg-white px-lg py-md text-sm text-neutral-800">
        <p className="font-bold">🔔 Get notifications on your iPhone</p>
        <p className="mt-xs text-xs text-neutral-600">
          Tap the Share button <span aria-hidden="true">(□↑)</span> in Safari, choose <strong>Add to Home Screen</strong>, then open
          Capital Rooms from your home screen and tap “Turn on notifications”.
        </p>
      </div>
    )
  }
  if (state === 'denied') {
    return (
      <p className="rounded-xl bg-neutral-100 px-lg py-md text-xs text-neutral-500">
        🔕 Notifications are blocked — turn them on in your browser/phone settings for this app.
      </p>
    )
  }
  return (
    <button
      onClick={turnOn}
      disabled={state === 'busy'}
      className="w-full rounded-xl border-2 border-neutral-900 bg-white px-lg py-md text-sm font-bold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
    >
      {state === 'busy' ? 'Enabling…' : '🔔 Turn on notifications'}
    </button>
  )
}
